import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig, publicModels, selectModels } from './config.js';
import { AppError } from './errors.js';
import { MAX_REQUEST_BYTES, sanitizeImage } from './images.js';
import { JobStore, publicJob } from './jobs.js';
import { modeContract } from './modes.js';
import sampleManifest from '../public/samples/manifest.json' with { type: 'json' };

const publicDir = new URL('../public/', import.meta.url);
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'] };
const SESSION_TTL = 30 * 60 * 1000;

async function bodyBytes(req, limit) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > limit) throw new AppError(413, 'upload-too-large', 'Request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new AppError(413, 'upload-too-large', 'Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
}

export function createServer(config = loadConfig(), { jobs = new JobStore(), logger = console } = {}) {
  const sessions = new Map();
  let submissions = 0;
  let loginAttempts = 0;
  let loginWindow = Date.now();
  let operatorAttempts = 0;
  let operatorWindow = Date.now();
  const prune = () => {
    jobs.prune();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= Date.now()) {
        jobs.clearOwner(id);
        sessions.delete(id);
      }
    }
  };
  const interval = setInterval(prune, 30_000).unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const secure = config.origin.startsWith('https://');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const cookie = value => `studio=${value}; Path=/; HttpOnly; SameSite=Strict; ${secure ? 'Secure; ' : ''}Max-Age=${value ? SESSION_TTL / 1000 : 0}`;
    try {
      if (req.method === 'GET' && req.url === '/healthz') return json(res, 200, { status: 'ok' });
      const host = req.headers.host;
      let origin;
      try {
        origin = new URL(`http://${host}`);
      } catch {
        throw new AppError(400, 'invalid-host', 'Invalid request host.');
      }
      if (config.origin ? host !== new URL(config.origin).host :
          !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
          Number(origin.port || 80) !== req.socket.localPort) {
        throw new AppError(403, 'invalid-host', 'Request host is not allowed.');
      }
      const expectedOrigin = config.origin || origin.origin;
      if (req.headers.origin && req.headers.origin !== expectedOrigin) throw new AppError(403, 'cross-origin', 'Cross-origin requests are not allowed.');
      const path = new URL(req.url, expectedOrigin).pathname;
      if (req.method === 'GET' && /^\/samples\/(?:manifest\.json|NOTICES\.txt|[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png))$/.test(path)) {
        let bytes;
        try { bytes = await readFile(new URL(`.${path}`, publicDir)); } catch (cause) {
          if (cause.code !== 'ENOENT') throw cause;
          throw new AppError(404, 'sample-not-found', '샘플을 찾을 수 없습니다.');
        }
        res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json; charset=utf-8' :
          path.endsWith('.txt') ? 'text/plain; charset=utf-8' : path.endsWith('.png') ? 'image/png' : 'image/jpeg');
        return res.end(bytes);
      }
      if (req.method === 'GET' && staticFiles[path]) {
        const [name, type] = staticFiles[path];
        res.setHeader('Content-Type', type);
        return res.end(await readFile(new URL(name, publicDir)));
      }
      if (!path.startsWith('/api/')) throw new AppError(404, 'not-found', 'Not found.');
      if (!['GET', 'POST', 'DELETE'].includes(req.method)) throw new AppError(405, 'method-not-allowed', 'Method not allowed.');
      if (req.method !== 'GET' && req.headers['x-studio-request'] !== '1') throw new AppError(403, 'request-header-required', 'Studio request header required.');
      if (path.startsWith('/api/operator/')) {
        if (req.method !== 'POST' || !config.operatorToken) throw new AppError(404, 'not-found', 'Not found.');
        if (new URL(req.url, expectedOrigin).search) throw new AppError(400, 'operator-query-forbidden', 'Operator requests must not contain URL query parameters.');
        if (Date.now() - operatorWindow > 60_000) { operatorAttempts = 0; operatorWindow = Date.now(); }
        if (++operatorAttempts > 8) throw new AppError(429, 'operator-rate-limit', 'Too many operator requests. Wait one minute.');
        const supplied = req.headers['x-operator-token'];
        const digest = value => createHash('sha256').update(value).digest();
        if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(config.operatorToken))) {
          throw new AppError(401, 'operator-unauthorized', 'Separate operator authorization is required.');
        }
        if (path === '/api/operator/state') return json(res, 200, jobs.gate.state());
        if (path === '/api/operator/activate') {
          let data;
          try { data = JSON.parse((await bodyBytes(req, 2048)).toString()); } catch (cause) {
            if (cause instanceof AppError) throw cause;
            throw new AppError(400, 'invalid-activation', 'Invalid activation request.');
          }
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, 'invalid-activation', 'Invalid activation request.');
          jobs.gate.activate(data, config);
          return json(res, 200, { activated: true });
        }
        throw new AppError(404, 'not-found', 'Not found.');
      }
      prune();
      const sessionId = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('studio='))?.slice(7);
      let session = sessions.get(sessionId);
      if (path === '/api/session' && req.method === 'POST') {
        if (Date.now() - loginWindow > 60_000) { loginAttempts = 0; loginWindow = Date.now(); }
        if (++loginAttempts > 20) throw new AppError(429, 'login-rate-limit', 'Too many access attempts. Wait one minute.');
        let data;
        try { data = JSON.parse((await bodyBytes(req, 2048)).toString()); } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError(400, 'invalid-request', 'Invalid access request.');
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, 'invalid-request', 'Invalid access request.');
        const digest = value => createHash('sha256').update(value).digest();
        const usernameMatches = typeof data.username === 'string' && timingSafeEqual(digest(data.username), digest('test'));
        const passwordMatches = typeof data.password === 'string' && timingSafeEqual(digest(data.password), digest('test'));
        if (!usernameMatches || !passwordMatches || Object.keys(data).some(key => !['username', 'password'].includes(key))) {
          throw new AppError(401, 'unauthorized', '아이디 또는 비밀번호를 확인해 주세요.');
        }
        if (sessionId && session) { jobs.clearOwner(sessionId); sessions.delete(sessionId); }
        if (sessions.size >= 256) throw new AppError(503, 'session-capacity', 'Studio session capacity reached.');
        const id = randomBytes(32).toString('hex');
        sessions.set(id, { expiresAt: Date.now() + SESSION_TTL });
        return json(res, 200, { authenticated: true }, { 'Set-Cookie': cookie(id) });
      }
      if (path === '/api/config' && req.method === 'GET') {
        return json(res, 200, { authenticated: Boolean(session), models: publicModels(config), maxImageMiB: 10, retentionMinutes: 10 });
      }
      if (!session) throw new AppError(401, 'unauthorized', '다시 로그인해 주세요.');
      if (path === '/api/session' && req.method === 'DELETE') {
        jobs.clearOwner(sessionId);
        sessions.delete(sessionId);
        return json(res, 200, { cleared: true }, { 'Set-Cookie': cookie('') });
      }
      if (path === '/api/jobs' && req.method === 'POST') {
        if (submissions >= 1) throw new AppError(429, 'busy', 'Studio is processing another upload. Try again later.');
        submissions++;
        try {
          const requestId = req.headers['x-request-id'];
          if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) throw new AppError(400, 'invalid-request-id', 'A unique request ID is required.');
          if (!req.headers['content-type']?.startsWith('multipart/form-data;')) throw new AppError(400, 'invalid-upload', 'Use multipart form data.');
          const bytes = await bodyBytes(req, MAX_REQUEST_BYTES);
          let form;
          try {
            form = await new Request('http://localhost', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: bytes }).formData();
          } catch {
            throw new AppError(400, 'invalid-upload', 'Invalid multipart upload.');
          }
          if (form.getAll('mode').length > 1) throw new AppError(400, 'invalid-mode', 'Provide one clothing mode.');
          const mode = form.has('mode') ? form.get('mode') : 'baseline';
          if (form.has('mode') && mode === 'baseline') throw new AppError(400, 'invalid-mode', 'Select upper, lower or full.');
          const contract = modeContract(mode);
          const required = ['person', ...contract.fields, 'models', 'consent'];
          const allowed = form.has('mode') ? [...required, 'mode'] : required;
          if ([...form.keys()].some(key => !allowed.includes(key)) ||
              required.some(key => form.getAll(key).length !== 1)) {
            throw new AppError(400, 'invalid-upload', 'Provide exactly one person, garment, model selection and consent.');
          }
          if (form.get('consent') !== 'true') throw new AppError(400, 'consent-required', 'Photo transmission consent is required.');
          let selected;
          try { selected = JSON.parse(form.get('models')); } catch {
            throw new AppError(400, 'invalid-models', 'Invalid model selection.');
          }
          const personInput = form.get('person');
          if (personInput instanceof File) {
            const hash = createHash('sha256').update(Buffer.from(await personInput.arrayBuffer())).digest('hex');
            const sample = sampleManifest.items.find(item => item.category === 'person' && item.sha256 === hash);
            if (sample?.supportsModes && !sample.supportsModes.includes(mode === 'baseline' ? 'upper' : mode)) {
              throw new AppError(400, 'sample-mode-mismatch', '이 샘플은 상의용입니다. 전신 사진을 선택해 주세요.');
            }
          }
          const models = selectModels(selected, config);
          const person = await sanitizeImage(personInput, 'person');
          const garment = await sanitizeImage(form.get(contract.fields[0]), contract.fields[0]);
          const lowerGarment = mode === 'full' ? await sanitizeImage(form.get('lower'), 'lower') : undefined;
          const fingerprint = createHash('sha256').update(JSON.stringify([mode, models])).update(person).update(garment).update(lowerGarment || '').digest('hex');
          const job = jobs.create(sessionId, requestId, fingerprint, models, config, person, garment, { mode, lowerGarment });
          return json(res, 202, publicJob(job));
        } finally {
          submissions--;
        }
      }
      const match = /^\/api\/jobs\/([a-f0-9-]{36})(?:\/images\/(sunburst|mai))?$/.exec(path);
      if (match) {
        const job = jobs.get(match[1], sessionId);
        if (req.method === 'DELETE' && !match[2]) {
          jobs.delete(job.id, sessionId);
          return json(res, 200, { cleared: true });
        }
        if (req.method === 'GET') {
          if (!match[2]) return json(res, 200, publicJob(job));
          const image = job.results[match[2]]?.image;
          if (!image) throw new AppError(404, 'image-not-found', 'This model has no completed image.');
          res.setHeader('Content-Type', 'image/png');
          return res.end(image);
        }
      }
      throw new AppError(404, 'not-found', 'Not found.');
    } catch (error) {
      const known = error instanceof AppError;
      if (!known) logger.error('studio-request-failed', { code: 'internal-error' });
      if (!res.headersSent && !res.destroyed) {
        json(res, known ? error.status : 500, { error: { code: known ? error.code : 'internal-error', message: known ? error.message : 'An internal error occurred.' } });
      }
      req.resume();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on('close', () => { clearInterval(interval); jobs.close(); sessions.clear(); });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  const server = createServer(config);
  server.listen(config.port, config.host, () => console.log(`Try-on studio listening on ${config.host}:${config.port}; no automatic inference.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
