import { NextRequest, NextResponse } from 'next/server';
import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium, newListingHideHours } from '@/lib/subscription';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { trackImpressions } from '@/lib/analytics/impressions';
import { parseListingFilters } from '@/lib/listings/filter-params';

export const dynamic = 'force-dynamic';

/** Upper bound on rows one request may ask for. */
const MAX_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    // Clamped. `limit` used to be read straight off the URL, so `?limit=999999`
    // bought a caller a full-table scan plus a resolvePublishers pass on the
    // most frequently hit handler in the app, against a max:1 pool.
    const requested = parseInt(searchParams.get('limit') || '20') || 20;
    const limit = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
    const offset = (page - 1) * limit;

    // One parser, all 33 filters. Server-derived keys are set below, never read
    // from the URL — see the note in lib/listings/filter-params.ts.
    const filters: any = {
      ...parseListingFilters(searchParams),
      limit: limit + 1, // one extra row to detect `hasMore`
      offset,
    };

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

