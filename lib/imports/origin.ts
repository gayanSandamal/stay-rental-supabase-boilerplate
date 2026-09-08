/**
 * "Did this listing come from an imported post?" — for the approval screens.
 *
 * There is no origin column on `listings`; the only link is
 * `post_imports.listing_id`. So this is a reverse lookup, and it is written as a
 * BATCH on purpose: the moderation and listings pages render up to 200 rows, and
 * a per-row query there is the shape that wedges a `max: 1` pool behind
 * Supabase's transaction pooler (commit a3ac4f9). One query per page, never one
 * per listing.
 *
 * Why it matters on those screens: an imported listing is attributed to Easy
 * Rent Operations, so without a label it reads as though we wrote it. The
 * operator approving third-party photos and third-party text should know that is
 * what they are looking at.
 */

import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { postImports } from '@/lib/db/schema';
import type { ListingOrigin } from './origin-label';

export type { ListingOrigin } from './origin-label';
export { originLabel, resolvedViaLabel } from './origin-label';


/** listingId → origin, for the ids on one page. Empty map when none are imports. */
export async function importOriginsFor(
  listingIds: number[]
): Promise<Map<number, ListingOrigin>> {
  const origins = new Map<number, ListingOrigin>();
  if (!listingIds.length) return origins;

  const rows = await db
    .select({
      listingId: postImports.listingId,
      platform: postImports.sourcePlatform,
      resolvedVia: postImports.resolvedVia,
      sourceUrl: postImports.sourceUrl,
      importId: postImports.id,
    })
    .from(postImports)
    .where(inArray(postImports.listingId, listingIds));

  for (const row of rows) {
    if (row.listingId == null) continue;
    origins.set(row.listingId, {
      platform: row.platform,
      resolvedVia: row.resolvedVia,
      sourceUrl: row.sourceUrl,
      importId: row.importId,
    });
  }
  return origins;
}

/** One listing, for a detail page. Null when it was not imported. */
export async function importOriginFor(listingId: number): Promise<ListingOrigin | null> {
  const origins = await importOriginsFor([listingId]);
  return origins.get(listingId) ?? null;
}
