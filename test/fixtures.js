export function activateForTest(store, config) {
  store.gate.activate({ nonce: store.gate.state().nonce, allowance: config.limits.attemptLimit,
    expiresAt: new Date(config.limits.expiresAt).toISOString() }, config);
}

export async function loginForTest(origin) {
  const response = await fetch(`${origin}/api/session`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-request': '1', origin },
    body: JSON.stringify({ username: 'test', password: 'test' }) });
  if (!response.ok) throw new Error('Fixture login failed.');
  return response.headers.get('set-cookie').split(';')[0];
}
