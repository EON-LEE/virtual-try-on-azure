import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';

export async function bodyBytes(req, limit) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > limit) throw new AppError(413, 'upload-too-large', 'Request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new AppError(413, 'upload-too-large', 'Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
}

export async function jsonBody(req, code, message) {
  try {
    const data = JSON.parse((await bodyBytes(req, 2048)).toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, code, message);
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, code, message);
  }
}

export function secretMatches(supplied, expected) {
  const digest = value => createHash('sha256').update(value).digest();
  return typeof supplied === 'string' && timingSafeEqual(digest(supplied), digest(expected));
}
