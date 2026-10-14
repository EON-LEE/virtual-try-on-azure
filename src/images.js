import sharp from 'sharp';
import { AppError } from './errors.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 2 * MAX_IMAGE_BYTES + 64 * 1024;
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
    const bytes = await input.rotate().png().toBuffer();
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
    return await input.png().toBuffer();
  } catch {
    throw new AppError(502, 'invalid-provider-image', 'Azure returned an undecodable image.');
  }
}
