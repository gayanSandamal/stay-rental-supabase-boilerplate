import { getActiveListings } from '@/lib/db/queries';
import { EnhancedListingsGrid } from '@/components/enhanced-listings-grid';
import { Suspense } from 'react';
import { ActiveFiltersChips } from '@/components/active-filters-chips';
import { ListingsSearchFilter } from '@/components/listings-search-filter';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, users, landlords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  house: 'Houses',
  room: 'Rooms',
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}): Promise<Metadata> {
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
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
    ? `${parts.join(' ')} | Stay Rental`
    : 'Browse Rentals in Sri Lanka';
  const description = parts.length > 0
    ? `Find verified mid-to-long-term rentals ${parts.join(' ')} in Sri Lanka. KYC-verified landlords, property visits, and fast viewing coordination.`
    : 'Find verified mid-to-long-term rentals in Sri Lanka. Browse apartments, houses, and rooms. KYC-verified landlords, property visits, and fast viewing coordination.';

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

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
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

  const listings = await getActiveListings(filters);

  // Fetch publisher information for each listing
  const listingsWithPublisher = await Promise.all(
    listings.map(async (listing) => {
      let publisherName = 'Unknown';
      let publisherType: 'individual' | 'business' = 'individual';
      let teamMemberName: string | null = null;

      // Check if listing was created by a business account
      if (listing.businessAccountId) {
        try {
          const businessAccount = await db.query.businessAccounts.findFirst({
            where: eq(businessAccounts.id, listing.businessAccountId),
          });
          
          if (businessAccount) {
            publisherType = 'business';
            publisherName = businessAccount.name;

            // Get the team member who created it
            if (listing.createdBy) {
              const creator = await db.query.users.findFirst({
                where: eq(users.id, listing.createdBy),
              });
              teamMemberName = creator?.name || creator?.email || null;
            }
          }
        } catch (error) {
          console.error('Error fetching business account:', error);
        }
      }

      // If not a business account, get landlord info
      if (publisherType === 'individual' && !listing.businessAccountId) {
        try {
          const landlordInfo = await db.query.landlords.findFirst({
            where: eq(landlords.id, listing.landlordId),
            with: {
              user: true,
            },
          });
          
          if (landlordInfo?.user) {
            publisherName = landlordInfo.user.name || landlordInfo.user.email;
          }
        } catch (error) {
          console.error('Error fetching landlord info:', error);
        }
      }

      return {
        ...listing,
        publisherName,
        publisherType,
        teamMemberName,
      };
    })
  );

  return (
    <main className="min-h-screen bg-[#F7F4ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
