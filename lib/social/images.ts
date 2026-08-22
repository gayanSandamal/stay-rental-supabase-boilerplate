/**
 * Which photos go into a social post, and where the platforms fetch them from.
 *
 * Social networks never receive a Supabase URL. Two independent reasons:
 *   1. Instagram's Content Publishing API accepts JPEG only, and our derived
 *      photos are WebP (lib/images/store.ts writes `…-w.webp`).
 *   2. TikTok only pulls images from a domain verified in its developer portal,
 *      and `*.supabase.co` is not ours to verify.
 * Both are solved by serving through app/api/social/img/[listingId]/[index],
 * which transcodes to JPEG on our own domain.
 */

import { getFeatureValue } from '@/lib/feature-flags';
import { derivePhotos, parseManifest, parsePhotos, adoptOrphanPhotos } from '@/lib/images/manifest';
import { baseUrl } from './config';

/** The listing columns this module reads. */
export interface PhotoSource {
  id: number;
  photos: string | null;
  photosManifest: string | null;
}

/**
 * The published photos of a listing, in gallery order.
 *
 * Reads the manifest (the source of truth) but falls back through
 * `adoptOrphanPhotos` so a legacy listing whose photos predate the manifest
 * still publishes — exactly as the moderation pipeline does.
 */
export function publishablePhotos(listing: PhotoSource): string[] {
  const entries = adoptOrphanPhotos(
    parseManifest(listing.photosManifest),
    parsePhotos(listing.photos)
  ).entries;
  const fromManifest = derivePhotos(entries);
  // A listing with an empty/absent manifest still has `photos`.
  return fromManifest.length ? fromManifest : parsePhotos(listing.photos);
}

/** How many photos a post may carry. Instagram's carousel ceiling is 10. */
export function socialPhotoCap(): number {
  const raw = Number(getFeatureValue('socialMaxPhotos') ?? 10);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(Math.floor(raw), 10);
}

/**
 * The public JPEG URLs to hand a platform.
 *
 * Indexes are positions in `publishablePhotos()`, so the proxy resolves the
 * same list the same way. Capped here rather than in each adapter so every
 * platform posts the identical set.
 */
export function socialImageUrls(listing: PhotoSource): string[] {
  const count = Math.min(publishablePhotos(listing).length, socialPhotoCap());
  const base = baseUrl().replace(/\/+$/, '');
  // The `.jpg` suffix is cosmetic — the route serves by content type and strips
  // it — but some platform fetchers and link previewers still sniff the
  // extension, and it costs nothing to look like what it is.
  return Array.from({ length: count }, (_, i) => `${base}/api/social/img/${listing.id}/${i}.jpg`);
}
