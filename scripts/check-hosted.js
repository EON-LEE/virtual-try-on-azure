import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw new Error('Supply a canonical HTTPS origin.');
const options = { signal: AbortSignal.timeout(60_000) };
const health = await fetch(`${origin}/healthz`, options);
assert.equal(health.status, 200);
const page = await (await fetch(origin, options)).text();
for (const marker of ['value="upper"', 'value="lower"', 'value="full"', 'data-zoom="mai-result"', '결과 평가', 'id="username"']) assert.ok(page.includes(marker));
assert.ok(!page.includes('access-token'));
const samplesResponse = await fetch(`${origin}/samples/manifest.json`, options);
assert.equal(samplesResponse.status, 200);
const samples = await samplesResponse.json();
const sampleCounts = Object.fromEntries(['person', 'upper', 'lower'].map(category => [category, samples.items.filter(item => item.category === category).length]));
assert.ok(Object.values(sampleCounts).every(count => count >= 2));
for (const item of samples.items) assert.equal((await fetch(`${origin}${item.src}`, options)).status, 200);
const config = await (await fetch(`${origin}/api/config`, options)).json();
assert.equal(config.authenticated, false);
assert.ok(config.models.every(model => !model.ready));
const headers = { 'x-studio-request': '1', 'content-type': 'application/json', origin };
assert.equal((await fetch(`${origin}/api/jobs`, { ...options, method: 'POST', headers, body: '{}' })).status, 401);
const wrong = await fetch(`${origin}/api/session`, { ...options, method: 'POST', headers, body: '{"username":"test","password":"wrong"}' });
assert.equal(wrong.status, 401);
assert.equal((await fetch(`${origin}/api/session`, { ...options, method: 'POST', headers, body: '{"token":"obsolete-token-login"}' })).status, 401);
const login = await fetch(`${origin}/api/session`, { ...options, method: 'POST', headers, body: '{"username":"test","password":"test"}' });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie');
assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
const session = cookie.split(';')[0];
const unlocked = await (await fetch(`${origin}/api/config`, { ...options, headers: { cookie: session } })).json();
assert.equal(unlocked.authenticated, true);
assert.ok(unlocked.models.every(model => !model.ready && model.reason === 'inference-disabled'));
const form = new FormData();
form.set('mode', 'full'); form.set('models', '["sunburst","mai"]'); form.set('consent', 'true');
for (const role of ['person', 'upper', 'lower']) form.set(role, new Blob(['not-a-photo'], { type: 'image/png' }), `${role}.png`);
const blocked = await fetch(`${origin}/api/jobs`, { ...options, method: 'POST',
  headers: { cookie: session, origin, 'x-studio-request': '1', 'x-request-id': 'disabled-host-check-12345' }, body: form });
assert.equal(blocked.status, 503);
assert.equal((await blocked.json()).error.code, 'model-unavailable');
assert.equal((await fetch(`${origin}/api/session`, { ...options, method: 'DELETE', headers: { cookie: session, origin, 'x-studio-request': '1' } })).status, 200);
const operatorState = secret => fetch(`${origin}/api/operator/state`, { ...options, method: 'POST',
  headers: { ...headers, 'x-operator-token': secret }, body: '{}' });
assert.equal((await operatorState('test')).status, 401);
const operatorToken = (await readFile(new URL('../.local-deploy/demo-operator-token.txt', import.meta.url), 'utf8')).trim();
const stateResponse = await operatorState(operatorToken);
assert.equal(stateResponse.status, 200);
const state = await stateResponse.json();
assert.equal(state.activated, false);
assert.equal(state.open, false);
assert.equal(state.remaining, 0);
console.log(JSON.stringify({ origin, health: 'ok', threeModes: true, fourColumnZoom: true, unauthorizedJobs: 401,
  wrongPassword: 401, demoLogin: 'secure-cookie', disabledGeneration: 503, logout: 'ok',
  sampleCounts, demoLoginCannotOperate: true, bootGate: 'closed-unactivated-zero', activationRequests: 0, imageCalls: 0 }));
