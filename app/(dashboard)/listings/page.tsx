import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium, newListingHideHours } from '@/lib/subscription';
import { EnhancedListingsGrid } from '@/components/enhanced-listings-grid';
import { SignedUpBanner } from '@/components/signed-up-banner';
import { LandlordCrossSellBanner } from '@/components/landlord-cross-sell-banner';
import { Suspense } from 'react';
import { ActiveFiltersChips } from '@/components/active-filters-chips';
import { ListingsSearchFilter } from '@/components/listings-search-filter';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { trackImpressions } from '@/lib/analytics/impressions';
import type { Metadata } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  house: 'Houses',
  room: 'Rooms',
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const city = typeof params.city === 'string' ? params.city : undefined;
  const propertyType = typeof params.propertyType === 'string' ? params.propertyType : undefined;
  const minPrice = params.minPrice ? parseInt(String(params.minPrice)) : undefined;
  const maxPrice = params.maxPrice ? parseInt(String(params.maxPrice)) : undefined;
  const bedrooms = params.bedrooms ? parseInt(String(params.bedrooms)) : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;

  const parts: string[] = [];
  if (city) parts.push(`in ${city}`);
  if (propertyType && PROPERTY_TYPE_LABELS[propertyType]) parts.push(PROPERTY_TYPE_LABELS[propertyType]);
  if (maxPrice && !minPrice) parts.push(`under LKR ${maxPrice.toLocaleString()}`);
  if (minPrice && !maxPrice) parts.push(`from LKR ${minPrice.toLocaleString()}`);
  if (minPrice && maxPrice) parts.push(`LKR ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}`);
  if (bedrooms) parts.push(`${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`);
  if (search) parts.push(`"${search}"`);

  const title = parts.length > 0
    ? `${parts.join(' ')} | Easy Rent`
    : 'Browse Rentals in Sri Lanka';
  // Same correction as the site-wide description in app/layout.tsx: there is no
  // landlord KYC and no property has ever been visited. What is true is the
  // verified contact number and the pre-publish checks.
  const description = parts.length > 0
    ? `Find mid-to-long-term rentals ${parts.join(' ')} in Sri Lanka. Verified contact numbers and direct contact with the owner — no middlemen.`
    : 'Find mid-to-long-term rentals in Sri Lanka. Browse apartments, houses, and rooms with verified contact numbers, direct from the owner.';

  const canonicalParams = new URLSearchParams();
  if (city) canonicalParams.set('city', city);
  if (propertyType) canonicalParams.set('propertyType', propertyType);
  if (minPrice) canonicalParams.set('minPrice', String(minPrice));
  if (maxPrice) canonicalParams.set('maxPrice', String(maxPrice));
  if (bedrooms) canonicalParams.set('bedrooms', String(bedrooms));
  if (search) canonicalParams.set('search', search);
  const canonical = canonicalParams.toString()
    ? `${baseUrl}/listings?${canonicalParams.toString()}`
    : `${baseUrl}/listings`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
    },
  };
}

export default async function ListingsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 15: searchParams is a Promise and must be awaited before property access.
  const searchParams = await props.searchParams;
  // Load initial batch of listings (first page)
  const initialLimit = 20;
  const filters: any = { limit: initialLimit };
  
  // Apply filters from search params
  if (searchParams.search) filters.search = String(searchParams.search);
  if (searchParams.city) filters.city = String(searchParams.city);
  if (searchParams.district) filters.district = String(searchParams.district);
  if (searchParams.minPrice) filters.minPrice = parseInt(String(searchParams.minPrice));
  if (searchParams.maxPrice) filters.maxPrice = parseInt(String(searchParams.maxPrice));
  if (searchParams.bedrooms) filters.bedrooms = parseInt(String(searchParams.bedrooms));
  if (searchParams.propertyType) filters.propertyType = String(searchParams.propertyType);
  if (searchParams.powerBackup) filters.powerBackup = String(searchParams.powerBackup);
  if (searchParams.waterSource) filters.waterSource = String(searchParams.waterSource);
  if (searchParams.hasFiber === 'true') filters.hasFiber = true;
  if (searchParams.verifiedOnly === 'true') filters.verifiedOnly = true;
  if (searchParams.visitedOnly === 'true') filters.visitedOnly = true;
  if (searchParams.parking === 'true') filters.parking = true;
  if (searchParams.petsAllowed === 'true') filters.petsAllowed = true;

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

  const showSignedUpBanner = searchParams.signed_up === '1';

  return (
    <main className="min-h-screen bg-[#F7F4ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <SignedUpBanner show={showSignedUpBanner} />
        {/* Tenant→landlord cross-sell; suppressed while the signed-up banner
            is visible to avoid stacking two banners. */}
        {user?.role === 'tenant' && !showSignedUpBanner && <LandlordCrossSellBanner />}
        {/* Page header + search/filter row */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                Available Rentals
              </h1>
              <p className="text-gray-600 text-sm">
                {listings.length}+ {listings.length === 1 ? 'listing' : 'listings'} available across Sri Lanka
              </p>
            </div>
          </div>

          {/* Search + Filters */}
          <Suspense fallback={
            <div className="flex gap-3">
              <div className="flex-1 h-11 bg-white rounded-xl animate-pulse" />
              <div className="w-24 h-11 bg-white rounded-xl animate-pulse" />
            </div>
          }>
            <ListingsSearchFilter />
          </Suspense>
        </div>

        {/* Active Filters Chips */}
        <Suspense fallback={null}>
          <ActiveFiltersChips />
        </Suspense>

        {/* Listings Grid */}
        <Suspense fallback={<div className="bg-white rounded-lg p-8 text-center">Loading listings...</div>}>
          <EnhancedListingsGrid initialListings={listingsWithPublisher} showPublisher={true} />
        </Suspense>
      </div>
    </main>
  );
}
