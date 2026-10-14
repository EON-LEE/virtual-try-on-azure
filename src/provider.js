import { AppError } from './errors.js';
import { sanitizeOutput } from './images.js';
import { TRY_ON_PROMPT } from './prompt.js';
import { authHeaders } from './auth.js';

export function buildRequest(model, person, garment) {
  const body = new FormData();
  body.set('model', model.deployment);
  body.set('prompt', TRY_ON_PROMPT);
  const field = model.id === 'sunburst' ? 'image[]' : 'image';
  body.append(field, new Blob([person], { type: 'image/png' }), 'person.png');
  body.append(field, new Blob([garment], { type: 'image/png' }), 'garment.png');
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

export async function editImage(model, person, garment, { fetchImpl = fetch, signal, getAuthHeaders = authHeaders } = {}) {
  if (!model.ready) throw new AppError(503, 'model-unavailable', 'Inference is disabled or this model is not configured.');
  signal?.throwIfAborted();
  const headers = await getAuthHeaders(model);
  signal?.throwIfAborted();
  const request = buildRequest(model, person, garment);
  let response;
  try {
    response = await fetchImpl(request.url, {
      ...request.options,
      headers,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000)
    });
  } catch (error) {
    throw new AppError(502, 'azure-connection', error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'Azure request timed out or was cancelled. It may still be billed; no retry was made.'
      : 'Azure connection failed. No retry was made.');
  }
  const requestId = response.headers.get('x-request-id') || response.headers.get('apim-request-id');
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(502, `azure-${response.status}`, providerMessages[response.status] || 'Azure generation failed. No retry was made.');
  }
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
    return { image, requestId: requestId?.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 128) || null };
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'invalid-provider-response', 'Azure returned an invalid response. No retry was made.');
  }
}
