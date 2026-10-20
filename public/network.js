export const messages = {
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
  'generation-failed': '사진을 생성하지 못했습니다.',
  'generation-timeout': '처리 시간이 초과됐습니다. 완료 여부와 과금은 확인되지 않았습니다.',
  'azure-timeout': '처리 시간이 초과됐습니다. 완료 여부와 과금은 확인되지 않았습니다.',
  'job-not-found': '실행 기록이 만료됐거나 서버가 다시 시작됐습니다. 완료 여부는 확인되지 않았습니다.'
};

export function errorMessage(cause) {
  return messages[cause.code] || (cause.name === 'TimeoutError' ? '서버 응답 시간이 초과됐습니다.' :
    cause instanceof TypeError ? '서버에 연결하지 못했습니다.' : cause.message);
}

export function createApi(onUnauthorized, fetchImpl = fetch) {
  async function response(path, options, timeoutMs) {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const result = await fetchImpl(path, {
      ...options, headers: { 'x-studio-request': '1', ...options.headers }, signal
    });
    if (!result.ok) {
      let data;
      try { data = await result.json(); } catch {
        data = { error: { code: 'invalid-server-response' } };
      }
      if (!data || typeof data !== 'object' || !data.error || typeof data.error !== 'object') {
        data = { error: { code: 'invalid-server-response' } };
      }
      const cause = new Error(messages[data.error?.code] || data.error?.message || `요청 실패 (${result.status})`);
      cause.status = result.status;
      cause.code = data.error?.code;
      if (result.status === 401 && !(path === '/api/session' && options.method === 'POST')) onUnauthorized();
      throw cause;
    }
    return result;
  }
  return {
    json: async (path, options = {}, timeoutMs = 30_000) => (await response(path, options, timeoutMs)).json(),
    blob: async (path, options = {}, timeoutMs = 30_000) => (await response(path, options, timeoutMs)).blob()
  };
}
