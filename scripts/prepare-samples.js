import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import manifest from '../samples/manifest.json' with { type: 'json' };
import excluded from '../samples/excluded-hashes.json' with { type: 'json' };
import { sanitizeImage } from '../src/images.js';

// Images stay outside public Git and are included only in the private build pack.
const directory = new URL('../sample-images/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const item of manifest.items) {
  if (!/^viton-(person|upper)-[0-9_]+\.jpg$/.test(item.filename) ||
      !item.downloadUrl.startsWith('https://huggingface.co/datasets/TryOnVirtual/VITON-HD-TEST/resolve/fbec00f2f68cacbcdd7e1dee047405e7319226c6/')) {
    throw new Error('Sample source must match the reviewed pinned manifest.');
  }
  const file = new URL(item.filename, directory);
  let bytes;
  try { bytes = await readFile(file); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(item.downloadUrl, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Sample download failed (${response.status}). No automatic retry.`);
    const length = Number(response.headers.get('content-length'));
    if (length > 10 * 1024 * 1024) throw new Error('Sample download exceeds the size limit.');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length > 10 * 1024 * 1024 || hash !== item.sha256 || excluded.sha256.includes(hash)) {
    throw new Error(`Sample ${item.id} failed its original-byte hash check.`);
  }
  const normalized = await sanitizeImage(new File([bytes], item.filename, { type: 'image/jpeg' }), item.category);
  if (excluded.sha256.includes(createHash('sha256').update(normalized).digest('hex'))) {
    throw new Error(`Sample ${item.id} matches a discarded normalized image.`);
  }
  await writeFile(file, bytes);
}
console.log('Verified 14 original research photos in ignored sample-images/. Noncommercial research use only; see public/samples/NOTICES.txt.');
