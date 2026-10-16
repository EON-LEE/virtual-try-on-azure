import { AppError } from './errors.js';
import { sanitizeOutput } from './images.js';
import { modeContract } from './modes.js';
import { authHeaders } from './auth.js';

export function buildRequest(model, person, garment, { mode = 'baseline', lowerGarment } = {}) {
  const contract = modeContract(mode);
  if (!person?.length || !garment?.length || (mode === 'full' && !lowerGarment?.length) ||
      (mode !== 'full' && lowerGarment)) throw new AppError(400, 'missing-reference', 'Provide exactly the reference images required by this clothing mode.');
  const body = new FormData();
  body.set('model', model.deployment);
  body.set('prompt', contract.prompt);
  const field = model.id === 'sunburst' ? 'image[]' : 'image';
  body.append(field, new Blob([person], { type: 'image/png' }), 'person.png');
  body.append(field, new Blob([garment], { type: 'image/png' }), contract.names[0]);
  if (mode === 'full') body.append(field, new Blob([lowerGarment], { type: 'image/png' }), contract.names[1]);
  const maxImages = model.id === 'mai' ? 5 : 16;
  if (body.getAll(field).length > maxImages) throw new AppError(400, 'image-limit', 'Image count exceeds the documented provider limit.');
  let url;
  if (model.id === 'sunburst') {
    url = `${model.endpoint}/openai/deployments/${encodeURIComponent(model.deployment)}/images/edits?api-version=${model.version}`;
    body.set('n', '1');
  } else if (model.id === 'mai') {
    url = `${model.endpoint}/mai/v1/images/edits`;
    body.set('web_grounding', 'false');
  } else {
    throw new AppError(400, 'invalid-model', 'Unsupported model.');
  }
  return { url, options: { method: 'POST', body, redirect: 'error' } };
}

const providerMessages = {
  400: 'Azure rejected the input or content policy. Review the photographs and deployment compatibility.',
  401: 'Azure authentication failed. Ask the operator to check credentials.',
  403: 'Azure denied this deployment. Check model access and permissions.',
  404: 'Azure deployment or API version is unavailable.',
  429: 'Azure quota or rate limit reached. No automatic retry was made.'
};

export async function editImage(model, person, garment, { fetchImpl = fetch, signal, getAuthHeaders = authHeaders, mode = 'baseline', lowerGarment, onStage = () => {} } = {}) {
  if (!model.ready) throw new AppError(503, 'model-unavailable', 'Inference is disabled or this model is not configured.');
  signal?.throwIfAborted();
  const request = buildRequest(model, person, garment, { mode, lowerGarment });
  onStage('identity');
  const headers = await getAuthHeaders(model);
  signal?.throwIfAborted();
  onStage('model-request');
  let response;
  try {
    response = await fetchImpl(request.url, {
      ...request.options,
      headers,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000)
    });
  } catch (error) {
    throw new AppError(502, error.name === 'TimeoutError' || error.name === 'AbortError' ? 'azure-timeout' : 'azure-connection', error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'Azure request timed out or was cancelled. It may still be billed; no retry was made.'
      : 'Azure connection failed. No retry was made.');
  }
  const requestId = (response.headers.get('x-request-id') || response.headers.get('apim-request-id'))?.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 128) || null;
  const retryAfter = response.headers.get('retry-after');
  const details = { providerStatus: response.status, ...(requestId ? { providerRequestId: requestId } : {}),
    ...(/^\d{1,6}$/.test(retryAfter || '') ? { retryAfterSeconds: Number(retryAfter) } : {}) };
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(502, `azure-${response.status}`, providerMessages[response.status] || 'Azure generation failed. No retry was made.', details);
  }
  onStage('result-preparation');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 34 * 1024 * 1024) throw new Error('Response too large');
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(data.data) || data.data.length !== 1) throw new Error('Expected one result');
    const image = await sanitizeOutput(data.data[0].b64_json);
    return { image, requestId, providerStatus: response.status };
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'invalid-provider-response', 'Azure returned an invalid response. No retry was made.');
  }
}
