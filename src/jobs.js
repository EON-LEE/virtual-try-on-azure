import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { editImage } from './provider.js';
import { modeContract } from './modes.js';
import { InferenceGate } from './gate.js';

export const RESULT_TTL_MS = 10 * 60 * 1000;

export class JobStore {
  constructor({ provider = editImage, now = Date.now, submissionsPerMinute = 2, gate = new InferenceGate({ now }) } = {}) {
    this.provider = provider;
    this.now = now;
    this.jobs = new Map();
    this.controllers = new Map();
    this.attempts = 0;
    this.started = [];
    this.active = 0;
    this.submissionsPerMinute = submissionsPerMinute;
    this.gate = gate;
  }

  prune() {
    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= this.now()) this.delete(id, job.owner);
    }
  }

  create(owner, requestId, fingerprint, models, config, person, garment, { mode = 'baseline', lowerGarment } = {}) {
    this.prune();
    const previous = [...this.jobs.values()].find(j => j.owner === owner && j.requestId === requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new AppError(409, 'duplicate-conflict', 'This request ID was already used with different inputs.');
      return previous;
    }
    if (this.jobs.size >= 8 || this.active >= 1) {
      throw new AppError(429, 'busy', 'A generation is already running, or the studio is at capacity.');
    }
    const contract = modeContract(mode);
    const { attemptLimit = 0, expiresAt = 0 } = config.limits || {};
    if (!attemptLimit || this.now() >= expiresAt || this.attempts + models.length > attemptLimit) {
      throw new AppError(403, 'demo-budget-closed', 'Demo inference window or model-attempt allowance is closed. Ask the operator; no automatic retry.');
    }
    this.started = this.started.filter(time => time > this.now() - 60_000);
    if (this.started.length >= this.submissionsPerMinute) throw new AppError(429, 'demo-rate-limit', 'At most two demo submissions per minute. No automatic retry.');
    this.gate.reserve(models.length, config.limits);
    this.started.push(this.now());
    this.attempts += models.length;
    this.active++;
    const job = {
      id: randomUUID(), owner, requestId, fingerprint, status: 'running',
      createdAt: this.now(), expiresAt: this.now() + RESULT_TTL_MS,
      promptVersion: contract.version, mode,
      results: Object.fromEntries(models.map(id => [id, { status: 'running', model: config.models[id].model }]))
    };
    this.jobs.set(job.id, job);
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    void this.execute(job, models, config, person, garment, controller.signal, { mode, lowerGarment });
    return job;
  }

  async execute(job, models, config, person, garment, signal, options) {
    await Promise.all(models.map(async id => {
      const start = this.now();
      try {
        const result = await this.provider(config.models[id], person, garment, { signal, ...options });
        job.results[id] = { status: 'succeeded', model: config.models[id].model, ...result, durationMs: this.now() - start };
      } catch (error) {
        job.results[id] = {
          status: 'failed', model: config.models[id].model, durationMs: this.now() - start,
          error: { code: error instanceof AppError ? error.code : 'generation-failed',
            message: error instanceof AppError ? error.message : 'Generation failed unexpectedly. No retry was made.' }
        };
      }
    }));
    this.active--;
    if (!this.jobs.has(job.id)) return;
    job.status = Object.values(job.results).every(r => r.status === 'succeeded') ? 'succeeded' : 'failed';
    job.expiresAt = this.now() + RESULT_TTL_MS;
    this.controllers.delete(job.id);
  }

  get(id, owner) {
    this.prune();
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner) throw new AppError(404, 'job-not-found', 'Result expired, was cleared, or does not belong to this session.');
    return job;
  }

  delete(id, owner) {
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner) return;
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.jobs.delete(id);
  }

  clearOwner(owner) {
    for (const job of this.jobs.values()) if (job.owner === owner) this.delete(job.id, owner);
  }

  close() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.jobs.clear();
  }
}

export function publicJob(job) {
  return {
    id: job.id, status: job.status, createdAt: job.createdAt, expiresAt: job.expiresAt,
    promptVersion: job.promptVersion, mode: job.mode,
    results: Object.fromEntries(Object.entries(job.results).map(([id, result]) => {
      const { image, ...metadata } = result;
      return [id, { ...metadata, ...(image ? { imageUrl: `/api/jobs/${job.id}/images/${id}` } : {}) }];
    }))
  };
}
