import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.git', '.playwright-mcp', 'node_modules', 'test-results', 'coverage',
  '.local-deploy', '.deploy-context', 'sample-images', 'local', '__pycache__']);

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) await check(path);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Syntax check failed: ${path}`);
    }
  }
}

await check(root);
