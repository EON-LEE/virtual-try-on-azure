const $ = id => document.getElementById(id);
const roles = ['person', 'upper', 'lower'];
const models = ['sunburst', 'mai'];
const labels = { sunburst: 'Sunburst', mai: 'MAI Image 2.6' };
const messages = {
  'model-unavailable': '현재 생성을 사용할 수 없습니다.',
  'demo-budget-closed': '현재 생성을 사용할 수 없습니다.',
  'login-rate-limit': '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.',
  'demo-rate-limit': '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  busy: '다른 사진을 처리 중입니다. 잠시 후 다시 시도해 주세요.',
  'azure-400': '사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.',
  'azure-401': '모델에 연결하지 못했습니다.',
  'azure-403': '모델을 사용할 권한이 없습니다.',
  'azure-404': '모델을 사용할 수 없습니다.',
  'azure-429': '모델의 요청 한도에 도달했습니다.',
  'azure-connection': '모델 응답을 받지 못했습니다. 전송된 요청은 과금될 수 있습니다.',
  'invalid-provider-response': '모델의 결과를 불러오지 못했습니다.',
  'invalid-provider-image': '모델의 결과 사진을 읽지 못했습니다.',
  'invalid-image': '사진을 읽을 수 없습니다. PNG/JPEG, 장당 10 MiB, 한 변 4096px 이하로 선택해 주세요.',
  'generation-failed': '사진을 생성하지 못했습니다.'
};
const modeFields = { upper: ['upper'], lower: ['lower'], full: ['upper', 'lower'] };
const state = { config: null, files: {}, urls: {}, sampleIds: {}, samples: [], results: {}, job: null, busy: false, loading: 0, epoch: 0, controller: null, expiry: null };
const selected = () => models.filter(id => $(`select-${id}`).checked);
const required = () => ['person', ...modeFields[$('mode').value]];
const error = message => { $('error').textContent = message; $('error').hidden = !message; };
const status = message => { $('status').textContent = message; };

async function api(path, options = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  const response = await fetch(path, { ...options, headers: { 'x-studio-request': '1', ...options.headers }, signal });
  const data = await response.json();
  if (!response.ok) {
    const cause = new Error(messages[data.error?.code] || data.error?.message || `요청 실패 (${response.status})`);
    cause.status = response.status;
    cause.code = data.error?.code;
    throw cause;
  }
  return data;
}

function controls() {
  const personSample = state.samples.find(item => item.id === state.sampleIds.person);
  const unsupportedPerson = personSample?.supportsModes && !personSample.supportsModes.includes($('mode').value);
  $('input-fields').disabled = state.busy || !state.config?.authenticated;
  $('generate').disabled = state.busy || state.loading > 0 || !state.config?.authenticated ||
    required().some(role => !state.files[role]) || !selected().length || !$('consent').checked ||
    selected().some(id => !state.config.models.find(model => model.id === id)?.ready);
  if (unsupportedPerson) $('generate').disabled = true;
  $('generate').textContent = state.busy ? '만드는 중…' : '만들기';
  $('call-note').textContent = selected().length ? `선택한 모델 ${selected().length}개 · ${selected().length}회 생성` : '모델을 선택해 주세요.';
  $('clear').disabled = !state.config?.authenticated;
  const ids = selected();
  let visibleResults = 0;
  models.forEach(id => {
    const cell = $(`${id}-result`).closest('article');
    cell.hidden = !ids.includes(id) && !(ids.length === 0 && id === 'sunburst') && !state.results[id];
    if (!cell.hidden) visibleResults++;
  });
  $('preview-grid').dataset.columns = String(2 + visibleResults);
  $('sunburst-title').textContent = ids.length || state.results.sunburst ? 'Sunburst' : '결과';
  const fields = modeFields[$('mode').value];
  for (const role of ['upper', 'lower']) {
    $(`${role}-upload`).hidden = !fields.includes(role);
    $(`${role}-reference`).hidden = !fields.includes(role);
  }
  $('mode-guidance').textContent = $('mode').value === 'upper'
    ? '' : '허리와 다리가 보이는 전신 사진을 선택하세요.';
  if (unsupportedPerson) $('mode-guidance').textContent = '이 샘플은 상의용입니다. 전신 사진을 선택하세요.';
  for (const item of state.samples) {
    if (item.category !== 'person' || !item.supportsModes) continue;
    const button = [...$('person-samples').querySelectorAll('button')].find(button => button.dataset.id === item.id);
    if (button) {
      button.disabled = state.busy || !item.supportsModes.includes($('mode').value);
      button.title = `${item.supportsModes.length === 1 ? '상의용 사진. ' : ''}${item.notes || item.label}`;
    }
  }
  if (!state.busy && !state.job && state.config?.authenticated) {
    const missing = required().find(role => !state.files[role]);
    status(missing ? `${{ person: '사람', upper: '상의', lower: '하의' }[missing]} 사진을 선택해 주세요.` :
      !ids.length ? '모델을 선택해 주세요.' :
      ids.some(id => !state.config.models.find(model => model.id === id)?.ready) ? '' :
      !$('consent').checked ? '사진 전송에 동의해 주세요.' : '준비됐어요. 만들기를 눌러 주세요.');
  }
}

async function initialize() {
  state.config = await api('/api/config');
  $('unlock').hidden = state.config.authenticated;
  $('workspace').hidden = !state.config.authenticated;
  const count = state.config.models.filter(model => model.ready).length;
  $('connection').textContent = count ? '피팅 준비 완료' : '현재 생성을 사용할 수 없습니다';
  for (const model of state.config.models) {
    $(`select-${model.id}`).disabled = false;
  }
  controls();
}

function closeZoom() {
  $('zoom').close();
  $('zoom-image').removeAttribute('src');
}

function clearResults() {
  clearTimeout(state.expiry);
  closeZoom();
  for (const result of Object.values(state.results)) if (result.url) URL.revokeObjectURL(result.url);
  state.results = {};
  for (const id of models) {
    $(`${id}-verdict`).value = '';
    $(`${id}-notes`).value = '';
    $(`${id}-review`).closest('details').open = false;
  }
  render();
}

function render() {
  for (const role of roles) {
    const image = role === 'person' ? $('before') : $(`${role}-preview`);
    image.hidden = !state.urls[role];
    if (state.urls[role]) image.src = state.urls[role];
    else image.removeAttribute('src');
    image.closest('button').setAttribute('aria-label', `${{ person: '사람', upper: '상의', lower: '하의' }[role]} 사진 ${image.hidden ? '선택' : '확대'}`);
    $(`${role}-empty`).hidden = Boolean(state.urls[role]);
  }
  for (const id of models) {
    const result = state.results[id];
    const image = $(`${id}-result`);
    image.hidden = !result?.url;
    if (result?.url) image.src = result.url;
    else image.removeAttribute('src');
    const empty = $(`${id}-empty`);
    empty.hidden = Boolean(result?.url);
    empty.textContent = !result ? '피팅 결과가 여기에 표시됩니다' : result.status === 'running'
      ? '만드는 중…' : messages[result.error?.code] || result.error?.message || '결과를 불러오지 못했습니다';
    $(`${id}-summary`).textContent = result?.url
      ? `${(result.durationMs / 1000).toFixed(1)}초`
      : result?.status === 'failed' ? '생성 실패' : '';
    $(`${id}-download`).hidden = !result?.url;
    if (result?.url) $(`${id}-download`).href = result.url;
    else $(`${id}-download`).removeAttribute('href');
    $(`${id}-review`).disabled = !result?.url;
  }
  controls();
}

async function discard() {
  if (!state.job) return;
  try { await api(`/api/jobs/${state.job.id}`, { method: 'DELETE' }); } catch (cause) { if (cause.status !== 404) throw cause; }
  state.job = null;
}

const revisions = Object.fromEntries(roles.map(role => [role, 0]));
async function chooseFile(role, file, sampleId = null) {
    const current = ++revisions[role], epoch = state.epoch;
    state.loading++;
    controls();
    error('');
    let newUrl;
    try {
      await discard();
      if (current !== revisions[role] || epoch !== state.epoch) return;
      clearResults();
      if (state.urls[role]) URL.revokeObjectURL(state.urls[role]);
      delete state.files[role]; delete state.urls[role];
      delete state.sampleIds[role];
      render();
      if (file) {
        if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('PNG/JPEG 사진을 장당 10 MiB 이하로 선택하세요.');
        newUrl = URL.createObjectURL(file);
        const image = new Image();
        image.src = newUrl;
        await image.decode();
        if (image.naturalWidth > 4096 || image.naturalHeight > 4096 || image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('한 변 4096px 이하, 20메가픽셀 이하 사진을 사용하세요.');
        if (current !== revisions[role] || epoch !== state.epoch) return;
        state.files[role] = file;
        state.urls[role] = newUrl;
        if (sampleId) state.sampleIds[role] = sampleId;
        newUrl = null;
      }
      document.querySelectorAll(`#${role}-samples button`).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.id === sampleId)));
      status('모델을 선택하고 만들어 보세요.');
    } catch (cause) {
      if (current === revisions[role] && epoch === state.epoch) { $(role).value = ''; error(cause.message); }
    } finally {
      if (newUrl) URL.revokeObjectURL(newUrl);
      state.loading--;
      render();
    }
}
for (const role of roles) {
  $(role).addEventListener('change', () => chooseFile(role, $(role).files[0]));
}

async function loadSamples() {
  const response = await fetch('/samples/manifest.json', { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('샘플을 불러오지 못했습니다.');
  const manifest = await response.json();
  if (!Array.isArray(manifest.items)) throw new Error('샘플 목록을 확인해 주세요.');
  state.samples = manifest.items;
  for (const item of manifest.items) {
    if (!roles.includes(item.category) || !/^\/samples\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/.test(item.src)) throw new Error('샘플 목록을 확인해 주세요.');
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
        const result = await fetch(item.src, { signal: AbortSignal.timeout(30_000) });
        if (!result.ok) throw new Error('샘플 사진을 불러오지 못했습니다.');
        const blob = await result.blob();
        if (epoch !== state.epoch || revision !== revisions[item.category]) return;
        $(item.category).value = '';
        await chooseFile(item.category, new File([blob], item.src.split('/').pop(), { type: blob.type }), item.id);
      } catch (cause) { error(cause.message); } finally { button.disabled = false; state.loading--; controls(); }
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
  controls();
}

$('mode').addEventListener('change', async () => {
  error('');
  try { await discard(); clearResults(); } catch (cause) { error(cause.message); }
  controls();
});
for (const id of models) $(`select-${id}`).addEventListener('change', controls);
$('consent').addEventListener('change', controls);

async function applyJob(job, epoch) {
  state.job = job;
  for (const [id, result] of Object.entries(job.results)) {
    let url = state.results[id]?.url, dimensions = state.results[id]?.dimensions;
    if (result.status === 'succeeded' && !url) {
      const response = await fetch(result.imageUrl, { signal: AbortSignal.any([state.controller.signal, AbortSignal.timeout(30_000)]) });
      if (!response.ok) throw new Error('결과 사진이 만료되었거나 가져오지 못했습니다.');
      const blob = await response.blob();
      if (epoch !== state.epoch) return;
      url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      try { await image.decode(); } catch (cause) { URL.revokeObjectURL(url); throw cause; }
      if (epoch !== state.epoch) { URL.revokeObjectURL(url); return; }
      dimensions = `${image.naturalWidth} × ${image.naturalHeight}`;
    }
    state.results[id] = { ...result, url, dimensions };
  }
  render();
  if (job.status !== 'running') {
    clearTimeout(state.expiry);
    state.expiry = setTimeout(() => { state.job = null; clearResults(); status('결과 보관 시간이 끝났습니다.'); }, Math.max(0, job.expiresAt - Date.now()));
  }
}

$('try-on-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('generate').disabled || state.busy) return;
  const epoch = ++state.epoch, ids = selected(), mode = $('mode').value;
  state.controller = new AbortController();
  state.busy = true; error(''); controls();
  try {
    await discard();
    if (epoch !== state.epoch) return;
    clearResults();
    for (const id of ids) state.results[id] = { status: 'running' };
    render();
    status(`${ids.map(id => labels[id]).join(' · ')} 만드는 중…`);
    const form = new FormData();
    for (const role of ['person', ...modeFields[mode]]) form.set(role, state.files[role]);
    form.set('mode', mode); form.set('models', JSON.stringify(ids)); form.set('consent', 'true');
    let job = await api('/api/jobs', { method: 'POST', headers: { 'x-request-id': crypto.randomUUID() }, body: form, signal: state.controller.signal });
    const deadline = Date.now() + 210_000;
    while (epoch === state.epoch) {
      await applyJob(job, epoch);
      if (epoch !== state.epoch) return;
      if (job.status !== 'running') break;
      if (Date.now() > deadline) throw new Error('결과 확인 시간이 초과되었습니다. Azure 처리와 과금은 계속될 수 있습니다.');
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (epoch !== state.epoch) return;
      job = await api(`/api/jobs/${job.id}`, { signal: state.controller.signal });
    }
    if (epoch === state.epoch) status(job.status === 'succeeded' ? '완성했어요. 사진을 눌러 크게 확인하세요.' : '생성하지 못한 결과가 있습니다. 오류를 확인해 주세요.');
  } catch (cause) {
    if (epoch !== state.epoch) return;
    error(`${cause.message}${!cause.status || cause.status >= 500 && cause.code !== 'model-unavailable' ? ' 전송된 요청은 과금될 수 있습니다.' : ''} 자동 재시도하지 않았습니다.`);
    status('결과를 확인하지 못했습니다.');
    for (const result of Object.values(state.results)) if (result.status === 'running') {
      result.status = 'failed'; result.error = { message: '결과 미확인 · 서버 또는 Azure 처리는 계속될 수 있습니다.' };
    }
    render();
  } finally {
    if (epoch === state.epoch) { state.busy = false; controls(); }
  }
});

async function clearStudio(logout = false) {
  error('');
  try {
    if (logout) await api('/api/session', { method: 'DELETE' });
    else await discard();
    state.epoch++; state.controller?.abort(); state.busy = false; state.job = null;
    clearResults();
    for (const role of roles) {
      if (state.urls[role]) URL.revokeObjectURL(state.urls[role]);
      $(role).value = '';
    }
    state.files = {}; state.urls = {}; state.sampleIds = {}; $('consent').checked = false;
    document.querySelectorAll('.sample').forEach(button => button.setAttribute('aria-pressed', 'false'));
    models.forEach(id => { $(`select-${id}`).checked = false; });
    render(); await initialize();
    status('사진과 결과를 비웠습니다.');
  } catch (cause) { error(`비우기 실패: ${cause.message}`); }
}
$('clear').addEventListener('click', () => clearStudio());
$('logout').addEventListener('click', () => clearStudio(true));

$('unlock-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-error').hidden = true;
  const submit = event.currentTarget.querySelector('button');
  submit.disabled = true;
  try {
    const username = $('username').value, password = $('password').value;
    $('password').value = '';
    await api('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    await initialize();
    $('mode').focus();
  } catch (cause) { $('login-error').textContent = cause.message; $('login-error').hidden = false; }
  finally { submit.disabled = false; }
});
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
  const image = $(button.dataset.zoom);
  if (image.hidden || !image.src) {
    const role = { before: 'person', 'upper-preview': 'upper', 'lower-preview': 'lower' }[button.dataset.zoom];
    if (role && state.config?.authenticated && !state.busy) $(role).click();
    return;
  }
  $('zoom-image').src = image.src;
  $('zoom-image').alt = image.alt;
  $('zoom-title').textContent = image.alt;
  $('zoom').showModal();
}));
$('zoom-close').addEventListener('click', closeZoom);
$('zoom').addEventListener('close', () => $('zoom-image').removeAttribute('src'));
render();
initialize().catch(cause => { $('connection').textContent = '서버 연결 실패'; error(cause.message); controls(); });
loadSamples().catch(cause => error(cause.message));
