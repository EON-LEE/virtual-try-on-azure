export const stages = { submitted: '전송', accepted: '접수', 'input-processing': '입력 처리', identity: '모델 인증',
  'model-request': '모델 요청', 'result-preparation': '결과 준비', completed: '완료', polling: '상태 확인' };

export function createExecutionLog(container) {
  const seenEvents = new Set();
  function record({ timestamp = Date.now(), model = '', stage, status, code = '', jobId = '', requestId = '', providerStatus, retryAfterSeconds }) {
    const entry = document.createElement('li');
    entry.textContent = `${new Date(timestamp).toLocaleTimeString('ko-KR')} · ${model || '요청'} · ${stages[stage] || stage} · ${{ running: '진행', succeeded: '성공', failed: '실패' }[status] || status}${code ? ` · ${code}` : ''}${providerStatus ? ` · HTTP ${providerStatus}` : ''}${retryAfterSeconds !== undefined ? ` · ${retryAfterSeconds}초 후 재시도 가능` : ''}${jobId || requestId ? ` · 참조 ${jobId || requestId}` : ''}`;
    container.append(entry);
    while (container.children.length > 50) container.firstElementChild.remove();
  }
  return {
    record,
    reset: () => seenEvents.clear(),
    receive(job) {
      for (const event of job.events || []) {
        const key = JSON.stringify(event);
        if (!seenEvents.has(key)) { seenEvents.add(key); record(event); }
      }
    }
  };
}
