import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig, publicModels } from './config.js';
import { AppError } from './errors.js';
import { JobStore, publicJob } from './jobs.js';
import { json, jsonBody, secretMatches } from './http.js';
import { SessionStore, sessionCookie } from './sessions.js';
import { prepareUpload } from './upload.js';
import { logEvent } from './logging.js';
import { publicDirectory as publicDir, staticFiles, clientVersion } from './assets.js';
import defaultSamples from '../samples/manifest.json' with { type: 'json' };

const samplesDir = new URL('../sample-images/', import.meta.url);

export function createServer(config = loadConfig(), {
  jobs, logger = console, samples = defaultSamples, sampleDirectory = samplesDir, loginAttemptsPerMinute = 20
} = {}) {
  jobs ??= new JobStore({ logger });
  const sessions = new SessionStore(jobs, { loginAttemptsPerMinute });
  let submissions = 0;
  let operatorAttempts = 0;
  let operatorWindow = Date.now();
  const prune = () => {
    jobs.prune();
    sessions.prune();
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
    const cookie = value => sessionCookie(value, secure);
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
      const sessionId = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('studio='))?.slice(7);
      if (req.method === 'GET' && path === '/samples/NOTICES.txt') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end(await readFile(new URL('samples/NOTICES.txt', publicDir)));
      }
      if (req.method === 'GET' && staticFiles.has(path)) {
        const [name, type] = staticFiles.get(path);
        res.setHeader('Content-Type', type);
        const content = await readFile(new URL(name, publicDir));
        return res.end(name === 'index.html' ? content.toString().replace('</head>', `<meta name="studio-version" content="${clientVersion}"></head>`) : content);
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
        if (!secretMatches(supplied, config.operatorToken)) {
          throw new AppError(401, 'operator-unauthorized', 'Separate operator authorization is required.');
        }
        if (path === '/api/operator/state') return json(res, 200, jobs.gate.state());
        if (path === '/api/operator/activate') {
          const data = await jsonBody(req, 'invalid-activation', 'Invalid activation request.');
          const owner = data.sessionOnly ? sessionId : null;
          if (data.sessionOnly && (!sessions.get(owner) || sessions.get(owner).expiresAt <= Date.now())) {
            throw new AppError(401, 'operator-session-required', 'A current demo session is required for session-only activation.');
          }
          jobs.gate.activate(data, config, owner);
          return json(res, 200, { activated: true });
        }
        throw new AppError(404, 'not-found', 'Not found.');
      }
      prune();
      const session = sessions.get(sessionId);
      if (path === '/api/session' && req.method === 'POST') {
        sessions.reserveLogin();
        const data = await jsonBody(req, 'invalid-request', 'Invalid access request.');
        const id = sessions.login(data, sessionId);
        return json(res, 200, { authenticated: true }, { 'Set-Cookie': cookie(id) });
      }
      if (path === '/api/config' && req.method === 'GET') {
        const open = config.limits.mode === 'unlimited' || jobs.gate.isOpenFor(sessionId);
        return json(res, 200, { authenticated: Boolean(session), clientVersion,
          models: publicModels(config).map(model => model.ready && !open ? { ...model, ready: false, reason: 'demo-budget-closed' } : model),
          maxImageMiB: 10, retentionMinutes: 10 });
      }
      if (path === '/api/session' && req.method === 'DELETE') {
        sessions.delete(sessionId);
        return json(res, 200, { cleared: true }, { 'Set-Cookie': cookie('') });
      }
      if (!session) throw new AppError(401, 'unauthorized', '다시 로그인해 주세요.');
      if (path === '/api/samples/manifest' && req.method === 'GET') {
        return json(res, 200, samples);
      }
      if (path.startsWith('/api/samples/') && req.method === 'GET') {
        const sample = samples.items.find(item => item.src === path);
        if (!sample || !/^[a-zA-Z0-9_-]+\.jpg$/.test(sample.filename)) {
          throw new AppError(404, 'sample-not-found', '샘플을 찾을 수 없습니다.');
        }
        res.setHeader('Content-Type', 'image/jpeg');
        return res.end(await readFile(new URL(sample.filename, sampleDirectory)));
      }
      if (path === '/api/jobs' && req.method === 'POST') {
        if (submissions >= 1) throw new AppError(429, 'busy', 'Studio is processing another upload. Try again later.');
        submissions++;
        try {
          const requestId = req.headers['x-request-id'];
          if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) throw new AppError(400, 'invalid-request-id', 'A unique request ID is required.');
          logEvent(logger, 'info', 'studio-request', { timestamp: Date.now(), requestId, stage: 'input-processing', status: 'running' });
          const { mode, models, person, garment, lowerGarment, fingerprint } = await prepareUpload(req, config, samples);
          const job = jobs.create(sessionId, requestId, fingerprint, models, config, person, garment, { mode, lowerGarment });
          logEvent(logger, 'info', 'studio-request', { timestamp: Date.now(), requestId, jobId: job.id, stage: 'accepted', status: 'running' });
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
      const requestId = req.headers['x-request-id'];
      if (req.url?.startsWith('/api/jobs')) logEvent(logger, 'error', 'studio-request', {
        timestamp: Date.now(), stage: 'request', status: 'failed', code: known ? error.code : 'internal-error',
        httpStatus: known ? error.status : 500,
        ...(typeof requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(requestId) ? { requestId } : {})
      });
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
