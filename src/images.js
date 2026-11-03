import sharp from 'sharp';
import { AppError } from './errors.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 3 * MAX_IMAGE_BYTES + 64 * 1024;
export const MAX_INPUT_EDGE = 2048;
const MAX_PIXELS = 20_000_000;

export async function sanitizeImage(file, role) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size ||
      file.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new AppError(400, 'invalid-image', `${role}: upload one PNG or JPEG, at most 10 MiB.`);
  }
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const metadata = await input.metadata();
    if (!['png', 'jpeg'].includes(metadata.format) || (metadata.pages || 1) !== 1 ||
        metadata.width > 4096 || metadata.height > 4096) {
      throw new AppError(400, 'invalid-image', `${role}: use a single-frame PNG/JPEG, at most 4096 pixels per side and 20 megapixels.`);
    }
    // Re-encoding strips EXIF/GPS metadata; rotate applies the original orientation.
    const bytes = await input.rotate()
      .resize({ width: MAX_INPUT_EDGE, height: MAX_INPUT_EDGE, fit: 'inside', withoutEnlargement: true })
      .png().toBuffer();
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new AppError(400, 'invalid-image', `${role}: normalized image exceeds 10 MiB.`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'invalid-image', `${role}: the image could not be decoded safely.`);
  }
}

export async function sanitizeOutput(base64) {
  if (typeof base64 !== 'string' || base64.length > 32 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new AppError(502, 'invalid-provider-image', 'Azure returned invalid image data.');
  }
  try {
    const bytes = Buffer.from(base64, 'base64');
    const input = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const metadata = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) {
      throw new Error('Invalid output format');
    }
    const output = await input.png().toBuffer();
    if (output.length > 24 * 1024 * 1024) throw new Error('Output too large');
    return output;
  } catch {
    throw new AppError(502, 'invalid-provider-image', 'Azure returned an undecodable image.');
  }
}

export async function labelDownload(image) {
  try {
    const { width, height } = await sharp(image, { limitInputPixels: MAX_PIXELS }).metadata();
    const footerHeight = Math.max(1, Math.ceil(width * 48 / 640));
    const footer = Buffer.from(`<svg width="${width}" height="${footerHeight}" viewBox="0 0 640 48" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="48" fill="#20222a"/><text x="320" y="31" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans, sans-serif" font-size="22">AI GENERATED | REVIEW REQUIRED</text></svg>`);
    const output = await sharp(image).extend({ bottom: footerHeight, background: '#20222a' })
      .composite([{ input: footer, left: 0, top: height }]).png().toBuffer();
    if (output.length > 24 * 1024 * 1024) throw new Error('Labeled output too large');
    return output;
  } catch {
    throw new AppError(500, 'download-preparation-failed', 'AI 표시가 있는 다운로드를 준비하지 못했습니다.');
  }
}
