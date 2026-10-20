import { createHash } from 'node:crypto';
import { AppError } from './errors.js';
import { bodyBytes } from './http.js';
import { MAX_REQUEST_BYTES, sanitizeImage } from './images.js';
import { modeContract } from './modes.js';
import { selectModels } from './config.js';

export async function prepareUpload(req, config, samples) {
  if (!req.headers['content-type']?.startsWith('multipart/form-data;')) {
    throw new AppError(400, 'invalid-upload', 'Use multipart form data.');
  }
  const bytes = await bodyBytes(req, MAX_REQUEST_BYTES);
  let form;
  try {
    form = await new Request('http://localhost', {
      method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: bytes
    }).formData();
  } catch {
    throw new AppError(400, 'invalid-upload', 'Invalid multipart upload.');
  }
  if (form.getAll('mode').length > 1) throw new AppError(400, 'invalid-mode', 'Provide one clothing mode.');
  const mode = form.has('mode') ? form.get('mode') : 'baseline';
  if (form.has('mode') && mode === 'baseline') throw new AppError(400, 'invalid-mode', 'Select upper, lower or full.');
  const contract = modeContract(mode);
  const required = ['person', ...contract.fields, 'models', 'consent'];
  const allowed = form.has('mode') ? [...required, 'mode'] : required;
  if ([...form.keys()].some(key => !allowed.includes(key)) ||
      required.some(key => form.getAll(key).length !== 1)) {
    throw new AppError(400, 'invalid-upload', 'Provide exactly one person, garment, model selection and consent.');
  }
  if (form.get('consent') !== 'true') throw new AppError(400, 'consent-required', 'Photo transmission consent is required.');
  let selected;
  try { selected = JSON.parse(form.get('models')); } catch {
    throw new AppError(400, 'invalid-models', 'Invalid model selection.');
  }
  const personInput = form.get('person');
  if (personInput instanceof File) {
    const hash = createHash('sha256').update(Buffer.from(await personInput.arrayBuffer())).digest('hex');
    const sample = samples.items.find(item => item.category === 'person' && item.sha256 === hash);
    if (sample?.supportsModes && !sample.supportsModes.includes(mode === 'baseline' ? 'upper' : mode)) {
      throw new AppError(400, 'sample-mode-mismatch', '이 샘플은 상의용입니다. 전신 사진을 선택해 주세요.');
    }
  }
  const models = selectModels(selected, config);
  const person = await sanitizeImage(personInput, 'person');
  const garment = await sanitizeImage(form.get(contract.fields[0]), contract.fields[0]);
  const lowerGarment = mode === 'full' ? await sanitizeImage(form.get('lower'), 'lower') : undefined;
  const fingerprint = createHash('sha256').update(JSON.stringify([mode, models]))
    .update(person).update(garment).update(lowerGarment || '').digest('hex');
  return { mode, models, person, garment, lowerGarment, fingerprint };
}
