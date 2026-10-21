import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';
import { secretMatches } from './http.js';

export const SESSION_TTL = 30 * 60 * 1000;

export class SessionStore {
  constructor(jobs, { now = Date.now, loginAttemptsPerMinute = 20 } = {}) {
    this.jobs = jobs;
    this.now = now;
    this.loginAttemptsPerMinute = loginAttemptsPerMinute;
    this.sessions = new Map();
    this.loginAttempts = 0;
    this.loginWindow = now();
  }

  get(id) { return this.sessions.get(id); }

  prune() {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= this.now()) this.delete(id);
    }
  }

  delete(id) {
    if (this.sessions.has(id)) {
      this.jobs.clearOwner(id);
      this.sessions.delete(id);
    }
  }

  reserveLogin() {
    if (this.now() - this.loginWindow > 60_000) {
      this.loginAttempts = 0;
      this.loginWindow = this.now();
    }
    if (++this.loginAttempts > this.loginAttemptsPerMinute) {
      throw new AppError(429, 'login-rate-limit', 'Too many access attempts. Wait one minute.');
    }
  }

  login(data, previousId) {
    const usernameMatches = secretMatches(data.username, 'test');
    const passwordMatches = secretMatches(data.password, 'test');
    if (!usernameMatches || !passwordMatches || Object.keys(data).some(key => !['username', 'password'].includes(key))) {
      throw new AppError(401, 'unauthorized', '아이디 또는 비밀번호를 확인해 주세요.');
    }
    this.delete(previousId);
    if (this.sessions.size >= 256) throw new AppError(503, 'session-capacity', 'Studio session capacity reached.');
    const id = randomBytes(32).toString('hex');
    this.sessions.set(id, { expiresAt: this.now() + SESSION_TTL });
    return id;
  }

  clear() { this.sessions.clear(); }
}

export function sessionCookie(id, secure) {
  return `studio=${id}; Path=/; HttpOnly; SameSite=Strict; ${secure ? 'Secure; ' : ''}Max-Age=${id ? SESSION_TTL / 1000 : 0}`;
}
