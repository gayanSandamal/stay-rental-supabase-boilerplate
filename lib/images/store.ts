import crypto from 'node:crypto';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import type { ProcessedImage } from './types';

/**
 * Derived (published) images live under their own prefix so originals stay
 * untouched and re-runs are idempotent:
 *   listings/…            originals from the web uploader   (lib/storage.ts)
 *   whatsapp-intake/…     originals from WhatsApp           (channels/whatsapp/media.ts)
 *   public/{listingId}/…  compressed + watermarked derivatives  ← this module
 *
 * The content hash in the filename makes the URL self-invalidating, so serving
 * it with a 1-year cache header is safe.
 */
const DERIVED_PREFIX = 'public';

export const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;

export function hashBytes(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Download an original we previously stored (or any public URL). */
export async function fetchOriginal(
  url: string,
  timeoutMs = 15_000
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error('[images] original fetch failed', res.status, url.slice(0, 120));
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_ORIGINAL_BYTES) {
      console.error('[images] original too large, skipping', buffer.length, url.slice(0, 120));
      return null;
    }
    return { buffer, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  } catch (err) {
    console.error('[images] original fetch error', err);
    return null;
  }
}

/** Upload a derivative and return its public URL. Idempotent (upsert). */
export async function storeDerived(
  listingId: number,
  contentHash: string,
  image: ProcessedImage
): Promise<string | null> {
  const filePath = `${DERIVED_PREFIX}/${listingId}/${contentHash.slice(0, 12)}-w.webp`;
  const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(filePath, image.buffer, {
    contentType: image.contentType,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) {
    console.error('[images] derived upload failed', error.message);
    return null;
  }
  const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Remove storage objects for a listing being purged. Best-effort: a failure
 * here must never block the DB delete.
 */
export async function removeListingObjects(listingId: number, originalUrls: string[]): Promise<void> {
  try {
    const { data: derived } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .list(`${DERIVED_PREFIX}/${listingId}`);
    const paths = (derived ?? []).map((f) => `${DERIVED_PREFIX}/${listingId}/${f.name}`);

    // Originals are addressed by their public URL; recover the storage path.
    const marker = `/${STORAGE_BUCKET}/`;
    for (const url of originalUrls) {
      const idx = url.indexOf(marker);
      if (idx === -1) continue; // not ours
      paths.push(decodeURIComponent(url.slice(idx + marker.length)));
    }

    if (paths.length) {
      const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(paths);
      if (error) console.error('[images] purge remove failed', error.message);
    }
  } catch (err) {
    console.error('[images] purge error', err);
  }
}
