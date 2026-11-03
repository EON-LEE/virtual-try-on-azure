import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import sharp from 'sharp';
import { sanitizeImage, MAX_IMAGE_BYTES, labelDownload } from '../src/images.js';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { loadSamples } from '../src/samples.js';
import { reviewReport } from '../public/review.js';
import { syntheticSamples, demoEnv, loginForTest } from './fixtures.js';

test('noisy 12MP JPEGs normalize within 10 MiB and 2048px after EXIF orientation', async () => {
  const raw = randomFillSync(Buffer.alloc(4000 * 3000 * 3));
  for (const orientation of [1, 6]) {
    const bytes = await sharp(raw, { raw: { width: 4000, height: 3000, channels: 3 } })
      .jpeg({ quality: 65 }).withMetadata({ orientation }).toBuffer();
    assert.ok(bytes.length < MAX_IMAGE_BYTES);
    const output = await sanitizeImage(new File([bytes], 'camera.jpg', { type: 'image/jpeg' }), 'person');
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, orientation === 1 ? 2048 : 1536);
    assert.equal(metadata.height, orientation === 1 ? 1536 : 2048);
    assert.ok(output.length <= MAX_IMAGE_BYTES);
    assert.equal(metadata.exif, undefined);
  }
});

test('download disclosure adds a visible footer without changing photo pixels', async () => {
  const input = await sharp({ create: { width: 640, height: 850, channels: 3, background: '#aabbcc' } }).png().toBuffer();
  const output = await labelDownload(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 898);
  assert.equal(metadata.exif, undefined);
  assert.deepEqual(await sharp(output).extract({ left: 0, top: 0, width: 640, height: 850 }).removeAlpha().raw().toBuffer(),
    await sharp(input).raw().toBuffer());
  const footer = await sharp(output).extract({ left: 0, top: 850, width: 640, height: 48 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...footer.subarray(0, 3)], [32, 34, 42]);
  assert.ok(footer.includes(255), 'White disclosure text must be rasterized into the dark footer');
  await assert.rejects(labelDownload(Buffer.from('not-an-image')), { code: 'download-preparation-failed' });
});

test('missing, corrupt and disabled sample packs return an explicit unavailable catalog', async t => {
  const fixture = await syntheticSamples();
  t.after(fixture.close);
  const messages = [];
  const logger = { error: (event, detail) => messages.push([event, detail.code]) };
  const disabled = await loadSamples(fixture.samples, fixture.sampleDirectory, false, logger);
  assert.deepEqual(disabled, { available: false, reason: 'research-samples-disabled', items: [] });
  const missing = await loadSamples(fixture.samples, new URL('missing/', fixture.sampleDirectory), true, logger);
  assert.equal(missing.reason, 'sample-pack-missing');
  assert.deepEqual(missing.items, []);
  const corrupted = structuredClone(fixture.samples);
  corrupted.items[0].sha256 = '0'.repeat(64);
  assert.equal((await loadSamples(corrupted, fixture.sampleDirectory, true, logger)).reason, 'sample-pack-unavailable');
  assert.equal((await loadSamples(fixture.samples, fixture.sampleDirectory, true, logger)).items.length, 14);
  assert.equal(messages.length, 2);
});

test('upload-only HTTP mode never exposes the installed research pack', async t => {
  const fixture = await syntheticSamples();
  t.after(fixture.close);
  const server = createServer(loadConfig(demoEnv), fixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cookie = await loginForTest(origin);
  const catalog = await (await fetch(`${origin}/api/samples/manifest`, { headers: { cookie } })).json();
  assert.equal(catalog.reason, 'research-samples-disabled');
  assert.deepEqual(catalog.items, []);
  assert.equal((await fetch(`${origin}${fixture.samples.items[0].src}`, { headers: { cookie } })).status, 404);
});

test('review export allowlists metadata and retains failures and unreviewed results', () => {
  const job = { id: 'fixture', status: 'failed', mode: 'upper', createdAt: 0, promptVersion: 'upper-only-v2',
    photo: 'private-photo', owner: 'private-session', events: [{ photo: 'private-photo' }],
    results: {
      sunburst: { status: 'succeeded', model: 'sunburst', image: 'private-photo', imageUrl: 'blob:private-photo', durationMs: 42 },
      mai: { status: 'failed', model: 'mai', error: { code: 'generation-timeout', message: 'private-error' } }
    } };
  const report = reviewReport(job, { sunburst: { verdict: '수정 필요', notes: '로고 확인' } }, 'version', 1000);
  assert.deepEqual(report.summary, { selected: 2, succeeded: 1, accepted: 0 });
  assert.equal(report.results[0].notes, '로고 확인');
  assert.equal(report.results[1].errorCode, 'generation-timeout');
  assert.doesNotMatch(JSON.stringify(report), /private-|imageUrl|owner|events/);
  assert.equal(reviewReport(job, {}, 'version').results[0].verdict, '평가 전');
  assert.throws(() => reviewReport({ ...job, status: 'running' }, {}, 'version'), /완료/);
  assert.throws(() => reviewReport(job, { sunburst: { verdict: 'invalid' } }, 'version'), /판정/);
});
