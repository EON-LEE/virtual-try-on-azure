import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MAX_IMAGE_BYTES } from './images.js';

export const unavailableSamples = reason => ({ available: false, reason, items: [] });

export async function loadSamples(manifest, directory, enabled, logger) {
  if (!enabled) return unavailableSamples('research-samples-disabled');
  try {
    if (!manifest.items.length) return unavailableSamples('sample-pack-missing');
    for (const item of manifest.items) {
      if (!/^[a-zA-Z0-9_-]+\.jpg$/.test(item.filename) || item.src !== `/api/samples/${item.filename}`) {
        throw new Error('Invalid sample manifest');
      }
      const bytes = await readFile(new URL(item.filename, directory));
      if (bytes.length > MAX_IMAGE_BYTES ||
          createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
        throw new Error('Invalid sample pack');
      }
    }
    return { ...manifest, available: true, reason: null };
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'sample-pack-missing' : 'sample-pack-unavailable';
    logger.error('studio-samples-unavailable', { code: reason });
    return unavailableSamples(reason);
  }
}
