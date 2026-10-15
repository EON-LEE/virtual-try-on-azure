import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AzureCliCredential, ManagedIdentityCredential, getBearerTokenProvider } from '@azure/identity';
import { AppError } from './errors.js';

export const COGNITIVE_SCOPE = 'https://cognitiveservices.azure.com/.default';
const runFile = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function inspectCliAccount(subscriptionId) {
  if (!UUID.test(subscriptionId)) throw new Error('Invalid subscription ID');
  const args = ['account', 'show', '--subscription', subscriptionId, '--output', 'json', '--only-show-errors'];
  const options = { timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true };
  // az.cmd needs cmd.exe on Windows; the sole variable is a UUID, never shell text.
  const result = process.platform === 'win32'
    ? await runFile(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', `az ${args.join(' ')}`], options)
    : await runFile('az', args, options);
  return JSON.parse(result.stdout);
}

function validateToken(token, auth) {
  if (!token || typeof token.token !== 'string' || !Number.isFinite(token.expiresOnTimestamp) ||
      token.expiresOnTimestamp <= Date.now() + 60_000) throw new Error('Invalid token expiry');
  const parts = token.token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token structure');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  // Identity guard for the SDK-acquired token, not a replacement for Azure signature validation.
  if (typeof claims.tid !== 'string' || claims.tid.toLowerCase() !== auth.tenantId.toLowerCase() ||
      typeof claims.oid !== 'string' || claims.oid.toLowerCase() !== auth.principalId.toLowerCase() ||
      !['https://cognitiveservices.azure.com', 'https://cognitiveservices.azure.com/'].includes(claims.aud) ||
      !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() + 60_000) {
    throw new Error('Token identity mismatch');
  }
  return { ...token, expiresOnTimestamp: Math.min(token.expiresOnTimestamp, claims.exp * 1000) };
}

export function createAuthHeaders({
  credentialFactory = options => new AzureCliCredential(options),
  managedCredentialFactory = options => new ManagedIdentityCredential(options),
  accountInspector = inspectCliAccount,
  bearerFactory = getBearerTokenProvider
} = {}) {
  const providers = new WeakMap();
  return async model => {
    if (!model.ready) throw new AppError(503, 'model-unavailable', 'Inference is disabled or this model is not configured.');
    const auth = model.auth;
    if (auth.mode === 'key') {
      if (!model.key) throw new AppError(503, 'azure-auth-config', 'Azure API key is not configured.');
      return { 'api-key': model.key };
    }
    if (!['entra-cli', 'managed-identity'].includes(auth.mode) ||
        !(auth.mode === 'entra-cli' ? [auth.subscriptionId, auth.tenantId, auth.principalId]
          : [auth.clientId, auth.tenantId, auth.principalId]).every(value => UUID.test(value))) {
      throw new AppError(503, 'azure-auth-config', 'Explicit Entra CLI identity configuration is required.');
    }
    try {
      let provider = providers.get(auth);
      if (!provider) {
        const credential = auth.mode === 'managed-identity'
          ? managedCredentialFactory({ clientId: auth.clientId, retryOptions: { maxRetries: 0 } })
          : credentialFactory({ subscription: auth.subscriptionId, tenantId: auth.tenantId, processTimeoutInMs: 15_000 });
        let cachedToken = null;
        let pending = null;
        const guardedCredential = {
          getToken: async (scope, options) => {
            if (auth.mode === 'entra-cli') {
              const account = await accountInspector(auth.subscriptionId);
              if (typeof account.id !== 'string' || account.id.toLowerCase() !== auth.subscriptionId.toLowerCase() ||
                typeof account.tenantId !== 'string' || account.tenantId.toLowerCase() !== auth.tenantId.toLowerCase() ||
                account.state !== 'Enabled' || account.user?.type !== 'user') {
                throw new Error('CLI account mismatch');
              }
            }
            cachedToken = validateToken(await credential.getToken(scope, options), auth);
            return cachedToken;
          }
        };
        // Refresh synchronously, not the helper's background refresh using an old token.
        // A fresh helper per refresh also avoids SDK background retry loops on mismatch.
        provider = async () => {
          if (cachedToken && cachedToken.expiresOnTimestamp > Date.now() + 120_000) return cachedToken.token;
          if (!pending) {
            cachedToken = null;
            pending = bearerFactory(guardedCredential, COGNITIVE_SCOPE)().finally(() => { pending = null; });
          }
          return pending;
        };
        providers.set(auth, provider);
      }
      return { Authorization: `Bearer ${await provider()}` };
    } catch {
      providers.delete(auth);
      // SDK/CLI errors can contain account identifiers or tokens; never propagate them.
      throw new AppError(503, 'azure-identity-unavailable', 'Azure identity could not be verified for the configured tenant and principal. No inference request was sent; do not change shared login or defaults.');
    }
  };
}

export const authHeaders = createAuthHeaders();
