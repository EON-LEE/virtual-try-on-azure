export function reviewReport(job, decisions, clientVersion, now = Date.now()) {
  if (!job || job.status === 'running') throw new Error('완료된 실행을 선택해 주세요.');
  const results = Object.entries(job.results).map(([id, result]) => {
    const { verdict = '', notes = '' } = decisions[id] || {};
    if (!['', '허용 가능', '수정 필요', '판단 보류'].includes(verdict) ||
        typeof notes !== 'string' || notes.length > 2000) throw new Error('판정과 메모를 확인해 주세요.');
    return {
      modelId: id, model: result.model, status: result.status,
      durationMs: result.durationMs ?? null, errorCode: result.error?.code || null,
      verdict: result.status === 'succeeded' ? verdict || '평가 전' : '생성 실패',
      notes: result.status === 'succeeded' ? notes : ''
    };
  });
  return {
    schemaVersion: 1, exportedAt: new Date(now).toISOString(), clientVersion,
    jobId: job.id, mode: job.mode, promptVersion: job.promptVersion,
    createdAt: new Date(job.createdAt).toISOString(),
    disclosure: 'AI-generated preview; human review is not a fit, size or fidelity guarantee.',
    summary: { selected: results.length, succeeded: results.filter(r => r.status === 'succeeded').length,
      accepted: results.filter(r => r.verdict === '허용 가능').length },
    results
  };
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
