import { getActiveListings } from '@/lib/db/queries';
import { EnhancedListingsGrid } from '@/components/enhanced-listings-grid';
import { getUser } from '@/lib/db/queries';
import { Suspense } from 'react';
import { ActiveFiltersChips } from '@/components/active-filters-chips';
import { ListingsSearchBar } from '@/components/listings-search-bar';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, users, landlords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

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
  const user = await getUser();

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
    <main className="min-h-screen bg-gray-50">
      {/* Sticky Top Navigation Bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Suspense fallback={
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center gap-4 w-full">
                <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
                <div className="flex-1 h-10 bg-gray-200 rounded-lg animate-pulse" />
                <div className="w-24 h-10 bg-gray-200 rounded-lg animate-pulse" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-20 h-10 bg-gray-200 rounded-lg animate-pulse" />
              </div>
            </div>
          }>
            <ListingsSearchBar user={user} />
          </Suspense>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Available Rentals
          </h1>
          <p className="text-gray-600">
            {listings.length}+ {listings.length === 1 ? 'listing' : 'listings'} available
          </p>
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
