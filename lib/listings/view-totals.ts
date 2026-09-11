import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listingSocialPosts, listingViews } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { MEASURABLE_PLATFORMS } from '@/lib/social/types';

/**
 * Total views for a WHOLE PAGE of listing cards, in two queries.
 *
 * The sibling of `resolvePublishers` and written for the same reason: a card
 * grid renders up to fifty listings, and a per-card lookup would be fifty (or a
 * hundred) queries onto the `max: 1` pool behind Supabase's transaction pooler
 * — the fan-out commit a3ac4f9 removed from the back office and defect D2
 * removed from the analytics page. Set-based, one copy, so it cannot come back
 * in one grid and not the others.
 *
 * Returns an EMPTY map when `showPublicViewCounts` is off. The flag has to be
 * read here, on the server: `ListingCard` renders inside client grids
 * (`enhanced-listings-grid`), so it cannot consult the flag snapshot itself.
 * With no entry the card renders no count at all, which makes the gate a
 * server-side decision and the card a dumb renderer of what it was handed.
 *
 * It also loads the snapshot itself rather than trusting the caller to have
 * done it. Six surfaces render these cards — two of them API routes with no
 * root layout above them — and a caller that forgets reads flag DEFAULTS, so
 * the kill switch would keep serving counts on some surfaces and not others.
 * `loadFeatureFlags` is per-instance and TTL-cached, so paying for it here
 * costs nothing and cannot be got wrong.
 */

/**
 * The card's single number is a FLOOR, and deliberately so.
 *
 * The detail page shows each platform on its own line with "—" where we have no
 * reading. A card has room for one figure, so it sums what we actually know:
 * the website count plus the social readings that exist. A platform we could
 * not read contributes nothing rather than a guess, which means the card total
 * always equals the sum of the numbers the detail page displays — never more.
 *
 * The alternative — treating an unreadable platform as 0 inside a total — is
 * the same lie as printing "Facebook views: 0", just harder to see because it
 * is buried in an aggregate.
 */
export async function resolveViewTotals(listingIds: number[]): Promise<Map<number, number>> {
  const totals = new Map<number, number>();
  if (listingIds.length === 0) return totals;

  await loadFeatureFlags();
  if (!isFeatureEnabled('showPublicViewCounts')) return totals;

  const ids = [...new Set(listingIds)];

  try {
    /*
     * Website views, DEDUPLICATED — one per viewer per day.
     *
     * `listing_views` holds one row per page load by design, so a plain
     * `count(*)` here would be a page-load counter that climbs when the
     * landlord reloads their own card. Same expression as
     * `getListingViewBreakdown`; `visitor_hash` already embeds the calendar
     * day, and the pre-0046 rows that carry no hash contribute their raw count
     * because nothing better exists for them.
     */
    const websiteRows = await db
      .select({
        listingId: listingViews.listingId,
        total: sql<number>`count(distinct ${listingViews.visitorHash})
          + count(*) filter (where ${listingViews.visitorHash} is null)`,
      })
      .from(listingViews)
      .where(inArray(listingViews.listingId, ids))
      .groupBy(listingViews.listingId);

    for (const row of websiteRows) {
      totals.set(row.listingId, Number(row.total ?? 0));
    }

    // Social views for posts that are CURRENTLY live. A pulled post is not on
    // the account any more, so its views are not a current fact about the
    // listing — the same rule `getListingViewBreakdown` applies.
    const socialRows = await db
      .select({
        listingId: listingSocialPosts.listingId,
        // sum() skips NULLs, so an unreadable platform adds nothing instead of
        // poisoning the whole total with a NULL or standing in as a 0.
        total: sql<number>`coalesce(sum(${listingSocialPosts.viewCount}), 0)`,
      })
      .from(listingSocialPosts)
      .where(
        and(
          inArray(listingSocialPosts.listingId, ids),
          eq(listingSocialPosts.status, 'posted'),
          inArray(listingSocialPosts.platform, MEASURABLE_PLATFORMS)
        )
      )
      .groupBy(listingSocialPosts.listingId);

    for (const row of socialRows) {
      totals.set(row.listingId, (totals.get(row.listingId) ?? 0) + Number(row.total ?? 0));
    }
  } catch (error) {
    // A view count is a nicety; the search results are not. Degrade to no
    // counts rather than failing the page — same contract as resolvePublishers.
    console.error('Error resolving listing view totals:', error);
    return new Map();
  }

  return totals;
}
