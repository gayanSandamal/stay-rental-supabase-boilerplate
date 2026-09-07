/**
 * Which area landing pages are allowed to exist right now.
 *
 * ── Why a gate at all ──────────────────────────────────────────────────────
 * The gazetteer knows 173 towns and 25 districts, and the `locations` table
 * knows 16,191 places. Generating a page per place is trivially easy and is
 * exactly what Google's March 2024 scaled-content-abuse policy targets: at the
 * time of writing production holds ONE listing (archived), so 198 "Houses for
 * rent in X" pages would every one of them be empty. That does not rank badly,
 * it demotes the whole domain.
 *
 * So a page exists only once its area holds enough live inventory to be worth a
 * renter's click. Below threshold the route 404s, stays out of the sitemap, and
 * is linked from nowhere. Above it, the page appears on its own — no deploy, no
 * manual list to maintain.
 *
 * This is the same principle as MIN_COMPARABLES_FOR_RENT in
 * lib/analytics/comparables.ts: a page without the inventory to justify it is
 * not printed, for the same reason a statistic without its sample size is not.
 *
 * ── Where the counts come from ─────────────────────────────────────────────
 * `search_location_suggestions` (migration 0009) already aggregates active,
 * non-expired listings per city AND per district, and /api/cron/refresh-
 * suggestions rebuilds it every ~15 minutes. It is the cheapest correct source
 * — one small indexed read instead of a GROUP BY over `listings` per request.
 *
 * The snapshot is per-instance and TTL-cached, the same shape as
 * lib/feature-flags-store.ts and lib/locations/store.ts. That keeps this off
 * the `max: 1` pool on the hot path: one query per instance per TTL, never one
 * per request.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { areaSlug } from './urls';

/**
 * A city needs three live listings before it gets a page; a district five.
 *
 * The district bar is higher because a district page competes with the city
 * pages beneath it — at two listings it is a worse version of the city page,
 * not a broader one.
 *
 * These are deliberately low. The purpose is to keep EMPTY pages out of the
 * index, not to hold back a place that genuinely has inventory. Raise them if
 * thin-content warnings appear in Search Console; do not lower them to zero.
 */
export const MIN_LISTINGS_FOR_CITY_PAGE = 3;
export const MIN_LISTINGS_FOR_DISTRICT_PAGE = 5;

export type AreaKind = 'city' | 'district';

export type EligibleArea = {
  kind: AreaKind;
  /** Canonical name as stored on `listings.city` / `listings.district`. */
  name: string;
  /** URL segment — `/rentals/<slug>`. */
  slug: string;
  listingCount: number;
};

const TTL_MS = 5 * 60 * 1000;

let snapshot: EligibleArea[] = [];
let loadedAt = 0;
let inFlight: Promise<EligibleArea[]> | null = null;

async function fetchEligibleAreas(): Promise<EligibleArea[]> {
  const rows = await db.execute<{
    kind: string;
    value: string;
    listing_count: number;
  }>(
    sql`
      SELECT kind, value, listing_count
      FROM search_location_suggestions
      WHERE value IS NOT NULL
        AND TRIM(value) <> ''
        AND (
          (kind = 'city' AND listing_count >= ${MIN_LISTINGS_FOR_CITY_PAGE})
          OR (kind = 'district' AND listing_count >= ${MIN_LISTINGS_FOR_DISTRICT_PAGE})
        )
      ORDER BY listing_count DESC
    `
  );

  const out: EligibleArea[] = [];
  /*
   * A name can be BOTH a city and a district (Colombo, Kandy, Galle, Matara…)
   * and /rentals/<slug> is a flat namespace, so the two would collide. The
   * district wins: it is the broader page and its listing set is a superset of
   * the same-named city's. Rows arrive ordered by count, so this also means the
   * surviving row is the larger one.
   */
  const claimed = new Set<string>();
  for (const kind of ['district', 'city'] as const) {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.kind !== kind) continue;
      const name = String(row.value).trim();
      const slug = areaSlug(name);
      if (!slug || claimed.has(slug)) continue;
      claimed.add(slug);
      out.push({ kind, name, slug, listingCount: Number(row.listing_count) });
    }
  }
  return out;
}

/**
 * Areas that currently qualify for a landing page.
 *
 * Returns the last good snapshot on a database failure rather than throwing —
 * an outage should not silently 404 every area page and drop them from the
 * sitemap, which is a far more expensive signal to send than serving a slightly
 * stale list.
 */
export async function eligibleAreas(force = false): Promise<EligibleArea[]> {
  if (!force && loadedAt > 0 && Date.now() - loadedAt < TTL_MS) return snapshot;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      snapshot = await fetchEligibleAreas();
      loadedAt = Date.now();
    } catch (err) {
      console.error('[seo:area-eligibility] snapshot load failed — serving previous', err);
    } finally {
      inFlight = null;
    }
    return snapshot;
  })();

  return inFlight;
}

/** The one area matching a `/rentals/<slug>` segment, or null when not eligible. */
export async function findEligibleArea(slug: string): Promise<EligibleArea | null> {
  const areas = await eligibleAreas();
  return areas.find((a) => a.slug === slug) ?? null;
}

/**
 * Lowercased city names that have a live `/rentals/<city>` page.
 *
 * Used by lib/seo/indexability.ts to decide whether a `?city=` filter may
 * canonicalize to an area page — pointing a canonical at a URL that 404s is
 * worse than not setting one.
 */
export async function liveAreaCitySlugs(): Promise<ReadonlySet<string>> {
  const areas = await eligibleAreas();
  return new Set(areas.map((a) => a.name.toLowerCase()));
}
