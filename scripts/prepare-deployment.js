import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const directory = resolve('.local-deploy');
await mkdir(directory, { recursive: true, mode: 0o700 });
const operatorPath = resolve(directory, 'demo-operator-token.txt');
let operatorToken;
try { operatorToken = (await readFile(operatorPath, 'utf8')).trim(); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  operatorToken = randomBytes(48).toString('base64url');
  await writeFile(operatorPath, operatorToken, { mode: 0o600, flag: 'wx' });
}
if (operatorToken.length < 32) throw new Error('Operator secret must be at least 32 characters.');
const parameters = {
  $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    operatorToken: { value: operatorToken },
    enableInference: { value: false },
    maxModelAttempts: { value: 0 },
    inferenceExpiresAt: { value: '' }
  }
};
await writeFile(resolve(directory, 'hosting.parameters.json'), JSON.stringify(parameters), { mode: 0o600 });
console.log('Prepared private operator deployment parameters under .local-deploy; no secret values printed.');
