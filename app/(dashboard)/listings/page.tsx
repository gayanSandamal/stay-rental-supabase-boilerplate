import { SignedUpBanner } from '@/components/signed-up-banner';
import { Suspense } from 'react';
import { ListingsResults } from './listings-results';
import { ListingsResultsSkeleton } from './listings-results-skeleton';
import { ActiveFiltersChips } from '@/components/active-filters-chips';
import { ListingsSearchFilter } from '@/components/listings-search-filter';
import type { Metadata } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  house: 'Houses',
  room: 'Rooms',
};


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

export default function ListingsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  /*
   * NOT `async`, AND NOTHING IS AWAITED HERE — INCLUDING `searchParams`.
   *
   * This is the part that is easy to get wrong. Moving the database work into
   * <ListingsResults/> was necessary but not sufficient: in Next 15
   * `searchParams` is a Promise, and awaiting it is itself a DYNAMIC ACCESS.
   * Under PPR React postpones at the first one, so `await props.searchParams`
   * sitting up here postponed at the page root and the prerendered shell was
   * still 0 bytes — the same empty-shell symptom, from a different cause, with
   * `force-dynamic` already removed.
   *
   * So the promise is passed DOWN unawaited and resolved inside the Suspense
   * children. Everything in this function body is static and prerenderable,
   * which is what lets a click paint instantly instead of waiting on a full
   * server round trip.
   */
  return (
    <main className="min-h-screen bg-[#F7F4ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={null}>
          <SignedUpBannerSlot searchParams={props.searchParams} />
        </Suspense>
        {/* Page header + search/filter row */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                Available Rentals
              </h1>
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

        {/* Everything that needs the DB or the signed-in user. */}
        <Suspense fallback={<ListingsResultsSkeleton />}>
          <ListingsResults searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** Awaits searchParams below a boundary so the page body never has to. */
async function SignedUpBannerSlot({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  return <SignedUpBanner show={params.signed_up === '1'} />;
}
