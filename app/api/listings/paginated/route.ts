import { NextRequest, NextResponse } from 'next/server';
import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium, newListingHideHours } from '@/lib/subscription';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { trackImpressions } from '@/lib/analytics/impressions';

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
    filters.hideNewListingsHours = newListingHideHours(user);

    // Fetch listings
    const listings = await getActiveListings(filters);

    // Check if there are more listings
    const hasMore = listings.length > limit;
    const listingsToReturn = hasMore ? listings.slice(0, limit) : listings;

    // Only what this page actually returns — the extra row fetched to detect
    // `hasMore` is never rendered and must not be counted as seen.
    trackImpressions(listingsToReturn.map((l) => l.id));

    /*
     * Three queries for the page, not two per row — see resolvePublishers.
     * Infinite scroll makes this the most frequently hit handler in the app,
     * and the pool it runs against is `max: 1`.
     */
    const publishers = await resolvePublishers(listingsToReturn);
    const listingsWithPublisher = listingsToReturn.map((listing) => ({
      ...listing,
      ...(publishers.get(listing.id) ?? {
        publisherName: 'Unknown',
        publisherType: 'individual' as const,
        teamMemberName: null,
      }),
    }));

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

