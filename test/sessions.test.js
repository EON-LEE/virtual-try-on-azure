import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, SESSION_TTL, sessionCookie, loginSource } from '../src/sessions.js';
import { logEvent } from '../src/logging.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';
import { demoCredentials, demoEnv } from './fixtures.js';

test('session replacement, expiry and logout clear only the owning jobs', () => {
  let now = 100;
  const cleared = [];
  const store = new SessionStore({ clearOwner: id => cleared.push(id) }, { now: () => now, credentials: demoCredentials });
  const credentials = demoCredentials;
  const first = store.login(credentials);
  const other = store.login(credentials);
  const replacement = store.login(credentials, first);
  assert.equal(store.get(first), undefined);
  assert.ok(store.get(other));
  assert.deepEqual(cleared, [first]);
  store.delete('lost-session');
  store.delete(replacement);
  now += SESSION_TTL;
  store.prune();
  assert.equal(store.get(other), undefined);
  assert.deepEqual(cleared, [first, replacement, other]);
  assert.match(sessionCookie('', true), /Secure; Max-Age=0$/);
  assert.doesNotMatch(sessionCookie('fixture', false), /Secure/);
});

test('malformed, rejected and successful logins consume per-source slots until expiry', () => {
  let now = 0;
  const store = new SessionStore({ clearOwner() {} }, { now: () => now, loginAttemptsPerMinute: 2, credentials: demoCredentials });
  store.reserveLogin('source-a');
  assert.throws(() => store.login({ username: 'test', password: 'wrong' }), { code: 'unauthorized' });
  store.reserveLogin('source-a');
  store.login(demoCredentials);
  assert.throws(() => store.reserveLogin('source-a'), { code: 'login-rate-limit' });
  assert.doesNotThrow(() => store.reserveLogin('source-b'));
  now = 60_001;
  assert.doesNotThrow(() => store.reserveLogin('source-a'));
  assert.equal(store.loginWindows.size, 1);
});

test('demo configuration has no default password and public hosting fails closed', () => {
  const config = loadConfig({});
  assert.equal(config.access.credentials, null);
  assert.equal(config.researchSamples, false);
  assert.equal(config.access.trustContainerAppsProxy, false);
  const store = new SessionStore({ clearOwner() {} });
  assert.throws(() => store.login({ username: 'test', password: 'test' }), { code: 'login-not-configured' });
  assert.throws(() => loadConfig({ HOST: '0.0.0.0', APP_ORIGIN: 'https://example.test' }), /Hosted access requires/);
  assert.throws(() => loadConfig({ HOST: '127.0.0.1', APP_ORIGIN: 'https://example.test' }), /Hosted access requires/);
  for (const env of [{ DEMO_USERNAME: 'test' }, { ...demoEnv, DEMO_PASSWORD: 'test' },
    { ...demoEnv, DEMO_PASSWORD: ' '.repeat(32) }, { ...demoEnv, DEMO_PASSWORD: 'x'.repeat(129) }]) {
    assert.throws(() => loadConfig(env), /Set DEMO_USERNAME/);
  }
  assert.throws(() => loadConfig({ ...demoEnv, DEMO_OPERATOR_TOKEN: demoEnv.DEMO_PASSWORD }), /must be different/);
  assert.throws(() => loadConfig({ DEMO_TRUST_CONTAINER_APPS_PROXY: 'yes' }), /true or false/);
});

test('only explicit ACA mode trusts the rightmost validated forwarded address', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': 'spoofed, 198.51.100.4' } };
  assert.equal(loginSource(req), '127.0.0.1');
  assert.equal(loginSource(req, true), '198.51.100.4');
  req.headers['x-forwarded-for'] = '198.51.100.4, spoofed';
  assert.throws(() => loginSource(req, true), { code: 'invalid-login-source' });
  delete req.headers['x-forwarded-for'];
  assert.throws(() => loginSource(req, true), { code: 'invalid-login-source' });
  req.socket.remoteAddress = '2001:0db8:0:0:0:0:0:1';
  assert.equal(loginSource(req), '2001:db8::1');
});

test('HTTP invalid logins cannot consume another ACA source allowance or leak credentials', async t => {
  const server = createServer(loadConfig({ ...demoEnv, DEMO_TRUST_CONTAINER_APPS_PROXY: 'true' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (source, credentials) => fetch(`${origin}/api/session`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-request': '1', 'x-forwarded-for': source },
    body: JSON.stringify(credentials) });
  for (let i = 0; i < 20; i++) {
    assert.equal((await post('192.0.2.1, 198.51.100.1', { username: 'test', password: 'wrong' })).status, 401);
  }
  assert.equal((await post('192.0.2.2, 198.51.100.1', demoCredentials)).status, 429);
  assert.equal((await post('192.0.2.1, 198.51.100.2', demoCredentials)).status, 200);
  const response = await fetch(`${origin}/api/config`);
  assert.ok(!(await response.text()).includes(demoCredentials.password));
});

test('unconfigured local login refuses the old public password', async t => {
  const server = createServer(loadConfig({}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
    body: '{"username":"test","password":"test"}'
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'login-not-configured');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('structured log helper retains correlation and discards unrelated payload fields', () => {
  const lines = [];
  logEvent({ info: line => lines.push(JSON.parse(line)) }, 'info', 'studio-job', {
    timestamp: 1, jobId: 'fixture', stage: 'completed', status: 'failed', providerStatus: 429,
    photo: 'private-photo', cookie: 'private-cookie', rawBody: 'private-body', token: 'private-token'
  });
  assert.deepEqual(lines, [{ event: 'studio-job', timestamp: 1, jobId: 'fixture', stage: 'completed', status: 'failed', providerStatus: 429 }]);
});
