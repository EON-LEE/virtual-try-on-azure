import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const directory = resolve('.local-deploy');
await mkdir(directory, { recursive: true, mode: 0o700 });
const secretPath = resolve(directory, 'demo-access-token.txt');
let secret;
try { secret = (await readFile(secretPath, 'utf8')).trim(); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secret = randomBytes(48).toString('base64url');
  await writeFile(secretPath, secret, { mode: 0o600, flag: 'wx' });
}
if (secret.length < 32) throw new Error('Existing local access token is invalid; do not deploy.');
const operatorPath = resolve(directory, 'demo-operator-token.txt');
let operatorToken;
try { operatorToken = (await readFile(operatorPath, 'utf8')).trim(); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  operatorToken = randomBytes(48).toString('base64url');
  await writeFile(operatorPath, operatorToken, { mode: 0o600, flag: 'wx' });
}
if (operatorToken.length < 32 || operatorToken === secret) throw new Error('Operator and invitation secrets must be distinct.');
const parameters = {
  $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    accessToken: { value: secret },
    operatorToken: { value: operatorToken },
    enableInference: { value: false },
    maxModelAttempts: { value: 0 },
    inferenceExpiresAt: { value: '' }
  }
};
await writeFile(resolve(directory, 'hosting.parameters.json'), JSON.stringify(parameters), { mode: 0o600 });
console.log('Prepared private deployment parameters and invite token under .local-deploy; no secret values printed.');
