const fields = ['timestamp', 'jobId', 'requestId', 'model', 'stage', 'status', 'code',
  'httpStatus', 'durationMs', 'providerStatus', 'providerRequestId', 'retryAfterSeconds'];

export function logEvent(logger, level, event, details) {
  const safe = Object.fromEntries(fields.filter(key => details[key] !== undefined).map(key => [key, details[key]]));
  logger[level]?.(JSON.stringify({ event, ...safe }));
}
