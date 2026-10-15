import { AppError } from './errors.js';

export const MODEL_IDS = ['sunburst', 'mai'];
export const MAI_MODEL = 'MAI-Image-2.6';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function endpoint(value, suffixes) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch {
    throw new Error('Azure endpoint must be a valid resource HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' ||
      !suffixes.some(suffix => url.hostname.endsWith(suffix))) {
    throw new Error('Use an Azure resource root endpoint, not an external inference URL.');
  }
  return url.origin;
}

export function loadConfig(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  const operatorToken = env.DEMO_OPERATOR_TOKEN || '';
  if (operatorToken && operatorToken.length < 32) {
    throw new Error('DEMO_OPERATOR_TOKEN must be 32+ characters.');
  }
  const local = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const origin = env.APP_ORIGIN || '';
  if (!local && !origin) {
    throw new Error('Non-loopback binding requires APP_ORIGIN.');
  }
  if (origin && (new URL(origin).origin !== origin ||
      (!local && !origin.startsWith('https://')))) {
    throw new Error('APP_ORIGIN must be a canonical origin, HTTPS for public hosting.');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const enabled = env.ENABLE_AZURE_INFERENCE === 'true';
  const auth = {
    mode: env.AZURE_AUTH_MODE || 'key',
    subscriptionId: env.AZURE_SUBSCRIPTION_ID || '',
    tenantId: env.AZURE_TENANT_ID || '',
    principalId: env.AZURE_EXPECTED_PRINCIPAL_ID || '',
    clientId: env.AZURE_MANAGED_IDENTITY_CLIENT_ID || ''
  };
  if (!['key', 'entra-cli', 'managed-identity'].includes(auth.mode)) throw new Error('AZURE_AUTH_MODE must be key or entra-cli or managed-identity.');
  const identityConfigured = (auth.mode === 'managed-identity'
    ? [auth.clientId, auth.tenantId, auth.principalId]
    : [auth.subscriptionId, auth.tenantId, auth.principalId]).every(value => UUID.test(value));
  if ([auth.subscriptionId, auth.tenantId, auth.principalId, auth.clientId].some(value => value && !UUID.test(value))) {
    throw new Error('Azure subscription, tenant and expected principal IDs must be UUIDs.');
  }
  if (enabled && auth.mode !== 'key' && !identityConfigured) {
    throw new Error('Entra CLI inference requires explicit subscription, tenant and expected principal IDs.');
  }
  const attemptLimit = Number(env.DEMO_MAX_MODEL_ATTEMPTS || 0);
  const expiresAt = env.DEMO_INFERENCE_EXPIRES_AT ? Date.parse(env.DEMO_INFERENCE_EXPIRES_AT) : 0;
  if (!Number.isInteger(attemptLimit) || attemptLimit < 0 || attemptLimit > 100 ||
      !Number.isFinite(expiresAt)) throw new Error('Demo requires 0-100 model attempts and an ISO inference expiry.');
  if (enabled && !local && (!attemptLimit || expiresAt <= Date.now())) {
    throw new Error('Hosted inference requires a positive attempt limit and a future inference expiry.');
  }
  const version = env.AZURE_SUNBURST_API_VERSION || '2025-04-01-preview';
  if (!/^\d{4}-\d{2}-\d{2}(-preview)?$/.test(version)) throw new Error('Invalid Azure API version.');
  const models = {
    sunburst: {
      id: 'sunburst', label: 'GPT Image 2.5 Sunburst', model: 'GPT-Image-2.5-Sunburst',
      endpoint: endpoint(env.AZURE_SUNBURST_ENDPOINT, ['.openai.azure.com']),
      deployment: env.AZURE_SUNBURST_DEPLOYMENT || '',
      key: env.AZURE_SUNBURST_API_KEY || '', version, preview: false
    },
    mai: {
      id: 'mai', label: 'MAI Image 2.6', model: env.AZURE_MAI_MODEL || MAI_MODEL,
      endpoint: endpoint(env.AZURE_MAI_ENDPOINT, ['.services.ai.azure.com']),
      deployment: env.AZURE_MAI_DEPLOYMENT || '',
      key: env.AZURE_MAI_API_KEY || '', preview: true
    }
  };
  if (models.mai.model && models.mai.model !== MAI_MODEL) {
    throw new Error('This adapter supports only MAI-Image-2.6 edits. Do not silently substitute a variant.');
  }
  for (const model of Object.values(models)) {
    model.auth = auth;
    model.ready = enabled && Boolean(model.endpoint && model.deployment && model.model &&
      (auth.mode === 'key' ? model.key : identityConfigured));
    model.reason = !enabled ? 'inference-disabled' : model.ready ? null : 'not-configured';
  }
  return { host, port, operatorToken, origin, models, auth, limits: { attemptLimit, expiresAt } };
}

export function selectModels(value, config) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 ||
      new Set(value).size !== value.length || value.some(id => !MODEL_IDS.includes(id))) {
    throw new AppError(400, 'invalid-models', 'Select Sunburst, MAI, or both explicitly.');
  }
  for (const id of value) {
    if (!config.models[id].ready) throw new AppError(503, 'model-unavailable', `${config.models[id].label} is not connected or inference is disabled.`);
  }
  return value;
}

export function publicModels(config) {
  return Object.values(config.models).map(({ id, label, model, ready, reason, preview }) =>
    ({ id, label, model: model || 'Variant not configured', ready, reason, preview }));
}
