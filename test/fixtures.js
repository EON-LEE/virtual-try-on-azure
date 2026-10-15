import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import manifest from '../samples/manifest.json' with { type: 'json' };

export async function syntheticSamples() {
  const directory = await mkdtemp(join(tmpdir(), 'vto-synthetic-samples-'));
  const bytes = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#b9bdd1' } }).jpeg().toBuffer();
  const hash = createHash('sha256').update(bytes).digest('hex');
  for (const item of manifest.items) await writeFile(join(directory, item.filename), bytes);
  return {
    bytes,
    samples: { ...manifest, items: manifest.items.map(item => ({ ...item, sha256: hash })) },
    sampleDirectory: pathToFileURL(`${directory}${sep}`),
    close: () => rm(directory, { recursive: true })
  };
}

export function activateForTest(store, config) {
  store.gate.activate({ nonce: store.gate.state().nonce, allowance: config.limits.attemptLimit,
    expiresAt: new Date(config.limits.expiresAt).toISOString() }, config);
}

export async function loginForTest(origin) {
  const response = await fetch(`${origin}/api/session`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-request': '1', origin },
    body: JSON.stringify({ username: 'test', password: 'test' }) });
  if (!response.ok) throw new Error('Fixture login failed.');
  return response.headers.get('set-cookie').split(';')[0];
}
