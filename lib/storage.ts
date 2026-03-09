import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
}

async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Stores an image file to local disk (public/uploads/).
 * In production, swap this implementation for Supabase Storage, S3, or Cloudinary.
 */
export async function storeImage(file: File): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
  }

  await ensureUploadDir();

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const hash = crypto.randomBytes(16).toString('hex');
  const filename = `${Date.now()}-${hash}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return {
    url: `/uploads/${filename}`,
    filename,
    size: buffer.length,
  };
}

/**
 * Stores a base64-encoded image. Used during migration from inline base64 to file storage.
 */
export async function storeBase64Image(dataUrl: string): Promise<UploadResult> {
  const match = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid base64 image data URL');
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  await ensureUploadDir();

  const hash = crypto.randomBytes(16).toString('hex');
  const filename = `${Date.now()}-${hash}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);

  await writeFile(filePath, buffer);

  return {
    url: `/uploads/${filename}`,
    filename,
    size: buffer.length,
  };
}
