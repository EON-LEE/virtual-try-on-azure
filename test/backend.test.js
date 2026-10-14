import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadConfig, selectModels } from '../src/config.js';
import { buildRequest, editImage } from '../src/provider.js';
import { sanitizeImage } from '../src/images.js';
import { JobStore, publicJob, RESULT_TTL_MS } from '../src/jobs.js';
import { TRY_ON_PROMPT } from '../src/prompt.js';
import { createServer } from '../src/server.js';

const png = () => sharp({ create: { width: 16, height: 24, channels: 3, background: '#abcdef' } }).png().toBuffer();
const configured = () => loadConfig({
  ENABLE_AZURE_INFERENCE: 'true',
  AZURE_SUNBURST_ENDPOINT: 'https://test.openai.azure.com',
  AZURE_SUNBURST_DEPLOYMENT: 'sunburst-test', AZURE_SUNBURST_API_KEY: 'test-only',
  AZURE_MAI_ENDPOINT: 'https://test.services.ai.azure.com',
  AZURE_MAI_DEPLOYMENT: 'mai-test', AZURE_MAI_API_KEY: 'test-only', AZURE_MAI_MODEL: 'MAI-Image-2.6'
});

test('default is disconnected, deployment does not imply paid-call permission', () => {
  assert.equal(loadConfig({}).models.sunburst.ready, false);
  assert.throws(() => selectModels(['sunburst'], loadConfig({})), /not connected/);
  assert.throws(() => selectModels([], configured()), /Select/);
  assert.throws(() => selectModels(['mai', 'mai'], configured()), /Select/);
  assert.throws(() => loadConfig({ AZURE_MAI_ENDPOINT: 'https://api.external.example' }), /Azure resource/);
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /requires/);
  assert.throws(() => loadConfig({ AZURE_MAI_MODEL: 'MAI-Image-2.6-Flash' }), /only MAI/);
});

test('provider contract keeps image roles ordered and sends only documented controls', async () => {
  const config = configured();
  for (const id of ['sunburst', 'mai']) {
    const { url, options } = buildRequest(config.models[id], Buffer.from('person'), Buffer.from('garment'));
    assert.ok(url.startsWith(config.models[id].endpoint));
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('prompt'), TRY_ON_PROMPT);
    assert.equal(options.body.get('mask'), null);
    assert.equal(options.body.get('input_fidelity'), null);
    const files = options.body.getAll(id === 'mai' ? 'image' : 'image[]');
    assert.deepEqual(files.map(f => f.name), ['person.png', 'garment.png']);
    assert.equal(await files[0].text(), 'person');
    if (id === 'mai') {
      assert.equal(options.body.get('quality'), null);
      assert.equal(options.body.get('width'), null);
      assert.equal(options.body.get('web_grounding'), 'false');
    } else {
      assert.equal(options.body.get('n'), '1');
      assert.equal(options.body.get('quality'), 'high');
      assert.match(url, /2025-04-01-preview$/);
    }
  }
  assert.match(TRY_ON_PROMPT, /exact pose/);
  assert.match(TRY_ON_PROMPT, /logos/);
});

test('decode, orientation and metadata removal reject disguised or damaged photos', async () => {
  const bytes = await sharp(await png()).jpeg().withExif({ IFD0: { Artist: 'private-test' } }).toBuffer();
  const output = await sanitizeImage(new File([bytes], 'private.jpg', { type: 'image/jpeg' }), 'person');
  const meta = await sharp(output).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.format, 'png');
  await assert.rejects(() => sanitizeImage(new File(['not an image'], 'fake.png', { type: 'image/png' }), 'person'), /decoded safely/);
  await assert.rejects(() => sanitizeImage(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), 'person'), /PNG or JPEG/);
});

test('provider response is validated; quota rejection never retries or exposes upstream text', async () => {
  const image = await png();
  let calls = 0;
  const result = await editImage(configured().models.mai, image, image, {
    fetchImpl: async () => { calls++; return Response.json({ data: [{ b64_json: image.toString('base64') }] }, { headers: { 'x-request-id': 'request-1' } }); }
  });
  assert.equal(result.requestId, 'request-1');
  assert.ok(result.image.length);
  await assert.rejects(() => editImage(configured().models.mai, image, image, {
    fetchImpl: async () => { calls++; return new Response('sensitive upstream content', { status: 429 }); }
  }), /No automatic retry/);
  assert.equal(calls, 2);
  await assert.rejects(() => editImage(configured().models.mai, image, image, {
    fetchImpl: async () => Response.json({ data: [{ url: 'https://external.example/photo.png' }] })
  }), /invalid image data/);
});

test('jobs invoke only selected models, deduplicate, isolate owners and expire images', async () => {
  let now = 100;
  const calls = [];
  const store = new JobStore({ now: () => now, provider: async model => { calls.push(model.id); return { image: await png(), requestId: 'test' }; } });
  const job = store.create('owner', 'request', 'fingerprint', ['mai'], configured(), Buffer.from('a'), Buffer.from('b'));
  assert.equal(store.create('owner', 'request', 'fingerprint', ['mai'], configured(), Buffer.from('a'), Buffer.from('b')).id, job.id);
  assert.throws(() => store.create('owner', 'request', 'different', ['mai'], configured(), Buffer.from('a'), Buffer.from('b')), /different inputs/);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(calls, ['mai']);
  assert.equal(job.status, 'succeeded');
  assert.equal(publicJob(job).results.mai.image, undefined);
  assert.throws(() => store.get(job.id, 'other'), /does not belong/);
  now += RESULT_TTL_MS;
  assert.throws(() => store.get(job.id, 'owner'), /expired/);
  store.close();
});

test('comparison reports partial failure without disguising it as full success', async () => {
  const store = new JobStore({ provider: async model => {
    if (model.id === 'mai') throw new Error('secret upstream error');
    return { image: Buffer.from('test-only') };
  } });
  const job = store.create('owner', 'request', 'x', ['sunburst', 'mai'], configured(), Buffer.from('a'), Buffer.from('b'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(job.status, 'failed');
  assert.equal(job.results.sunburst.status, 'succeeded');
  assert.equal(job.results.mai.status, 'failed');
  assert.doesNotMatch(job.results.mai.error.message, /secret/);
  store.close();
});

test('HTTP upload-to-result flow enforces consent, origin, session and exact selection', async t => {
  const calls = [];
  const jobs = new JobStore({ provider: async model => { calls.push(model.id); return { image: await png(), requestId: 'test-request' }; } });
  const server = createServer(configured(), { jobs });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(`${origin}/api/config`);
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  assert.equal((await initial.json()).authenticated, true);
  const bytes = await png();
  const form = (consent = 'true') => {
    const data = new FormData();
    data.set('person', new Blob([bytes], { type: 'image/png' }), 'person.png');
    data.set('garment', new Blob([bytes], { type: 'image/png' }), 'garment.png');
    data.set('models', JSON.stringify(['sunburst']));
    data.set('consent', consent);
    return data;
  };
  const headers = { cookie, origin, 'x-studio-request': '1', 'x-request-id': 'request-123456789' };
  assert.equal((await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: form('false') })).status, 400);
  assert.equal((await fetch(`${origin}/api/jobs`, { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: form() })).status, 403);
  assert.deepEqual(calls, []);
  const response = await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: form() });
  assert.equal(response.status, 202);
  const job = await response.json();
  await new Promise(resolve => setTimeout(resolve, 40));
  const state = await (await fetch(`${origin}/api/jobs/${job.id}`, { headers: { cookie } })).json();
  assert.deepEqual(calls, ['sunburst']);
  assert.equal(state.status, 'succeeded');
  const result = await fetch(`${origin}${state.results.sunburst.imageUrl}`, { headers: { cookie } });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${origin}${state.results.sunburst.imageUrl}`)).status, 401);
  assert.equal((await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: form() })).status, 202);
  assert.deepEqual(calls, ['sunburst']);
  await fetch(`${origin}/api/jobs/${job.id}`, { method: 'DELETE', headers });
  assert.equal((await fetch(`${origin}/api/jobs/${job.id}`, { headers: { cookie } })).status, 404);
});
