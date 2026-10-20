import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApi } from '../public/network.js';
import { assetVersion, staticFiles, publicDirectory, clientVersion } from '../src/assets.js';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

test('all served client assets contribute to version and module imports are explicitly served', async t => {
  const entries = await Promise.all([...staticFiles.values()].map(async ([name]) =>
    [name, await readFile(new URL(name, publicDirectory))]));
  assert.equal(assetVersion(entries), clientVersion);
  for (const [index, [name, content]] of entries.entries()) {
    const changed = entries.map((entry, i) => i === index ? [name, Buffer.concat([content, Buffer.from('changed')])] : entry);
    assert.notEqual(assetVersion(changed), clientVersion, name);
    if (name.endsWith('.js')) {
      for (const match of content.toString().matchAll(/from '\.\/([^']+)'/g)) {
        assert.ok(staticFiles.has(`/${match[1]}`), `Unserved import in ${name}: ${match[1]}`);
      }
    }
  }
  const server = createServer(loadConfig());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, [, type]] of staticFiles) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (path === '/') assert.ok((await response.text()).includes(`content="${clientVersion}"`));
  }
  assert.equal((await fetch(`${origin}/http.js`)).status, 404);
});

for (const method of ['json', 'blob']) {
  test(`${method} requests preserve 401 and trigger session recovery without retry`, async () => {
    let calls = 0, unauthorized = 0;
    const network = createApi(() => unauthorized++, async () => {
      calls++;
      return Response.json({ error: { code: 'unauthorized', message: '다시 로그인해 주세요.' } }, { status: 401 });
    });
    await assert.rejects(network[method]('/api/samples/example.jpg'), { status: 401, code: 'unauthorized' });
    assert.equal(calls, 1);
    assert.equal(unauthorized, 1);
    await assert.rejects(network.json('/api/session', { method: 'POST' }), { status: 401 });
    assert.equal(unauthorized, 1);
  });
}

test('non-JSON error bodies are not exposed and network failures are never retried', async () => {
  const network = createApi(() => {}, async () => new Response('private provider body', { status: 502 }));
  await assert.rejects(network.blob('/api/jobs/id/images/mai'), error =>
    error.status === 502 && error.code === 'invalid-server-response' && !error.message.includes('private'));
  let calls = 0;
  const offline = createApi(() => {}, async () => { calls++; throw new TypeError('offline'); });
  await assert.rejects(offline.json('/api/jobs', { method: 'POST' }), TypeError);
  assert.equal(calls, 1);
});

test('each request has its own timeout signal and invalid error JSON still expires the session', async () => {
  const signals = [];
  let unauthorized = 0;
  const network = createApi(() => unauthorized++, async (_path, options) => {
    signals.push(options.signal);
    assert.equal(options.headers['x-studio-request'], '1');
    return Response.json(null, { status: 401 });
  });
  await assert.rejects(network.json('/api/config'), { code: 'invalid-server-response', status: 401 });
  await assert.rejects(network.blob('/api/samples/person.jpg'), { code: 'invalid-server-response', status: 401 });
  assert.notEqual(signals[0], signals[1]);
  assert.equal(unauthorized, 2);
});
