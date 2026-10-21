import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, SESSION_TTL, sessionCookie } from '../src/sessions.js';
import { logEvent } from '../src/logging.js';

test('session replacement, expiry and logout clear only the owning jobs', () => {
  let now = 100;
  const cleared = [];
  const store = new SessionStore({ clearOwner: id => cleared.push(id) }, { now: () => now });
  const credentials = { username: 'test', password: 'test' };
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

test('malformed, rejected and successful logins all consume rate slots', () => {
  let now = 0;
  const store = new SessionStore({ clearOwner() {} }, { now: () => now, loginAttemptsPerMinute: 2 });
  store.reserveLogin();
  assert.throws(() => store.login({ username: 'test', password: 'wrong' }), { code: 'unauthorized' });
  store.reserveLogin();
  store.login({ username: 'test', password: 'test' });
  assert.throws(() => store.reserveLogin(), { code: 'login-rate-limit' });
  now = 60_001;
  assert.doesNotThrow(() => store.reserveLogin());
});

test('structured log helper retains correlation and discards unrelated payload fields', () => {
  const lines = [];
  logEvent({ info: line => lines.push(JSON.parse(line)) }, 'info', 'studio-job', {
    timestamp: 1, jobId: 'fixture', stage: 'completed', status: 'failed', providerStatus: 429,
    photo: 'private-photo', cookie: 'private-cookie', rawBody: 'private-body', token: 'private-token'
  });
  assert.deepEqual(lines, [{ event: 'studio-job', timestamp: 1, jobId: 'fixture', stage: 'completed', status: 'failed', providerStatus: 429 }]);
});
