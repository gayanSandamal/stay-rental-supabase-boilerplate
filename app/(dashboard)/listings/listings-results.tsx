import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium, newListingHideHours } from '@/lib/subscription';
import { EnhancedListingsGrid } from '@/components/enhanced-listings-grid';
import { LandlordCrossSellBanner } from '@/components/landlord-cross-sell-banner';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { parseListingFilters } from '@/lib/listings/filter-params';
import { trackImpressions } from '@/lib/analytics/impressions';

/**
 * Everything on /listings that needs the database or the signed-in user.
 *
 * WHY THIS IS A SEPARATE COMPONENT. It all used to live in the page body, above
 * the page's own `<Suspense>` boundaries — which made those boundaries
 * decorative. `getUser()` reads cookies, and under PPR React postpones at the
 * FIRST dynamic access: with the await sitting above everything, it postponed at
 * the page root and the prerendered shell came out empty. The build showed
 * `listings.html` at 0 bytes, so a click had nothing to paint and blocked on the
 * whole server round trip.
 *
 * Dropping `force-dynamic` alone would not have fixed that. The dynamic work has
 * to sit BELOW a Suspense boundary for the static chrome above it to survive
 * prerendering. That is the entire point of this file.
 *
 * Queries stay strictly sequential — the pool is `max: 1` in production and
 * concurrent queries wedge Supabase's transaction pooler (CLAUDE.md, a3ac4f9).
 */
export async function ListingsResults({
  searchParams,
}: {
  // The PROMISE, not the resolved value — awaiting it is a dynamic access, and
  // doing that in the page body postpones PPR at the root. See page.tsx.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const initialLimit = 20;
  // Every renter-supplied filter comes through the one parser, which honours all
  // 33 the form offers. The server-derived keys below are set AFTER it, from
  // authenticated truth — the parser deliberately refuses to read them from the
  // URL so a visitor cannot grant themselves early access or exclusive listings.
  const filters: any = {
    ...parseListingFilters(params),
    limit: initialLimit,
  };

  const user = await getUser();
  const isPremium = isUserPremium(user);
  filters.excludeExclusive = !isPremium;
  filters.sortExclusiveFirst = isPremium;
  filters.hideNewListingsHours = newListingHideHours(user);

  const listings = await getActiveListings(filters);

  /*
   * Impressions are counted at the surfaces that SERVE listings, not inside
   * getActiveListings. The ranking function is the single search path, but
   * "fetched" is not "seen": the homepage strip pulls a thousand rows to show
   * six, and the saved-search cron pulls results nobody looks at. Counting what
   * was actually rendered is the only figure the funnel can honestly use.
   *
   * Synchronous map write — nothing is awaited on the search path.
   */
  trackImpressions(listings.map((l) => l.id));

  /*
   * Publisher names for the whole result set in three queries, not two per row.
   * This was a `Promise.all` over the results, each iteration running its own
   * business-account and landlord lookups, on the busiest page in the product
   * and a `max: 1` pool. Same defect as D2 on the analytics page.
   */
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
      {/* Tenant→landlord cross-sell; suppressed while the signed-up banner
          is visible to avoid stacking two banners. */}
      {user?.role === 'tenant' && params.signed_up !== '1' && <LandlordCrossSellBanner />}
      <p className="text-gray-600 text-sm -mt-4 mb-6">
        {listings.length}+ {listings.length === 1 ? 'listing' : 'listings'} available across
        Sri Lanka
      </p>
      <EnhancedListingsGrid initialListings={listingsWithPublisher} showPublisher={true} />
    </>
  );
}
