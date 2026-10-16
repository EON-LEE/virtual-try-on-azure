import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobStore, publicJob } from '../src/jobs.js';
import { editImage } from '../src/provider.js';
import { loadConfig } from '../src/config.js';

const config = () => loadConfig({
  ENABLE_AZURE_INFERENCE: 'true', DEMO_INFERENCE_MODE: 'unlimited',
  AZURE_MAI_ENDPOINT: 'https://test.services.ai.azure.com', AZURE_MAI_DEPLOYMENT: 'fixture',
  AZURE_MAI_API_KEY: 'private-key', AZURE_MAI_MODEL: 'MAI-Image-2.6'
});

test('a stalled identity/provider becomes a terminal failed job with correlated safe records and no retry', async () => {
  const logs = [];
  let calls = 0;
  const store = new JobStore({ timeoutMs: 20, logger: { info: line => logs.push(JSON.parse(line)) },
    provider: async (model, person, garment, options) => {
      calls++;
      options.onStage('identity');
      await new Promise(() => {});
    } });
  const job = store.create('private-owner', 'safe-request', 'private-fingerprint', ['mai'], config(), Buffer.from('private-photo'), Buffer.from('private-garment'));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(job.status, 'failed');
  assert.equal(job.results.mai.error.code, 'generation-timeout');
  assert.equal(store.active, 0);
  assert.equal(calls, 1);
  assert.deepEqual(logs.map(event => event.stage), ['accepted', 'identity', 'completed']);
  assert.ok(logs.every(event => event.jobId === job.id && event.requestId === 'safe-request'));
  assert.equal(publicJob(job).events.at(-1).code, 'generation-timeout');
  assert.doesNotMatch(JSON.stringify(logs), /private-owner|private-key|private-photo|private-garment|private-fingerprint/);
  store.close();
});

test('provider failure records status, bounded retry-after and reference but never its raw body or credentials', async () => {
  const stages = [];
  let calls = 0;
  await assert.rejects(() => editImage(config().models.mai, Buffer.from('person'), Buffer.from('garment'), {
    onStage: stage => stages.push(stage),
    fetchImpl: async () => {
      calls++;
      return new Response('private provider diagnostic', { status: 429,
        headers: { 'retry-after': '30', 'x-request-id': 'reference-429' } });
    }
  }), error => {
    assert.equal(error.code, 'azure-429');
    assert.deepEqual(error.details, { providerStatus: 429, providerRequestId: 'reference-429', retryAfterSeconds: 30 });
    assert.doesNotMatch(JSON.stringify(error), /private/);
    return true;
  });
  assert.equal(calls, 1);
  assert.deepEqual(stages, ['identity', 'model-request']);
});
