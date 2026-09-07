/**
 * Which `/listings/<id>` and root `/<slug>` URLs actually exist.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 * Measured on production 2026-09-07: `GET /this-page-does-not-exist-xyz` and
 * `GET /listings/1` both returned **HTTP 200**. Every unknown URL on the site
 * did. Landlord profiles live at the ROOT (`app/(dashboard)/[slug]`), so the
 * catch-all matches literally any path — and under PPR the prerendered shell is
 * flushed, committing a 200, before `notFound()` ever runs in the Suspense
 * child. The pages do carry `noindex`, so nothing junk gets indexed; what it
 * costs is crawl budget across an unbounded namespace and a Search Console
 * full of soft 404s.
 *
 * ── Why this is decided in middleware ──────────────────────────────────────
 * The two obvious fixes are both forbidden. `force-dynamic` opts the page out
 * of PPR (23 of 39 shells came out empty when that was measured, 2026-09-02),
 * and awaiting the lookup above the Suspense boundary postpones at the root and
 * empties the shell just the same. Middleware runs BEFORE any of that, so it
 * can answer with a real status without touching how the page renders.
 *
 * ── Why a snapshot rather than a query per request ─────────────────────────
 * The pool is `max: 1` and strictly sequential; a lookup on every request would
 * be a second query racing the page's own — the exact pattern that wedges
 * Supabase's transaction pooler (CLAUDE.md, a3ac4f9). So this keeps a
 * per-instance TTL snapshot, the same shape as lib/feature-flags-store.ts and
 * lib/locations/store.ts: one query per instance per TTL, never per request.
 *
 * ── Why `maxListingId` makes the snapshot safe to be stale ─────────────────
 * A snapshot can be up to TTL out of date, so "not in the set" alone would
 * 404 a listing published thirty seconds ago. `id` is a serial, so anything
 * newer than the snapshot necessarily has an id ABOVE the recorded maximum:
 * those fall through and render normally. Only an id at or below the maximum
 * that is absent from the set is answered as missing — which is exactly right
 * for a listing that never existed, and for one that has since been archived
 * or expired.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

const TTL_MS = 60_000;

type Snapshot = {
  activeListingIds: Set<number>;
  maxListingId: number;
  landlordSlugs: Set<string>;
};

const EMPTY: Snapshot = {
  activeListingIds: new Set(),
  maxListingId: 0,
  landlordSlugs: new Set(),
};

let snapshot: Snapshot | null = null;
let loadedAt = 0;
let inFlight: Promise<Snapshot> | null = null;

async function load(): Promise<Snapshot> {
  /*
   * Two small reads, SEQUENTIAL. Never Promise.all — see the note above.
   *
   * Only ids and slugs: at any plausible inventory this is a few hundred KB in
   * the worst case, and the alternative (a query per request) is what we are
   * avoiding. MAX(id) comes from the same scan rather than a second query.
   */
  const listingRows = await db.execute<{ id: number }>(
    sql`SELECT id FROM listings
        WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at >= NOW())`
  );
  const maxRow = await db.execute<{ max_id: number | null }>(
    sql`SELECT MAX(id) AS max_id FROM listings`
  );

  const landlordRows = await db.execute<{ profile_slug: string | null; public_id: string | null }>(
    sql`SELECT profile_slug, public_id FROM landlords`
  );

  const activeListingIds = new Set<number>();
  for (const row of Array.isArray(listingRows) ? listingRows : []) {
    activeListingIds.add(Number(row.id));
  }

  const landlordSlugs = new Set<string>();
  for (const row of Array.isArray(landlordRows) ? landlordRows : []) {
    if (row.profile_slug) landlordSlugs.add(String(row.profile_slug).toLowerCase());
    if (row.public_id) landlordSlugs.add(String(row.public_id).toLowerCase());
  }

  const maxArr = Array.isArray(maxRow) ? maxRow : [];
  const maxListingId = Number(maxArr[0]?.max_id ?? 0) || 0;

  return { activeListingIds, maxListingId, landlordSlugs };
}

/**
 * Current snapshot, or `null` when one has never loaded successfully.
 *
 * `null` means "cannot tell" and every caller must treat it as "let the request
 * through". A database blip must never turn into a site-wide 404 — serving a
 * soft 200 for a while is recoverable, telling Google every URL is gone is not.
 */
export async function getKnownRoutes(maxAgeMs: number = TTL_MS): Promise<Snapshot | null> {
  if (snapshot && Date.now() - loadedAt < maxAgeMs) return snapshot;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      snapshot = await load();
      loadedAt = Date.now();
    } catch (err) {
      console.error('[seo:known-routes] snapshot load failed — passing requests through', err);
    } finally {
      inFlight = null;
    }
    return snapshot ?? EMPTY;
  })();

  const result = await inFlight;
  return snapshot ? result : null;
}

/**
 * How stale the snapshot may be before an above-max id forces a re-read.
 *
 * `id` is a serial, so an id above the recorded maximum is EITHER a listing
 * published since the snapshot (an increment or two above it) OR a probe like
 * /listings/999999. The first must render; the second must 404. Refreshing
 * settles which, and the guard bounds the cost: however many probes arrive,
 * they trigger at most one extra query every 5 seconds, and they all share it.
 */
const ABOVE_MAX_REFRESH_MS = 5_000;

/**
 * True when we can prove `/listings/<id>` does not exist.
 *
 * Async because an id above the snapshot's maximum needs a fresher answer
 * before it can be called missing — see ABOVE_MAX_REFRESH_MS.
 */
export async function listingIsMissing(snap: Snapshot, rawId: string): Promise<boolean> {
  if (!/^\d+$/.test(rawId)) return true;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return true;

  if (id <= snap.maxListingId) return !snap.activeListingIds.has(id);

  const fresh = await getKnownRoutes(ABOVE_MAX_REFRESH_MS);
  // Refresh failed — cannot tell, so let it render rather than guess.
  if (!fresh) return false;
  if (id <= fresh.maxListingId) return !fresh.activeListingIds.has(id);
  // Still beyond the highest id the table has ever issued: it cannot exist.
  return true;
}

/** True when we can prove root `/<slug>` is not a landlord profile. */
export function landlordIsMissing(snap: Snapshot, slug: string): boolean {
  return !snap.landlordSlugs.has(slug.toLowerCase());
}
