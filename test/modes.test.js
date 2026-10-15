import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildRequest } from '../src/provider.js';
import { modeContract } from '../src/modes.js';
import { TRY_ON_PROMPT, PROMPT_VERSION } from '../src/prompt.js';
import { JobStore } from '../src/jobs.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';
import { activateForTest, loginForTest } from './fixtures.js';

const env = {
  ENABLE_AZURE_INFERENCE: 'true', DEMO_MAX_MODEL_ATTEMPTS: '10', DEMO_INFERENCE_EXPIRES_AT: '2099-01-01T00:00:00Z',
  AZURE_SUNBURST_ENDPOINT: 'https://test.openai.azure.com', AZURE_SUNBURST_DEPLOYMENT: 'test', AZURE_SUNBURST_API_KEY: 'test-only',
  AZURE_MAI_ENDPOINT: 'https://test.services.ai.azure.com', AZURE_MAI_DEPLOYMENT: 'test', AZURE_MAI_API_KEY: 'test-only'
};
test('baseline unchanged; mode-specific exact role order and preservation instructions', async () => {
  assert.equal(modeContract().prompt, TRY_ON_PROMPT);
  assert.equal(modeContract().version, PROMPT_VERSION);
  for (const mode of ['upper', 'lower', 'full']) {
    const contract = modeContract(mode);
    assert.match(contract.prompt, /skin color/);
    assert.match(contract.prompt, /white balance/);
    assert.match(contract.prompt, /non-target/);
    assert.match(contract.prompt, /shoes, accessories/);
    assert.match(contract.prompt, /never invent text/);
    if (mode === 'upper') assert.match(contract.prompt, /lower-body clothing exactly/);
    if (mode === 'lower') assert.match(contract.prompt, /upper-body clothing exactly/);
    for (const model of Object.values(loadConfig(env).models)) {
      const options = { mode, ...(mode === 'full' ? { lowerGarment: Buffer.from('lower') } : {}) };
      const request = buildRequest(model, Buffer.from('person'), Buffer.from('target'), options);
      const images = request.options.body.getAll(model.id === 'mai' ? 'image' : 'image[]');
      assert.deepEqual(images.map(image => image.name), ['person.png', ...contract.names]);
      assert.equal(await images[0].text(), 'person');
      assert.equal(request.options.body.get('prompt'), contract.prompt);
      if (mode === 'full') assert.equal(await images[2].text(), 'lower');
    }
  }
  assert.throws(() => modeContract('__proto__'), /Select/);
  assert.throws(() => buildRequest(loadConfig(env).models.mai, Buffer.from('p'), Buffer.from('u'), { mode: 'full' }), /exactly/);
});

test('attempt window/count, global concurrency and dedup cannot be bypassed by clearing sessions', async () => {
  let finish;
  const store = new JobStore({ provider: () => new Promise(resolve => { finish = resolve; }) });
  const config = loadConfig({ ...env, DEMO_MAX_MODEL_ATTEMPTS: '1' });
  activateForTest(store, config);
  assert.throws(() => store.create('a', 'id', 'hash', ['mai', 'sunburst'], config, Buffer.from('p'), Buffer.from('g')), /allowance/);
  const job = store.create('a', 'id', 'hash', ['mai'], config, Buffer.from('p'), Buffer.from('g'));
  assert.equal(store.create('a', 'id', 'hash', ['mai'], config, Buffer.from('p'), Buffer.from('g')).id, job.id);
  store.clearOwner('a');
  assert.throws(() => store.create('b', 'new', 'hash', ['mai'], config, Buffer.from('p'), Buffer.from('g')), /running/);
  finish({ image: Buffer.from('test') });
  await new Promise(resolve => setImmediate(resolve));
  assert.throws(() => store.create('b', 'new', 'hash', ['mai'], config, Buffer.from('p'), Buffer.from('g')), /allowance/);
  store.close();
  const closed = new JobStore();
  assert.throws(() => closed.create('a', 'id', 'h', ['mai'], loadConfig({ ...env, DEMO_MAX_MODEL_ATTEMPTS: '0' }), Buffer.from('p'), Buffer.from('g')), /closed/);
  assert.throws(() => closed.create('a', 'id', 'h', ['mai'], loadConfig({ ...env, DEMO_INFERENCE_EXPIRES_AT: '2000-01-01T00:00:00Z' }), Buffer.from('p'), Buffer.from('g')), /closed/);
  closed.close();
});

test('global rate guard applies across new sessions and hosted enablement requires budget', async () => {
  const config = loadConfig(env);
  const store = new JobStore({ provider: async () => ({ image: Buffer.from('test') }) });
  activateForTest(store, config);
  for (const owner of ['a', 'b']) {
    store.create(owner, owner, owner, ['mai'], config, Buffer.from('p'), Buffer.from('g'));
    await new Promise(resolve => setImmediate(resolve));
    store.clearOwner(owner);
  }
  assert.throws(() => store.create('c', 'id', 'hash', ['mai'], config, Buffer.from('p'), Buffer.from('g')), /per minute/);
  store.close();
  assert.throws(() => loadConfig({ ...env, HOST: '0.0.0.0', APP_ORIGIN: 'https://demo.example.com', APP_ACCESS_TOKEN: 'a'.repeat(32), DEMO_MAX_MODEL_ATTEMPTS: '0' }), /positive attempt/);
});

test('HTTP modes reject missing/extra refs and preserve requested three-image order', async t => {
  const calls = [];
  const config = loadConfig(env);
  const jobs = new JobStore({ submissionsPerMinute: 100, provider: async (model, person, garment, options) => {
    calls.push({ id: model.id, ...options, garment });
    return { image: garment };
  } });
  activateForTest(jobs, config);
  const server = createServer(config, { jobs });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cookie = await loginForTest(origin);
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  for (const mode of ['upper', 'lower', 'full']) {
    const data = new FormData();
    data.set('mode', mode); data.set('models', '["mai"]'); data.set('consent', 'true');
    const fields = ['person', ...modeContract(mode).fields];
    for (const field of fields) data.set(field, new Blob([image], { type: 'image/png' }), `${field}.png`);
    const headers = { cookie, 'x-studio-request': '1', 'x-request-id': `request-${mode}-12345678` };
    const missing = fields.at(-1);
    data.delete(missing);
    assert.equal((await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: data })).status, 400);
    data.set(missing, new Blob([image], { type: 'image/png' }), 'ref.png');
    data.set('garment', 'unexpected');
    assert.equal((await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: data })).status, 400);
    data.delete('garment');
    const response = await fetch(`${origin}/api/jobs`, { method: 'POST', headers, body: data });
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.mode, mode);
    assert.equal(job.promptVersion, modeContract(mode).version);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.at(-1).mode, mode);
    assert.equal(Boolean(calls.at(-1).lowerGarment), mode === 'full');
  }
  assert.deepEqual(calls.map(call => call.id), ['mai', 'mai', 'mai']);
});
