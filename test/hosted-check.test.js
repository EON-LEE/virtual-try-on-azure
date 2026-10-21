import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHosted } from '../scripts/check-hosted.js';
import manifest from '../samples/manifest.json' with { type: 'json' };

for (const expected of ['disabled', 'ready']) {
  test(`hosted ${expected} check cannot activate or submit inference and uses per-request signals`, async () => {
    const signals = new Set();
    const mutations = [];
    const summary = await checkHosted('https://example.test', expected, {
      fetchImpl: async (url, options) => {
        assert.ok(!signals.has(options.signal));
        signals.add(options.signal);
        const path = new URL(url).pathname;
        if (options.method) {
          mutations.push([path, options.method]);
          assert.equal(path, '/api/session');
          if (options.method === 'POST') return Response.json({}, {
            headers: { 'set-cookie': 'studio=fixture; HttpOnly; Secure; SameSite=Strict' }
          });
          assert.equal(options.method, 'DELETE');
          return Response.json({});
        }
        if (path === '/healthz') return Response.json({ status: 'ok' });
        if (path === '/') return new Response('value="upper" value="lower" value="full" data-zoom="mai-result" id="username"');
        const authenticated = Boolean(options.headers?.cookie);
        if (path === '/api/config') return Response.json({ authenticated, models: [
          { ready: expected === 'ready', reason: expected === 'disabled' ? 'inference-disabled' : null }
        ] });
        if (!authenticated) return new Response(null, { status: 401 });
        if (path === '/api/samples/manifest') return Response.json(manifest);
        assert.ok(manifest.items.some(item => item.src === path));
        return new Response('synthetic-photo', { headers: { 'cache-control': 'no-store' } });
      }
    });
    assert.equal(summary.imageCalls, 0);
    assert.deepEqual(mutations, [['/api/session', 'POST'], ['/api/session', 'DELETE']]);
  });
}

test('invalid hosted state stops before any request', async () => {
  await assert.rejects(checkHosted('https://example.test', 'unlimited', {
    fetchImpl: () => assert.fail('No network permitted')
  }), /Expected state/);
});
