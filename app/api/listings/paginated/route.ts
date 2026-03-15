import { NextRequest, NextResponse } from 'next/server';
import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium } from '@/lib/subscription';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, users, landlords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build filters from search params
    const filters: any = {
      limit: limit + 1, // Fetch one extra to check if there's more
      offset,
    };

    // Add all filter parameters
    const search = searchParams.get('search');
    if (search) filters.search = search;

    const city = searchParams.get('city');
    if (city) filters.city = city;

    const district = searchParams.get('district');
    if (district) filters.district = district;

    const minPrice = searchParams.get('minPrice');
    if (minPrice) filters.minPrice = parseInt(minPrice);

    const maxPrice = searchParams.get('maxPrice');
    if (maxPrice) filters.maxPrice = parseInt(maxPrice);

    const bedrooms = searchParams.get('bedrooms');
    if (bedrooms) filters.bedrooms = parseInt(bedrooms);

    const propertyType = searchParams.get('propertyType');
    if (propertyType) filters.propertyType = propertyType;

    const powerBackup = searchParams.get('powerBackup');
    if (powerBackup) filters.powerBackup = powerBackup;

    const waterSource = searchParams.get('waterSource');
    if (waterSource) filters.waterSource = waterSource;

    const hasFiber = searchParams.get('hasFiber');
    if (hasFiber === 'true') filters.hasFiber = true;

    const verifiedOnly = searchParams.get('verifiedOnly');
    if (verifiedOnly === 'true') filters.verifiedOnly = true;

    const visitedOnly = searchParams.get('visitedOnly');
    if (visitedOnly === 'true') filters.visitedOnly = true;

    const parking = searchParams.get('parking');
    if (parking === 'true') filters.parking = true;

    const petsAllowed = searchParams.get('petsAllowed');
    if (petsAllowed === 'true') filters.petsAllowed = true;

    const user = await getUser();
    const isPremium = isUserPremium(user);
    filters.excludeExclusive = !isPremium;
    filters.sortExclusiveFirst = isPremium;
    filters.hideNewListingsHours = isPremium ? undefined : 24;

    // Fetch listings
    const listings = await getActiveListings(filters);

    // Check if there are more listings
    const hasMore = listings.length > limit;
    const listingsToReturn = hasMore ? listings.slice(0, limit) : listings;

    // Fetch publisher information for each listing
    const listingsWithPublisher = await Promise.all(
      listingsToReturn.map(async (listing) => {
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

    return NextResponse.json({
      success: true,
      listings: listingsWithPublisher,
      hasMore,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('Error fetching paginated listings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

