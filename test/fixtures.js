export function activateForTest(store, config) {
  store.gate.activate({ nonce: store.gate.state().nonce, allowance: config.limits.attemptLimit,
    expiresAt: new Date(config.limits.expiresAt).toISOString() }, config);
}
