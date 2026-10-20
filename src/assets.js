import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const publicDirectory = new URL('../public/', import.meta.url);
const javascript = ['app.js', 'network.js', 'execution.js', 'images.js', 'samples.js'];
export const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ...javascript.map(name => [`/${name}`, [name, 'text/javascript; charset=utf-8']])
]);

export function assetVersion(entries) {
  const hash = createHash('sha256');
  for (const [name, content] of entries) hash.update(name).update('\0').update(content).update('\0');
  return hash.digest('hex').slice(0, 12);
}

export const clientVersion = assetVersion(await Promise.all([...staticFiles.values()].map(async ([name]) =>
  [name, await readFile(new URL(name, publicDirectory))])));
