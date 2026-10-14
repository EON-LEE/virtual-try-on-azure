const $ = id => document.getElementById(id);
const state = { config: null, files: {}, previews: {}, results: {}, activeModel: null, job: null, busy: false, loading: 0, comparing: false, expiryTimer: null, epoch: 0, controller: null };
const labels = { sunburst: 'Sunburst', mai: 'MAI' };
const selectedModels = () => [...document.querySelectorAll('input[name=model]:checked')].map(input => input.value);
const error = message => { $('error').textContent = message; $('error').hidden = !message; };
const status = message => { $('status').textContent = message; };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'x-studio-request': '1', ...options.headers }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
  const data = await response.json();
  if (!response.ok) {
    const cause = new Error(data.error?.message || `요청 실패 (${response.status})`);
    cause.status = response.status;
    throw cause;
  }
  return data;
}

function updateControls() {
  const authenticated = state.config?.authenticated;
  $('input-fields').disabled = state.busy || !authenticated;
  $('generate').disabled = state.busy || Boolean(state.loading) || !authenticated || !state.files.person || !state.files.garment || !selectedModels().length || !$('consent').checked;
  $('generate').textContent = state.busy ? '선택한 모델이 생성 중…' : '선택한 모델로 입어보기';
  $('clear').disabled = !authenticated;
  $('compare').disabled = Object.keys(state.results).length < 2;
}

async function initialize() {
  state.config = await api('/api/config');
  $('unlock').hidden = state.config.authenticated;
  const ready = state.config.models.filter(model => model.ready).length;
  $('connection').textContent = ready ? `${ready}개 모델 설정됨 · 실제 검증 전` : 'Azure 미연결 · 생성 비활성';
  for (const model of state.config.models) {
    const input = document.querySelector(`input[name=model][value=${model.id}]`);
    input.disabled = !model.ready;
    if (!model.ready) input.checked = false;
    $(`${model.id}-state`).textContent = model.ready ? `${model.model} · 호출 가능 설정` :
      model.reason === 'inference-disabled' ? '유료 호출 비활성 · 승인 필요' : `${model.model} · 연결 설정 필요`;
  }
  updateControls();
}

function removeResults() {
  clearTimeout(state.expiryTimer);
  state.expiryTimer = null;
  for (const result of Object.values(state.results)) if (result.url) URL.revokeObjectURL(result.url);
  state.results = {};
  state.activeModel = null;
  state.comparing = false;
  $('result-tabs').replaceChildren();
  $('download').hidden = true;
  $('technical').textContent = '아직 생성한 결과가 없습니다.';
  render();
}

function renderImage(id, emptyId, result) {
  const image = $(id), empty = $(emptyId);
  image.hidden = !result?.url;
  if (result?.url) image.src = result.url;
  else image.removeAttribute('src');
  empty.hidden = Boolean(result?.url);
  empty.classList.toggle('failure', result?.status === 'failed');
  if (result) {
    const heading = document.createElement('h2'), text = document.createElement('p');
    heading.textContent = result.status === 'running' ? '생성 중입니다' : result.status === 'failed' ? '생성하지 못했습니다' : '결과가 만료되었습니다';
    text.textContent = result.error?.message || '얼굴과 포즈 보존은 결과를 직접 확인해야 합니다.';
    empty.replaceChildren(heading, text);
  } else {
    const heading = document.createElement('h2'), text = document.createElement('p');
    heading.textContent = '어떤 옷을 입어볼까요?';
    text.textContent = '실제 Azure 응답을 받은 결과만 표시합니다.';
    empty.replaceChildren(heading, text);
  }
}

function render() {
  const active = state.results[state.activeModel];
  renderImage('after', 'after-empty', active);
  $('after-label').textContent = `After · ${state.activeModel ? labels[state.activeModel] : '생성 결과'}`;
  const otherId = Object.keys(state.results).find(id => id !== state.activeModel);
  const showExtra = state.comparing && Boolean(otherId);
  $('extra-stage').hidden = !showExtra;
  $('preview-grid').classList.toggle('comparing', showExtra);
  $('compare').setAttribute('aria-pressed', String(showExtra));
  if (showExtra) {
    $('extra-label').textContent = `After · ${labels[otherId]}`;
    renderImage('extra', 'extra-empty', state.results[otherId]);
  }
  for (const button of $('result-tabs').children) button.setAttribute('aria-pressed', String(button.dataset.model === state.activeModel));
  $('download').hidden = !active?.url;
  if (active?.url) {
    $('download').href = active.url;
    $('download').download = `try-on-${state.activeModel}.png`;
  } else $('download').removeAttribute('href');
  updateControls();
}

async function discardJob() {
  if (!state.job) return;
  try { await api(`/api/jobs/${state.job.id}`, { method: 'DELETE' }); } catch (cause) {
    if (cause.status !== 404) throw cause;
  }
  state.job = null;
}

for (const role of ['person', 'garment']) {
  let revision = 0;
  $(role).addEventListener('change', async () => {
    const currentRevision = ++revision;
    const epoch = state.epoch;
    state.loading++;
    updateControls();
    error('');
    const file = $(role).files[0];
    try {
      await discardJob();
      if (epoch !== state.epoch || currentRevision !== revision) return;
      removeResults();
      if (state.previews[role]) URL.revokeObjectURL(state.previews[role]);
      delete state.files[role];
      delete state.previews[role];
      $(`${role}-thumb`).hidden = true;
      $(`${role}-thumb`).removeAttribute('src');
      if (role === 'person') { $('before').hidden = true; $('before').removeAttribute('src'); $('before-empty').hidden = false; }
      if (file) {
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size) throw new Error('PNG/JPEG 사진을 장당 10 MiB 이하로 선택하세요.');
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (image.naturalWidth > 4096 || image.naturalHeight > 4096 || image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('사진은 한 변 4096px 이하, 20메가픽셀 이하로 선택하세요.');
        } catch (cause) {
          URL.revokeObjectURL(url);
          throw cause;
        }
        if (currentRevision !== revision || epoch !== state.epoch) { URL.revokeObjectURL(url); return; }
        state.files[role] = file;
        state.previews[role] = url;
        $(`${role}-thumb`).src = url;
        $(`${role}-thumb`).hidden = false;
        if (role === 'person') { $('before').src = url; $('before').hidden = false; $('before-empty').hidden = true; }
      }
      status('사진과 호출할 모델을 확인하세요.');
    } catch (cause) {
      if (epoch !== state.epoch || currentRevision !== revision) return;
      $(role).value = '';
      error(cause.message);
    } finally {
      state.loading--;
      updateControls();
    }
  });
}

document.querySelectorAll('input[name=model], #consent').forEach(input => input.addEventListener('change', updateControls));
$('compare').addEventListener('click', () => { state.comparing = !state.comparing; render(); });

async function applyJob(job, epoch) {
  state.job = job;
  for (const [id, result] of Object.entries(job.results)) {
    const previous = state.results[id];
    let url = previous?.url;
    if (result.status === 'succeeded' && !url) {
      const response = await fetch(result.imageUrl, { signal: AbortSignal.any([state.controller.signal, AbortSignal.timeout(30_000)]) });
      if (!response.ok) throw new Error('결과 사진을 가져오지 못했습니다. 서버 결과가 만료되었을 수 있습니다.');
      const blob = await response.blob();
      if (epoch !== state.epoch) return;
      url = URL.createObjectURL(blob);
    }
    state.results[id] = { ...result, url };
  }
  $('technical').textContent = `지시 버전: ${job.promptVersion}. ` + Object.entries(job.results).map(([id, result]) =>
    `${labels[id]}: ${result.model}, ${result.status}${result.durationMs != null ? `, ${(result.durationMs / 1000).toFixed(1)}초` : ''}${result.requestId ? `, Azure 요청 ID ${result.requestId}` : ''}`).join(' / ');
  render();
  if (job.status !== 'running') {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = setTimeout(() => {
      state.job = null;
      removeResults();
      status('결과 보관 시간이 끝났습니다. 사진을 확인한 후 새로 생성할 수 있습니다.');
    }, Math.max(0, job.expiresAt - Date.now()));
  }
}

$('try-on-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy || $('generate').disabled) return;
  const models = selectedModels();
  const epoch = ++state.epoch;
  state.controller = new AbortController();
  error('');
  state.busy = true;
  updateControls();
  try {
    await discardJob();
    if (epoch !== state.epoch) return;
    removeResults();
    state.activeModel = models[0];
    for (const id of models) {
      state.results[id] = { status: 'running' };
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.model = id;
      button.textContent = labels[id];
      button.addEventListener('click', () => { state.activeModel = id; render(); });
      $('result-tabs').append(button);
    }
    render();
    status(`${models.map(id => labels[id]).join(' / ')} 호출 중입니다. 자동 재시도하지 않습니다.`);
    const form = new FormData();
    form.set('person', state.files.person);
    form.set('garment', state.files.garment);
    form.set('models', JSON.stringify(models));
    form.set('consent', 'true');
    let job = await api('/api/jobs', { method: 'POST', headers: { 'x-request-id': crypto.randomUUID() }, body: form, signal: state.controller.signal });
    const deadline = Date.now() + 210_000;
    while (true) {
      if (epoch !== state.epoch) return;
      await applyJob(job, epoch);
      if (epoch !== state.epoch) return;
      if (job.status !== 'running') break;
      if (Date.now() > deadline) throw new Error('결과 확인 시간이 초과되었습니다. Azure 처리나 과금이 계속될 수 있습니다. 자동 재호출하지 않았습니다.');
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (epoch !== state.epoch) return;
      job = await api(`/api/jobs/${job.id}`, { signal: state.controller.signal });
    }
    status(job.status === 'succeeded' ? '생성 완료 · 얼굴, 포즈, 의류 디테일을 원본과 비교하세요.' : '일부 또는 모든 모델이 실패했습니다. 각 결과의 오류를 확인하세요.');
  } catch (cause) {
    if (epoch !== state.epoch) return;
    error(`${cause.message} 요청이 전송된 경우 과금이 발생할 수 있습니다. 자동 재호출하지 않았습니다.`);
    status('결과 확인을 완료하지 못했습니다.');
    for (const result of Object.values(state.results)) {
      if (result.status === 'running') { result.status = 'failed'; result.error = { message: '결과 확인 중 연결이 끊겼습니다. 서버 또는 Azure 처리는 계속될 수 있습니다.' }; }
    }
    render();
  } finally {
    if (epoch === state.epoch) {
      state.busy = false;
      updateControls();
    }
  }
});

$('clear').addEventListener('click', async () => {
  error('');
  try {
    await api('/api/session', { method: 'DELETE' });
    state.epoch++;
    state.controller?.abort();
    state.job = null;
    state.busy = false;
    removeResults();
    for (const role of ['person', 'garment']) {
      if (state.previews[role]) URL.revokeObjectURL(state.previews[role]);
      $(role).value = '';
      $(`${role}-thumb`).removeAttribute('src');
      $(`${role}-thumb`).hidden = true;
    }
    state.files = {};
    state.previews = {};
    $('before').removeAttribute('src');
    $('before').hidden = true;
    $('before-empty').hidden = false;
    $('consent').checked = false;
    await initialize();
    status('사진과 서버 결과를 비웠습니다. 진행 중 Azure 처리와 과금 취소는 보장하지 않습니다.');
  } catch (cause) { error(`비우기를 완료하지 못했습니다: ${cause.message}`); }
});

$('unlock-form').addEventListener('submit', async event => {
  event.preventDefault();
  error('');
  try {
    const token = $('access-token').value;
    $('access-token').value = '';
    await api('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    await initialize();
  } catch (cause) { error(cause.message); }
});

initialize().catch(cause => { $('connection').textContent = '서버 연결 실패'; error(cause.message); updateControls(); });
