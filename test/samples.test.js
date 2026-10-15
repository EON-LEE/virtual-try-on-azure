import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import manifest from '../samples/manifest.json' with { type: 'json' };
import excluded from '../samples/excluded-hashes.json' with { type: 'json' };
import { sanitizeImage } from '../src/images.js';
import { existsSync } from 'node:fs';
import { syntheticSamples } from './fixtures.js';

test('research samples have six upper-only people and eight unpaired tops, with attribution and no disposed hashes', async () => {
  const ids = new Set();
  assert.equal(manifest.items.filter(item => item.category === 'person').length, 6);
  assert.equal(manifest.items.filter(item => item.category === 'upper').length, 8);
  assert.equal(manifest.items.filter(item => item.category === 'lower').length, 0);
  const people = manifest.items.filter(item => item.category === 'person');
  const tops = manifest.items.filter(item => item.category === 'upper');
  assert.ok(people.every(person => person.supportsModes.join(',') === 'upper'));
  assert.ok(people.every(person => tops.every(top => person.id.split('-').at(-1) !== top.id.split('-').at(-1))));
  for (const item of manifest.items) {
    assert.ok(!ids.has(item.id));
    ids.add(item.id);
    assert.equal(item.src, `/api/samples/${item.filename}`);
    assert.match(item.filename, /^viton-(person|upper)-[0-9_]+\.jpg$/);
    assert.ok(item.label && item.source && item.license && item.attribution);
    assert.equal(new URL(item.sourceUrl).protocol, 'https:');
    assert.equal(new URL(item.licenseUrl).protocol, 'https:');
    assert.match(item.license, /CC BY-NC/);
    assert.match(item.attribution, /CVPR 2021/);
    assert.equal(item.mirrorBytesVerifiedAgainstOfficialArchive, false);
  }
});

test('local research photo bytes match the retained manifest and no original or normalized hash was discarded', {
  skip: !existsSync(new URL('../sample-images/', import.meta.url)) && 'Licensed photo pack is not committed; run node scripts/prepare-samples.js for local photo validation.'
}, async () => {
  for (const item of manifest.items) {
    const bytes = await readFile(new URL(`../sample-images/${item.filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.ok(!excluded.sha256.includes(item.sha256));
    const normalized = await sanitizeImage(new File([bytes], item.filename, { type: 'image/jpeg' }), item.category);
    assert.ok(!excluded.sha256.includes(createHash('sha256').update(normalized).digest('hex')));
    const image = await sharp(bytes).metadata();
    assert.ok(['png', 'jpeg'].includes(image.format));
    assert.ok(image.width <= 4096 && image.height <= 4096);
    assert.ok(bytes.length <= 10 * 1024 * 1024);
  }
});

test('sample image and manifest require login; static URLs and unlisted files never serve photographs', async t => {
  const fixture = await syntheticSamples();
  t.after(fixture.close);
  const server = createServer(loadConfig({}), fixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/api/samples/manifest`)).status, 401);
  assert.equal((await fetch(`${origin}${manifest.items[0].src}`)).status, 401);
  const login = await fetch(`${origin}/api/session`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
    body: '{"username":"test","password":"test"}' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { cookie };
  const manifestResponse = await fetch(`${origin}/api/samples/manifest`, { headers });
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get('content-type'), /application\/json/);
  for (const item of (await manifestResponse.json()).items) {
    const sample = await fetch(`${origin}${item.src}`, { headers });
    assert.equal(sample.status, 200);
    assert.equal(sample.headers.get('cache-control'), 'no-store');
    assert.match(sample.headers.get('content-type'), /image\/jpeg/);
    assert.deepEqual(Buffer.from(await sample.arrayBuffer()), fixture.bytes);
    assert.equal((await fetch(`${origin}/samples/${item.filename}`, { headers })).status, 404);
  }
  assert.equal((await fetch(`${origin}/samples/manifest.json`, { headers })).status, 404);
  assert.equal((await fetch(`${origin}/samples/person-street.jpg`, { headers })).status, 404);
  assert.equal((await fetch(`${origin}/api/samples/unlisted.jpg`, { headers })).status, 404);
  assert.equal((await fetch(`${origin}/api/samples/excluded-hashes.json`, { headers })).status, 404);
  assert.equal((await fetch(`${origin}/samples/missing.jpg`)).status, 404);
  assert.equal((await fetch(`${origin}/samples/private.json`)).status, 404);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  const notices = await fetch(`${origin}/samples/NOTICES.txt`);
  assert.equal(notices.status, 200);
  assert.match(notices.headers.get('content-type'), /text\/plain/);
  assert.match(await notices.text(), /CC BY-NC 4.0/);
  await fetch(`${origin}/api/session`, { method: 'DELETE', headers: { cookie, 'x-studio-request': '1' } });
  assert.equal((await fetch(`${origin}${manifest.items[0].src}`, { headers })).status, 401);
});

test('known upper-only sample bytes cannot bypass lower/full restrictions by upload', async t => {
  const fixture = await syntheticSamples();
  t.after(fixture.close);
  const server = createServer(loadConfig({}), fixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${origin}/api/session`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
    body: '{"username":"test","password":"test"}' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const seated = fixture.bytes;
  for (const mode of ['lower', 'full']) {
    const form = new FormData();
    form.set('mode', mode); form.set('models', '["mai"]'); form.set('consent', 'true');
    form.set('person', new File([seated], 'renamed-upload.jpg', { type: 'image/jpeg' }));
    form.set('lower', new File(['fixture'], 'lower.png', { type: 'image/png' }));
    if (mode === 'full') form.set('upper', new File(['fixture'], 'upper.png', { type: 'image/png' }));
    const response = await fetch(`${origin}/api/jobs`, { method: 'POST', body: form,
      headers: { cookie, 'x-studio-request': '1', 'x-request-id': `sample-${mode}-1234567890` } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'sample-mode-mismatch');
  }
});
