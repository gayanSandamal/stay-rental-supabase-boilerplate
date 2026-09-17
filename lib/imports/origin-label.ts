/**
 * The shape and the wording of a listing's import origin — and nothing else.
 *
 * Separate from `origin.ts` because the badge that renders this is used inside
 * `'use client'` components, and `origin.ts` imports Drizzle. Pulling that into
 * a client bundle drags the `postgres` driver with it and the build fails on
 * `Can't resolve 'fs'`. Types and copy live here; queries live there.
 */

export interface ListingOrigin {
  /** facebook_group | facebook_page | pasted */
  platform: string;
  /** graph | og | manual — how much of it Facebook actually gave us. */
  resolvedVia: string;
  /** Null for a pasted import: no post lies behind it (migration 0065). */
  sourceUrl: string | null;
  importId: number;
}

/** The label an operator reads. Kept here so every screen says the same thing. */
export function originLabel(origin: ListingOrigin): string {
  if (origin.platform === 'pasted') return 'Imported · pasted advert';
  return origin.platform === 'facebook_group'
    ? 'Imported · Facebook group'
    : 'Imported · Facebook page';
}

/** How much Facebook actually served, in words. */
export function resolvedViaLabel(resolvedVia: string): string {
  if (resolvedVia === 'manual') return 'pasted by hand';
  if (resolvedVia === 'og') return 'public preview only';
  return 'full post';
}
