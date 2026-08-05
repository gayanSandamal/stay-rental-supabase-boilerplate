/**
 * The per-listing photo cap. Pure except for the flag read, so the arithmetic
 * is unit-testable without a DB or a flag store.
 *
 * ONE number, not two. A separate "max checked" and "max published" can only
 * safely be equal: checked < published publishes photos nothing looked at, and
 * checked > published pays a vision bill for photos that can never appear. So
 * the moderation cost ceiling is derived from the publish cap, not configured
 * next to it.
 */

import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import type { PhotoManifestEntry } from './types';

/**
 * The active cap. Returns Infinity when enforcement is off or the configured
 * value is nonsensical — a mistyped 0 in Back Office must not blank every
 * gallery on the site.
 */
export function photoCap(): number {
  if (!isFeatureEnabled('enforcePhotoCap')) return Infinity;
  const raw = Number(getFeatureValue('maxPhotosPerListing'));
  return Number.isFinite(raw) && raw >= 1 ? raw : Infinity;
}

/** Split a submitted set into what fits and what doesn't, order preserved. */
export function capPhotos(
  urls: string[],
  cap: number
): { kept: string[]; dropped: string[] } {
  if (!Number.isFinite(cap) || cap < 1 || urls.length <= cap) {
    return { kept: urls, dropped: [] };
  }
  return { kept: urls.slice(0, cap), dropped: urls.slice(cap) };
}

/**
 * How many more photos a listing can take. Used BEFORE downloading WhatsApp
 * media so over-cap bytes are never fetched into storage in the first place —
 * nothing to orphan, nothing to clean up.
 */
export function capHeadroom(currentCount: number, cap: number): number {
  if (!Number.isFinite(cap) || cap < 1) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, cap - currentCount);
}

/**
 * Manifest entries for photos refused by the cap. They are kept (not deleted)
 * so ops can swap one in from the back office and the 30-day purge still finds
 * the originals.
 */
export function capRejectEntries(urls: string[], cap: number): PhotoManifestEntry[] {
  return urls.map((url) => ({
    o: url,
    p: null,
    h: null,
    v: 'reject' as const,
    r: `only ${cap} photos can be published per listing`,
    sev: 'cosmetic' as const,
  }));
}
