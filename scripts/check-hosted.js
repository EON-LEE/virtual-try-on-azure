import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export async function checkHosted(origin, expected = 'any', { fetchImpl = fetch, timeoutMs = 120_000 } = {}) {
  if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) {
    throw new Error('Supply a canonical HTTPS origin.');
  }
  if (!['any', 'disabled', 'ready'].includes(expected)) throw new Error('Expected state must be any, disabled or ready.');
  const request = (path, options = {}) => fetchImpl(`${origin}${path}`, {
    ...options, signal: AbortSignal.timeout(timeoutMs), redirect: 'error'
  });
  assert.equal((await request('/healthz')).status, 200);
  const page = await (await request('/')).text();
  for (const marker of ['value="upper"', 'value="lower"', 'value="full"', 'data-zoom="mai-result"', 'id="username"']) {
    assert.ok(page.includes(marker));
  }
  assert.equal((await request('/api/samples/manifest')).status, 401);
  assert.equal((await (await request('/api/config')).json()).authenticated, false);
  const headers = { 'x-studio-request': '1', 'content-type': 'application/json', origin };
  const login = await request('/api/session', {
    method: 'POST', headers, body: JSON.stringify({ username: 'test', password: 'test' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const session = cookie.split(';')[0];
  const authenticated = { headers: { cookie: session } };
  try {
    const config = await (await request('/api/config', authenticated)).json();
    assert.equal(config.authenticated, true);
    if (expected === 'ready') assert.ok(config.models.every(model => model.ready));
    if (expected === 'disabled') {
      assert.ok(config.models.every(model => !model.ready && model.reason === 'inference-disabled'));
    }
    const manifestResponse = await request('/api/samples/manifest', authenticated);
    assert.equal(manifestResponse.status, 200);
    const samples = await manifestResponse.json();
    const sampleCounts = Object.fromEntries(['person', 'upper', 'lower'].map(category =>
      [category, samples.items.filter(item => item.category === category).length]));
    assert.deepEqual(sampleCounts, { person: 6, upper: 8, lower: 0 });
    for (const item of samples.items) {
      assert.match(item.src, /^\/api\/samples\/[a-zA-Z0-9_-]+\.jpg$/);
      assert.equal((await request(item.src)).status, 401);
      const photo = await request(item.src, authenticated);
      assert.equal(photo.status, 200);
      assert.equal(photo.headers.get('cache-control'), 'no-store');
      await photo.arrayBuffer();
    }
    return { health: 'ok', authenticated: true, expected, sampleCounts, imageCalls: 0, activationRequests: 0 };
  } finally {
    assert.equal((await request('/api/session', {
      method: 'DELETE', headers: { ...headers, cookie: session }
    })).status, 200);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await checkHosted(process.argv[2], process.argv[3])));
}
