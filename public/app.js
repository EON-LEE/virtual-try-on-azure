const $ = id => document.getElementById(id);
const roles = ['person', 'upper', 'lower'];
const models = ['sunburst', 'mai'];
const labels = { sunburst: 'Sunburst', mai: 'MAI Image 2.6' };
const modeFields = { upper: ['upper'], lower: ['lower'], full: ['upper', 'lower'] };
const state = { config: null, files: {}, urls: {}, results: {}, job: null, busy: false, loading: 0, epoch: 0, controller: null, expiry: null };
const selected = () => models.filter(id => $(`select-${id}`).checked);
const required = () => ['person', ...modeFields[$('mode').value]];
const error = message => { $('error').textContent = message; $('error').hidden = !message; };
const status = message => { $('status').textContent = message; };

async function api(path, options = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  const response = await fetch(path, { ...options, headers: { 'x-studio-request': '1', ...options.headers }, signal });
  const data = await response.json();
  if (!response.ok) {
    const cause = new Error(data.error?.message || `요청 실패 (${response.status})`);
    cause.status = response.status;
    throw cause;
  }
  return data;
}

function controls() {
  $('input-fields').disabled = state.busy || !state.config?.authenticated;
  $('generate').disabled = state.busy || state.loading > 0 || !state.config?.authenticated ||
    required().some(role => !state.files[role]) || !selected().length || !$('consent').checked;
  $('generate').textContent = state.busy ? '생성 중… 자동 재시도 없음' : `선택한 모델로 생성 · ${selected().length}회 호출`;
  $('clear').disabled = !state.config?.authenticated;
  const fields = modeFields[$('mode').value];
  for (const role of ['upper', 'lower']) {
    $(`${role}-upload`).hidden = !fields.includes(role);
    $(role).required = fields.includes(role);
    $(`${role}-reference`).hidden = !fields.includes(role);
  }
  $('mode-guidance').textContent = $('mode').value === 'upper'
    ? '상의만 교체합니다. 하의·신발·액세서리는 유지하도록 지시합니다.'
    : '허리·다리·발과 가려진 부분을 확인할 수 있는 전신 사진을 사용하세요. 풀세트는 상의+하의이며 원피스·신발·액세서리는 포함하지 않습니다.';
}

async function initialize() {
  state.config = await api('/api/config');
  $('unlock').hidden = state.config.authenticated;
  const count = state.config.models.filter(model => model.ready).length;
  $('connection').textContent = count ? `${count}개 모델 설정됨 · 품질 보장 아님` : '생성 비활성 · 운영자 승인 필요';
  for (const model of state.config.models) {
    $(`select-${model.id}`).disabled = !model.ready;
    if (!model.ready) $(`select-${model.id}`).checked = false;
    $(`${model.id}-state`).textContent = model.ready ? `${model.model} · 설정됨` : '호출 비활성 또는 설정 미완료';
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
  }
  $('technical').textContent = '새 결과에는 자동 평가를 붙이지 않습니다.';
  render();
}

function render() {
  for (const role of roles) {
    const image = role === 'person' ? $('before') : $(`${role}-preview`);
    image.hidden = !state.urls[role];
    if (state.urls[role]) image.src = state.urls[role];
    else image.removeAttribute('src');
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
    empty.textContent = !result ? '미선택 또는 아직 생성하지 않음' : result.status === 'running'
      ? '생성 중…' : result.error?.message || '결과 확인 실패';
    $(`${id}-summary`).textContent = result?.url
      ? `${(result.durationMs / 1000).toFixed(1)}초 · ${result.dimensions || '크기 확인 중'} · 수동 검토 필요`
      : result?.status === 'failed' ? '실패 · 자동 재시도하지 않음' : '평가 전';
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

for (const role of roles) {
  let revision = 0;
  $(role).addEventListener('change', async () => {
    const current = ++revision, epoch = state.epoch;
    state.loading++;
    controls();
    error('');
    const file = $(role).files[0];
    let newUrl;
    try {
      await discard();
      if (current !== revision || epoch !== state.epoch) return;
      clearResults();
      if (state.urls[role]) URL.revokeObjectURL(state.urls[role]);
      delete state.files[role]; delete state.urls[role];
      render();
      if (file) {
        if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('PNG/JPEG 사진을 장당 10 MiB 이하로 선택하세요.');
        newUrl = URL.createObjectURL(file);
        const image = new Image();
        image.src = newUrl;
        await image.decode();
        if (image.naturalWidth > 4096 || image.naturalHeight > 4096 || image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('한 변 4096px 이하, 20메가픽셀 이하 사진을 사용하세요.');
        if (current !== revision || epoch !== state.epoch) return;
        state.files[role] = file;
        state.urls[role] = newUrl;
        newUrl = null;
      }
      status('참조 사진과 호출할 모델을 확인하세요.');
    } catch (cause) {
      if (current === revision && epoch === state.epoch) { $(role).value = ''; error(cause.message); }
    } finally {
      if (newUrl) URL.revokeObjectURL(newUrl);
      state.loading--;
      render();
    }
  });
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
  $('technical').textContent = `지시 버전: ${job.promptVersion}. ` + Object.entries(job.results).map(([id, result]) =>
    `${labels[id]}: ${result.model}, ${result.status}${result.requestId ? `, 요청 ID ${result.requestId}` : ''}`).join(' / ');
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
    status(`${ids.map(id => labels[id]).join(' / ')} 호출 중 · ${ids.length}회 호출 · 자동 재시도 없음`);
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
    if (epoch === state.epoch) status(job.status === 'succeeded' ? '생성 완료 · 색상과 비대상 영역까지 원본과 비교해 수동 평가하세요.' : '일부 또는 모든 모델 실패 · 각 셀의 오류를 확인하세요.');
  } catch (cause) {
    if (epoch !== state.epoch) return;
    error(`${cause.message} 전송된 요청은 과금될 수 있습니다. 자동 재호출하지 않았습니다.`);
    status('결과 확인을 완료하지 못했습니다.');
    for (const result of Object.values(state.results)) if (result.status === 'running') {
      result.status = 'failed'; result.error = { message: '결과 미확인 · 서버 또는 Azure 처리는 계속될 수 있습니다.' };
    }
    render();
  } finally {
    if (epoch === state.epoch) { state.busy = false; controls(); }
  }
});

$('clear').addEventListener('click', async () => {
  error('');
  try {
    await api('/api/session', { method: 'DELETE' });
    state.epoch++; state.controller?.abort(); state.busy = false; state.job = null;
    clearResults();
    for (const role of roles) {
      if (state.urls[role]) URL.revokeObjectURL(state.urls[role]);
      $(role).value = '';
    }
    state.files = {}; state.urls = {}; $('consent').checked = false;
    render(); await initialize();
    status('사진과 결과를 비웠습니다. 이미 수락된 Azure 처리·과금 취소는 보장하지 않습니다.');
  } catch (cause) { error(`비우기 실패: ${cause.message}`); }
});

$('unlock-form').addEventListener('submit', async event => {
  event.preventDefault(); error('');
  try {
    const token = $('access-token').value; $('access-token').value = '';
    await api('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    await initialize();
  } catch (cause) { error(cause.message); }
});
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
  const image = $(button.dataset.zoom);
  if (image.hidden || !image.src) return;
  $('zoom-image').src = image.src;
  $('zoom-image').alt = image.alt;
  $('zoom-title').textContent = image.alt;
  $('zoom').showModal();
}));
$('zoom-close').addEventListener('click', closeZoom);
$('zoom').addEventListener('close', () => $('zoom-image').removeAttribute('src'));
render();
initialize().catch(cause => { $('connection').textContent = '서버 연결 실패'; error(cause.message); controls(); });
