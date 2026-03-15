import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser, getUserWithLandlord } from '@/lib/db/queries';
import { getLandlordPlanTier } from '@/lib/landlord-plans';
import { eq, and, lte, gte } from 'drizzle-orm';

/**
 * POST /api/listings/bulk-renew
 * Renew expiring listings (extend expiresAt by 30 days). Agency only.
 * Body: { listingIds: number[] }
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userWithLandlord = await getUserWithLandlord(user.id);
  const landlord = userWithLandlord?.landlord;
  const tier = landlord ? getLandlordPlanTier(landlord) : 'free';

  if (tier !== 'agency') {
    return NextResponse.json(
      { error: 'Bulk renew is available for Agency plan only.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const listingIds = body.listingIds;
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return NextResponse.json({ error: 'listingIds array required' }, { status: 400 });
  }

  const now = new Date();
  const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const newExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let renewed = 0;
  for (const id of listingIds) {
    const listingId = Number(id);
    if (isNaN(listingId)) continue;

    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      with: { landlord: true },
    });

    if (
      !listing ||
      listing.landlordId !== landlord!.id ||
      listing.status !== 'active' ||
      !listing.expiresAt ||
      listing.expiresAt > expiringSoon ||
      listing.expiresAt < now
    ) {
      continue;
    }

    await db
      .update(listings)
      .set({ expiresAt: newExpires, updatedAt: now })
      .where(eq(listings.id, listingId));
    renewed++;
  }

  return NextResponse.json({ renewed, message: `Renewed ${renewed} listing(s)` });
}
