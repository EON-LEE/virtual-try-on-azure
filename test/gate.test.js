import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InferenceGate } from '../src/gate.js';
import { JobStore } from '../src/jobs.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';

const invite = 'invitation-secret-test-only-'.repeat(2);
const operator = 'operator-secret-test-only-'.repeat(2);
const settings = {
  ENABLE_AZURE_INFERENCE: 'true', APP_ACCESS_TOKEN: invite, DEMO_OPERATOR_TOKEN: operator,
  DEMO_MAX_MODEL_ATTEMPTS: '2', DEMO_INFERENCE_EXPIRES_AT: '2099-01-01T00:00:00Z',
  AZURE_MAI_ENDPOINT: 'https://test.services.ai.azure.com', AZURE_MAI_DEPLOYMENT: 'test', AZURE_MAI_API_KEY: 'test-only',
  AZURE_SUNBURST_ENDPOINT: 'https://test.openai.azure.com', AZURE_SUNBURST_DEPLOYMENT: 'test', AZURE_SUNBURST_API_KEY: 'test-only'
};

test('every boot closed; one-shot activation, expiry and atomic two-slot reservations', () => {
  let now = 1000;
  const config = loadConfig(settings);
  const gate = new InferenceGate({ now: () => now });
  assert.throws(() => gate.reserve(1, config.limits), /closed/);
  assert.throws(() => gate.activate({ nonce: 'another-boot', allowance: 2, expiresAt: '2099-01-01T00:00:00Z' }, config), /match/);
  assert.throws(() => gate.activate({ nonce: gate.nonce, allowance: 3, expiresAt: '2099-01-01T00:00:00Z' }, config), /match/);
  assert.throws(() => gate.activate({ nonce: gate.nonce, allowance: 2, expiresAt: '2099-01-01T00:00:00Z' },
    loadConfig({ ...settings, ENABLE_AZURE_INFERENCE: 'false' })), /match/);
  assert.equal(gate.activated, false);
  gate.activate({ nonce: gate.nonce, allowance: 2, expiresAt: new Date(5000).toISOString() }, config);
  gate.reserve(1, config.limits);
  assert.throws(() => gate.reserve(2, config.limits), /closed/);
  assert.equal(gate.state().remaining, 1);
  assert.throws(() => gate.activate({ nonce: gate.nonce, allowance: 2, expiresAt: '2099-01-01T00:00:00Z' }, config), /already/);
  now = 6000;
  assert.throws(() => gate.reserve(1, config.limits), /closed/);
  const restart = new InferenceGate();
  assert.notEqual(restart.nonce, gate.nonce);
  assert.equal(restart.state().open, false);
  assert.throws(() => restart.reserve(1, config.limits), /closed/);
  assert.throws(() => loadConfig({ ...settings, DEMO_OPERATOR_TOKEN: 'test' }), /32/);
});

test('two-model failures consume both reserved slots without automatic retry or refund', async () => {
  const config = loadConfig(settings);
  let calls = 0;
  const store = new JobStore({ provider: async () => { calls++; throw new Error('fixture failure'); } });
  const activate = () => store.gate.activate({ nonce: store.gate.nonce, allowance: 2, expiresAt: '2099-01-01T00:00:00Z' }, config);
  assert.throws(() => store.create('a', 'id', 'hash', ['mai', 'sunburst'], config, Buffer.from('p'), Buffer.from('g')), /closed/);
  activate();
  store.create('a', 'id', 'hash', ['mai', 'sunburst'], config, Buffer.from('p'), Buffer.from('g'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(store.gate.state().remaining, 0);
  store.clearOwner('a');
  assert.throws(() => store.create('b', 'new', 'hash', ['mai'], config, Buffer.from('p'), Buffer.from('g')), /closed/);
  assert.throws(activate, /already/);
  assert.equal(calls, 2);
  store.close();
});

test('insufficient one-shot allowance sends neither comparison request', () => {
  const config = loadConfig(settings);
  let calls = 0;
  const store = new JobStore({ provider: async () => { calls++; } });
  store.gate.activate({ nonce: store.gate.nonce, allowance: 1, expiresAt: '2099-01-01T00:00:00Z' }, config);
  assert.throws(() => store.create('a', 'id', 'hash', ['mai', 'sunburst'], config, Buffer.from('p'), Buffer.from('g')), /closed/);
  assert.equal(store.gate.state().remaining, 1);
  assert.equal(calls, 0);
  store.close();
});

test('session-only smoke allowance cannot be spent by another public demo session', () => {
  const config = loadConfig(settings), gate = new InferenceGate();
  gate.activate({ nonce: gate.nonce, allowance: 2, expiresAt: '2099-01-01T00:00:00Z' }, config, 'smoke-owner');
  assert.throws(() => gate.reserve(1, config.limits, 'another-owner'), /closed/);
  assert.equal(gate.state().remaining, 2);
  gate.reserve(2, config.limits, 'smoke-owner');
  assert.equal(gate.state().remaining, 0);
});

test('operator endpoint hides nonce from demo sessions and demo password cannot activate', async t => {
  const config = loadConfig(settings);
  let calls = 0;
  const jobs = new JobStore({ provider: async () => { calls++; } });
  const server = createServer(config, { jobs });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'x-studio-request': '1', 'content-type': 'application/json', origin };
  const ordinary = await fetch(`${origin}/api/config`);
  assert.doesNotMatch(await ordinary.text(), /nonce|operator|remaining/);
  const login = await fetch(`${origin}/api/session`, { method: 'POST', headers, body: JSON.stringify({ username: 'test', password: 'test' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${origin}/api/operator/state`, { method: 'POST', headers: { ...headers, cookie }, body: '{}' })).status, 401);
  const nonceRequest = secret => fetch(`${origin}/api/operator/state`, { method: 'POST', headers: { ...headers, ...(secret ? { 'x-operator-token': secret } : {}) }, body: '{}' });
  assert.equal((await nonceRequest()).status, 401);
  assert.equal((await nonceRequest('test')).status, 401);
  assert.equal((await fetch(`${origin}/api/operator/state?token=${operator}`, { method: 'POST', headers, body: '{}' })).status, 400);
  const state = await (await nonceRequest(operator)).json();
  assert.equal(state.open, false);
  assert.ok(state.nonce);
  const activation = { nonce: state.nonce, allowance: 2, expiresAt: '2099-01-01T00:00:00Z' };
  const activate = secret => fetch(`${origin}/api/operator/activate`, { method: 'POST', headers: { ...headers, 'x-operator-token': secret }, body: JSON.stringify(activation) });
  assert.equal((await activate('test')).status, 401);
  assert.equal((await activate(operator)).status, 200);
  assert.equal((await activate(operator)).status, 409);
  assert.equal((await nonceRequest(operator)).status, 200);
  assert.equal((await nonceRequest(operator)).status, 429);
  assert.equal(calls, 0);
});
