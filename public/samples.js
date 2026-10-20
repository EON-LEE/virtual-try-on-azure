import { errorMessage } from './network.js';

export async function loadSampleGallery({ $, roles, state, revisions, network, controls, chooseFile, error }, timeoutMs) {
  const manifest = await network.json('/api/samples/manifest', {}, timeoutMs);
  if (!Array.isArray(manifest.items)) throw new Error('샘플 목록을 확인해 주세요.');
  for (const role of roles) $(`${role}-samples`).replaceChildren();
  $('sample-credits').replaceChildren();
  for (const item of manifest.items) {
    if (!roles.includes(item.category) || !/^\/api\/samples\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/.test(item.src)) throw new Error('샘플 목록을 확인해 주세요.');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'sample'; button.dataset.id = item.id; button.dataset.label = item.label;
    button.title = item.notes || item.label;
    button.setAttribute('aria-label', `${item.label} 선택`); button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img');
    image.src = item.src; image.alt = ''; image.loading = 'lazy';
    button.append(image);
    button.addEventListener('click', async () => {
      if (state.busy) return;
      button.disabled = true;
      const epoch = state.epoch;
      const revision = ++revisions[item.category];
      state.loading++; controls();
      try {
        const blob = await network.blob(item.src);
        if (epoch !== state.epoch || revision !== revisions[item.category]) return;
        $(item.category).value = '';
        await chooseFile(item.category, new File([blob], item.src.split('/').pop(), { type: blob.type }), item.id);
      } catch (cause) {
        if (epoch === state.epoch && revision === revisions[item.category]) error(errorMessage(cause));
      } finally { button.disabled = false; state.loading--; controls(); }
    });
    $(`${item.category}-samples`).append(button);
    if (item.attribution) {
      const credit = document.createElement('p'); credit.textContent = item.attribution;
      for (const [value, label] of [[item.sourceUrl, '원본'], [item.licenseUrl, item.license]]) {
        if (!value) continue;
        if (new URL(value).protocol !== 'https:') throw new Error('샘플 출처를 확인해 주세요.');
        const link = document.createElement('a'); link.href = value; link.textContent = ` · ${label}`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; credit.append(link);
      }
      if (item.changes) credit.append(document.createTextNode(` · ${item.changes}`));
      if (item.notes) credit.append(document.createTextNode(` · ${item.notes}`));
      $('sample-credits').append(credit);
    }
  }
  state.samples = manifest.items;
  controls();
}
