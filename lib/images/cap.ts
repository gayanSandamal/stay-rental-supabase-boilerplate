/**
 * The photo cap, in one place.
 *
 * `maxPhotosPerListing` is BOTH the product limit and the moderation cost
 * ceiling — see the flag's comment in lib/feature-flags.ts for why splitting
 * them can only be wrong. Everything here except `photoCap()` is pure (the cap
 * arrives as an argument), mirroring manifest.ts's no-I/O contract so the whole
 * decision table is unit-testable.
 */

import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import type { PhotoManifestEntry } from './types';

/**
 * The effective cap, given the two flag values.
 *
 * Split out from `photoCap()` so a CLIENT component can reach the same answer:
 * the back office's import review screen warns an operator when their album is
 * over the cap, and that warning has to agree with what publishImport will
 * actually drop. Reading the flags there through `useFeatureValue` and then
 * doing its own arithmetic is how the two drift — one of them forgetting that
 * `enforcePhotoCap` off means no cap at all, and telling an operator to delete
 * photos nothing was going to drop.
 *
 * Pure, so it stays inside this file's no-I/O contract and pulls no server code
 * into the client bundle.
 */
export function effectiveCap(enforced: boolean, rawValue: unknown): number {
  if (!enforced) return Infinity;
  const raw = Number(rawValue);
  if (!Number.isFinite(raw) || raw < 1) return Infinity;
  return Math.floor(raw);
}

/**
 * The effective cap. `Infinity` means "no cap", which is also what a
 * non-positive flag value yields: a fat-fingered `0` in the back office must
 * not blank every gallery on the site. (`engine.ts`'s old `?? 6` only guarded
 * null, not 0.)
 */
export function photoCap(): number {
  return effectiveCap(isFeatureEnabled('enforcePhotoCap'), getFeatureValue('maxPhotosPerListing'));
}

/** Split a URL list at the cap, preserving order. */
export function capPhotos(urls: string[], cap: number): { kept: string[]; dropped: string[] } {
  if (!Number.isFinite(cap)) return { kept: [...urls], dropped: [] };
  return { kept: urls.slice(0, cap), dropped: urls.slice(cap) };
}

/** How many more photos a listing can accept. Never negative. */
export function capHeadroom(current: number, cap: number): number {
  if (!Number.isFinite(cap)) return Infinity;
  return Math.max(0, cap - current);
}

/** The landlord-facing reason a photo was refused for being over the limit. */
export function capReason(cap: number): string {
  return `only ${cap} photos can be published per listing`;
}

/**
 * Manifest entries for photos dropped at the cap. They are `reject`/`cosmetic`
 * rather than absent so the original stays recorded, restorable by ops, and
 * collected by the purge job — the standing rule is drop bad photos, never
 * destroy them.
 */
export function capRejectEntries(urls: string[], cap: number): PhotoManifestEntry[] {
  return urls.map((url) => ({
    o: url,
    p: null,
    h: null,
    v: 'reject' as const,
    r: capReason(cap),
    sev: 'cosmetic' as const,
  }));
}
