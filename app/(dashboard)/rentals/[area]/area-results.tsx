import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium, newListingHideHours } from '@/lib/subscription';
import { EnhancedListingsGrid } from '@/components/enhanced-listings-grid';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { trackImpressions } from '@/lib/analytics/impressions';
import { jsonLdHtml, itemList } from '@/lib/seo/jsonld';
import type { EligibleArea } from '@/lib/seo/area-eligibility';

/**
 * Everything on an area page that needs the database or the signed-in user.
 *
 * Separated from the page for the same reason as listings-results.tsx:
 * `getUser()` reads cookies, and under PPR React postpones at the first dynamic
 * access. An await in the page body postpones at the root and the prerendered
 * shell — the heading, intro copy and internal-link mesh, which are the whole
 * SEO payload of this page — comes out empty. Keeping it here means a crawler
 * and a clicking renter both get the static chrome immediately.
 *
 * Queries stay strictly sequential: the pool is `max: 1` in production.
 */
/** First pageful. EnhancedListingsGrid pages the rest from /api/listings/paginated. */
const AREA_PAGE_LIMIT = 24;

export async function AreaResults({ area }: { area: EligibleArea }) {
  // Same label the <h1> uses, so the two can never disagree.
  const where = area.kind === 'district' ? `${area.name} District` : area.name;

  const filters: Record<string, unknown> = {
    // `city` is an exact match in getActiveListings and `district` a LIKE, which
    // is why the eligibility oracle stores the canonical name rather than the
    // slug — a round-trip through areaSlug() would not survive the comparison.
    ...(area.kind === 'city' ? { city: area.name } : { district: area.name }),
    limit: AREA_PAGE_LIMIT,
  };

  const user = await getUser();
  const isPremium = isUserPremium(user);
  filters.excludeExclusive = !isPremium;
  filters.sortExclusiveFirst = isPremium;
  filters.hideNewListingsHours = newListingHideHours(user);

  // No sortBy: the default paid-visibility ranking (Featured → Boost → plan
  // tier → Urgent → verified → completeness → newest) is the product, and an
  // area page must not quietly bypass it.
  const listings = await getActiveListings(filters as never);

  trackImpressions(listings.map((l) => l.id));

  const publishers = await resolvePublishers(listings);
  const listingsWithPublisher = listings.map((listing) => ({
    ...listing,
    ...(publishers.get(listing.id) ?? {
      publisherName: 'Unknown',
      publisherType: 'individual' as const,
      teamMemberName: null,
    }),
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml(
            itemList(
              listings.map((l) => l.id),
              `Rentals in ${area.name}, Sri Lanka`
            )
          ),
        }}
      />
      {/*
        "24 rentals available in Colombo" was a lie the moment the district held
        more than the page limit — it reported the LIMIT as the total.
        `area.listingCount` is not the fix either: it comes from a materialized
        view refreshed every ~15 minutes and does not know about the
        exclusive/early-access filters applied per viewer, so the two numbers
        can legitimately disagree.

        What we can always state truthfully is whether this page is showing
        everything it found or only the first pageful.
      */}
      <p className="text-gray-600 text-sm mb-6">
        {listings.length === AREA_PAGE_LIMIT
          ? `${AREA_PAGE_LIMIT}+ rentals available in ${where}`
          : `${listings.length} ${listings.length === 1 ? 'rental' : 'rentals'} available in ${where}`}
      </p>
      <EnhancedListingsGrid initialListings={listingsWithPublisher} showPublisher={true} />
    </>
  );
}
