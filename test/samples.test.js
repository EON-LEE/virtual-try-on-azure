import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

test('published sample manifest supplies multiple real photo inputs per category with provenance and matching hashes', async () => {
  const root = new URL('../public/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('samples/manifest.json', root), 'utf8'));
  const ids = new Set();
  for (const category of ['person', 'upper', 'lower']) {
    assert.ok(manifest.items.filter(item => item.category === category).length >= 2, `Multiple ${category} samples are required.`);
  }
  for (const item of manifest.items) {
    assert.ok(!ids.has(item.id));
    ids.add(item.id);
    assert.match(item.src, /^\/samples\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/);
    assert.ok(item.label && item.source && item.license && item.attribution);
    assert.equal(new URL(item.sourceUrl).protocol, 'https:');
    assert.equal(new URL(item.licenseUrl).protocol, 'https:');
    const bytes = await readFile(new URL(`.${item.src}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    const image = await sharp(bytes).metadata();
    assert.ok(['png', 'jpeg'].includes(image.format));
    assert.ok(image.width <= 4096 && image.height <= 4096);
    assert.ok(bytes.length <= 10 * 1024 * 1024);
  }
});

test('sample routes serve only named local images and manifest, without a provider call', async t => {
  const server = createServer(loadConfig({}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const manifestResponse = await fetch(`${origin}/samples/manifest.json`);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get('content-type'), /application\/json/);
  const manifest = await manifestResponse.json();
  const sample = await fetch(`${origin}${manifest.items[0].src}`);
  assert.equal(sample.status, 200);
  assert.match(sample.headers.get('content-type'), /image\/(jpeg|png)/);
  assert.equal((await fetch(`${origin}/samples/missing.jpg`)).status, 404);
  assert.equal((await fetch(`${origin}/samples/private.json`)).status, 404);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  const notices = await fetch(`${origin}/samples/NOTICES.txt`);
  assert.equal(notices.status, 200);
  assert.match(notices.headers.get('content-type'), /text\/plain/);
  assert.match(await notices.text(), /ShareAlike/);
});

test('known upper-only sample bytes cannot bypass lower/full restrictions by upload', async t => {
  const server = createServer(loadConfig({}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${origin}/api/session`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
    body: '{"username":"test","password":"test"}' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const seated = await readFile(new URL('../public/samples/person-seated.jpg', import.meta.url));
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
