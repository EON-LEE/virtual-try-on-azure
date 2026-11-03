import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from './errors.js';
import { secretMatches } from './http.js';

export const SESSION_TTL = 30 * 60 * 1000;

export function loginSource(req, trustContainerAppsProxy = false) {
  // ACA appends the trusted sender as the rightmost entry. Never trust a client prefix.
  const forwarded = req.headers['x-forwarded-for'];
  const source = trustContainerAppsProxy
    ? (typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : '')
    : req.socket.remoteAddress;
  if (!isIP(source || '')) throw new AppError(400, 'invalid-login-source', 'Login source could not be verified.');
  if (isIP(source) === 4) return source;
  const normalized = new URL(`http://[${source}]/`).hostname.slice(1, -1);
  return normalized;
}

export class SessionStore {
  constructor(jobs, { now = Date.now, loginAttemptsPerMinute = 20, credentials = null } = {}) {
    this.jobs = jobs;
    this.now = now;
    this.loginAttemptsPerMinute = loginAttemptsPerMinute;
    this.sessions = new Map();
    this.credentials = credentials;
    this.loginWindows = new Map();
  }

  get(id) { return this.sessions.get(id); }

  prune() {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= this.now()) this.delete(id);
    }
    for (const [source, window] of this.loginWindows) {
      if (window.expiresAt <= this.now()) this.loginWindows.delete(source);
    }
  }

  delete(id) {
    if (this.sessions.has(id)) {
      this.jobs.clearOwner(id);
      this.sessions.delete(id);
    }
  }

  reserveLogin(source) {
    this.prune();
    if (!this.credentials) {
      throw new AppError(503, 'login-not-configured', '시연 로그인 정보가 설정되지 않았습니다. 운영자에게 문의하세요.');
    }
    if (!this.loginWindows.has(source)) {
      if (this.loginWindows.size >= 4096) {
        throw new AppError(503, 'login-capacity', 'Login capacity reached. Wait one minute.');
      }
      this.loginWindows.set(source, { attempts: 0, expiresAt: this.now() + 60_000 });
    }
    if (++this.loginWindows.get(source).attempts > this.loginAttemptsPerMinute) {
      throw new AppError(429, 'login-rate-limit', 'Too many access attempts. Wait one minute.');
    }
  }

  login(data, previousId) {
    if (!this.credentials) {
      throw new AppError(503, 'login-not-configured', '시연 로그인 정보가 설정되지 않았습니다. 운영자에게 문의하세요.');
    }
    const usernameMatches = secretMatches(data?.username, this.credentials.username);
    const passwordMatches = secretMatches(data?.password, this.credentials.password);
    if (!usernameMatches || !passwordMatches || Object.keys(data).some(key => !['username', 'password'].includes(key))) {
      throw new AppError(401, 'unauthorized', '아이디 또는 비밀번호를 확인해 주세요.');
    }
    this.delete(previousId);
    if (this.sessions.size >= 256) throw new AppError(503, 'session-capacity', 'Studio session capacity reached.');
    const id = randomBytes(32).toString('hex');
    this.sessions.set(id, { expiresAt: this.now() + SESSION_TTL });
    return id;
  }

  clear() { this.sessions.clear(); this.loginWindows.clear(); }
}

export function sessionCookie(id, secure) {
  return `studio=${id}; Path=/; HttpOnly; SameSite=Strict; ${secure ? 'Secure; ' : ''}Max-Age=${id ? SESSION_TTL / 1000 : 0}`;
}
