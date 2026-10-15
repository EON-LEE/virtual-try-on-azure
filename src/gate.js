import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

export class InferenceGate {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.nonce = randomUUID();
    this.activated = false;
    this.allowance = 0;
    this.expiresAt = 0;
    this.used = 0;
  }

  activate({ nonce, allowance, expiresAt }, config, owner = null) {
    if (this.activated) throw new AppError(409, 'activation-consumed', 'This boot was already activated. Replenishment is not allowed.');
    const end = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
    if (nonce !== this.nonce || !Number.isInteger(allowance) || allowance < 1 ||
        allowance > config.limits.attemptLimit || !Number.isFinite(end) ||
        end <= this.now() || end > config.limits.expiresAt ||
        !Object.values(config.models).some(model => model.ready)) {
      throw new AppError(403, 'activation-denied', 'Activation must match this boot and the configured inference approval limits.');
    }
    this.activated = true;
    this.allowance = allowance;
    this.expiresAt = end;
    this.owner = owner;
  }

  reserve(count, limits, owner) {
    if (!this.activated || this.now() >= this.expiresAt || this.now() >= limits.expiresAt ||
        (this.owner && this.owner !== owner) ||
        !Number.isInteger(count) || count < 1 || this.used + count > this.allowance ||
        this.used + count > limits.attemptLimit) {
      throw new AppError(403, 'demo-budget-closed', 'Operator activation, inference window or model-attempt allowance is closed. No automatic retry.');
    }
    this.used += count;
  }

  state() {
    return { nonce: this.nonce, activated: this.activated, remaining: Math.max(0, this.allowance - this.used),
      expiresAt: this.expiresAt, open: this.activated && this.now() < this.expiresAt && this.used < this.allowance };
  }

  isOpenFor(owner) {
    return this.state().open && (!this.owner || this.owner === owner);
  }
}
