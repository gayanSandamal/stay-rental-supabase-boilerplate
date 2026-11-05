/**
 * What may be stored in `listings.photos`: a hosted http(s) URL, never the
 * image itself.
 *
 * WHY THIS EXISTS (2026-11-05). The web uploader used to fall back to a base64
 * `data:` URL whenever `/api/upload` failed, and the listing routes stored
 * whatever strings they were handed. Two listings ended up carrying the photos
 * inline — 48 (all six, ~1.2 MB in `photos` and twice that again in
 * `photos_manifest`, whose `o` and `p` both hold the same string) and 42 (three
 * of six). Every surface that lists listings ships the whole row to a client
 * component, so `/listings` became an 8.4 MB HTML page, `/listings/48` 5.5 MB,
 * `/api/listings/paginated` 7.9 MB for six results — and the homepage strip
 * pulled all of it from the database 1000 rows at a time to render six cards.
 * That is the page that was stalling for minutes.
 *
 * A photo is a reference. The bytes belong in the `property-images` bucket.
 */

/** Generous for any real storage URL; a data URL of a photo is ~100 KB+. */
export const MAX_PHOTO_URL_LENGTH = 2048;

export function isHostedPhotoUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.length <= MAX_PHOTO_URL_LENGTH &&
    (url.startsWith('https://') || url.startsWith('http://'))
  );
}

/** The submitted photos that are NOT hosted URLs (data: URLs, blobs, junk). */
export function unhostedPhotos(photos: readonly unknown[]): unknown[] {
  return photos.filter((p) => !isHostedPhotoUrl(p));
}

/**
 * Rewrite a stored `photos` value (JSON text) keeping only hosted URLs. Returns
 * the input untouched when there is nothing to drop, so the common case costs
 * one substring scan and no JSON round-trip.
 */
export function dropInlinePhotos<T extends string | null | undefined>(raw: T): T | string | null {
  if (typeof raw !== 'string' || !raw.includes('data:')) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return raw;
    const kept = parsed.filter(isHostedPhotoUrl);
    return kept.length ? JSON.stringify(kept) : null;
  } catch {
    // Malformed JSON: the readers' parsePhotos() already treats it as no photos.
    return null;
  }
}
