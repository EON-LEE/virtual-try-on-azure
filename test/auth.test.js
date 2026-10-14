import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadConfig, publicModels } from '../src/config.js';
import { createAuthHeaders, COGNITIVE_SCOPE, inspectCliAccount } from '../src/auth.js';
import { editImage } from '../src/provider.js';

const subscriptionId = '11111111-1111-1111-1111-111111111111';
const tenantId = '22222222-2222-2222-2222-222222222222';
const principalId = '33333333-3333-3333-3333-333333333333';
const env = {
  ENABLE_AZURE_INFERENCE: 'true', AZURE_AUTH_MODE: 'entra-cli',
  AZURE_SUBSCRIPTION_ID: subscriptionId, AZURE_TENANT_ID: tenantId,
  AZURE_EXPECTED_PRINCIPAL_ID: principalId,
  AZURE_SUNBURST_ENDPOINT: 'https://test.openai.azure.com', AZURE_SUNBURST_DEPLOYMENT: 'test',
  AZURE_MAI_ENDPOINT: 'https://test.services.ai.azure.com', AZURE_MAI_DEPLOYMENT: 'test'
};
const account = { id: subscriptionId, tenantId, state: 'Enabled', user: { type: 'user' } };
function token(overrides = {}, expiresIn = 3600) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const claims = { tid: tenantId, oid: principalId, aud: 'https://cognitiveservices.azure.com/', exp, ...overrides };
  return { token: `test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`, expiresOnTimestamp: exp * 1000 };
}

test('Entra configuration is explicit and does not reveal identity or credentials publicly', () => {
  assert.throws(() => loadConfig({ ...env, AZURE_TENANT_ID: '' }), /explicit/);
  assert.throws(() => loadConfig({ ...env, AZURE_SUBSCRIPTION_ID: '$(malicious)' }), /UUIDs/);
  assert.throws(() => loadConfig({ ...env, AZURE_AUTH_MODE: 'default' }), /key or entra-cli/);
  const config = loadConfig(env);
  assert.equal(config.models.sunburst.ready, true);
  assert.equal(config.models.sunburst.key, '');
  assert.doesNotMatch(JSON.stringify(publicModels(config)), /22222222|33333333/);
});

test('official bearer helper caches a verified process-only token across both models', async () => {
  let accounts = 0, tokens = 0;
  const config = loadConfig(env);
  const headers = createAuthHeaders({
    accountInspector: async id => { assert.equal(id, subscriptionId); accounts++; return account; },
    credentialFactory: options => {
      assert.deepEqual(options, { subscription: subscriptionId, tenantId, processTimeoutInMs: 15_000 });
      return { getToken: async scope => { assert.deepEqual(scope, [COGNITIVE_SCOPE]); tokens++; return token(); } };
    }
  });
  const first = await headers(config.models.sunburst);
  const second = await headers(config.models.mai);
  assert.equal(first.Authorization, second.Authorization);
  assert.match(first.Authorization, /^Bearer /);
  assert.equal(first['api-key'], undefined);
  assert.equal(tokens, 1);
  assert.equal(accounts, 1);
});

test('near-expiry cache is refreshed and every new token checks subscription and principal', async () => {
  let tokens = 0, accounts = 0;
  const model = loadConfig(env).models.mai;
  const headers = createAuthHeaders({
    accountInspector: async () => { accounts++; return account; },
    credentialFactory: () => ({ getToken: async () => { tokens++; return token({}, tokens === 1 ? 90 : 3600); } })
  });
  await headers(model);
  await headers(model);
  assert.equal(tokens, 2);
  assert.equal(accounts, 2);
});

test('concurrent refresh coalesces and mismatched refresh never uses the old cached token', async () => {
  let tokens = 0;
  let accountValue = account;
  const config = loadConfig(env);
  const headers = createAuthHeaders({
    accountInspector: async () => accountValue,
    credentialFactory: () => ({ getToken: async () => {
      tokens++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return token({}, 90);
    } })
  });
  await Promise.all([headers(config.models.sunburst), headers(config.models.mai)]);
  assert.equal(tokens, 1);
  accountValue = { ...account, tenantId: principalId };
  await assert.rejects(() => headers(config.models.sunburst), /could not be verified/);
  assert.equal(tokens, 1);
  accountValue = account;
  await headers(config.models.mai);
  assert.equal(tokens, 2);
});

test('identity mismatch and SDK errors fail closed before any image HTTP request', async () => {
  for (const [accountValue, tokenValue] of [
    [{ ...account, id: tenantId }, token()],
    [{ ...account, tenantId: principalId }, token()],
    [{ ...account, state: 'Disabled' }, token()],
    [{ ...account, user: { type: 'servicePrincipal' } }, token()],
    [account, token({ tid: principalId })],
    [account, token({ oid: tenantId })],
    [account, token({ aud: 'https://management.azure.com/' })],
    [account, token({}, -1)],
    [account, { token: 'secret-invalid-token', expiresOnTimestamp: Date.now() + 3600_000 }]
  ]) {
    let fetches = 0;
    const headers = createAuthHeaders({
      accountInspector: async () => accountValue,
      credentialFactory: () => ({ getToken: async () => tokenValue })
    });
    await assert.rejects(() => editImage(loadConfig(env).models.mai, Buffer.from('a'), Buffer.from('b'), {
      getAuthHeaders: headers, fetchImpl: async () => { fetches++; }
    }), error => error.code === 'azure-identity-unavailable' && !error.message.includes('secret'));
    assert.equal(fetches, 0);
  }
  const headers = createAuthHeaders({
    accountInspector: async () => { throw new Error('private account/token details'); },
    credentialFactory: () => ({ getToken: async () => token() })
  });
  await assert.rejects(() => headers(loadConfig(env).models.mai), error => !error.message.includes('private'));
  await assert.rejects(() => inspectCliAccount('bad;az login'), /Invalid subscription/);
});

test('key mode stays compatible; disabled inference cannot acquire tokens or make calls', async () => {
  const key = loadConfig({ ENABLE_AZURE_INFERENCE: 'true', AZURE_SUNBURST_ENDPOINT: env.AZURE_SUNBURST_ENDPOINT,
    AZURE_SUNBURST_DEPLOYMENT: 'test', AZURE_SUNBURST_API_KEY: 'test-key' }).models.sunburst;
  let credentials = 0;
  const headers = createAuthHeaders({ credentialFactory: () => { credentials++; throw new Error('must not run'); } });
  assert.deepEqual(await headers(key), { 'api-key': 'test-key' });
  const disabled = loadConfig({ ...env, ENABLE_AZURE_INFERENCE: 'false' }).models.sunburst;
  let fetches = 0, authCalls = 0;
  await assert.rejects(() => editImage(disabled, Buffer.from('a'), Buffer.from('b'), {
    getAuthHeaders: async () => { authCalls++; return {}; },
    fetchImpl: async () => { fetches++; }
  }), /disabled/);
  assert.equal(authCalls + fetches + credentials, 0);
});

test('both adapters use Bearer headers and do not retry 401 or fall back to keys', async () => {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  const config = loadConfig(env);
  const headers = createAuthHeaders({
    accountInspector: async () => account,
    credentialFactory: () => ({ getToken: async () => token() })
  });
  let fetches = 0;
  for (const model of Object.values(config.models)) {
    await editImage(model, image, image, { getAuthHeaders: headers, fetchImpl: async (_, options) => {
      fetches++;
      assert.match(options.headers.Authorization, /^Bearer /);
      assert.equal(options.headers['api-key'], undefined);
      return Response.json({ data: [{ b64_json: image.toString('base64') }] });
    } });
  }
  await assert.rejects(() => editImage(config.models.mai, image, image, {
    getAuthHeaders: headers, fetchImpl: async () => { fetches++; return new Response('secret', { status: 401 }); }
  }), /authentication failed/);
  assert.equal(fetches, 3);
});
