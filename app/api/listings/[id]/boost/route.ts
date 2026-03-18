import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings, landlords } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getIncludedBoostsRemaining } from '@/lib/landlord-plans';
import { logListingAction } from '@/lib/db/audit-logger';
import { eq } from 'drizzle-orm';

const BOOST_DURATION_DAYS = 7;

/**
 * POST /api/listings/[id]/boost
 * Activate boost for a listing. Admin/ops only.
 * Uses included Boost if landlord has paid plan with allowance; otherwise paid activation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'admin' && user.role !== 'ops') {
    return NextResponse.json(
      { error: 'Only admin or ops can activate boosts. Contact support after payment.' },
      { status: 403 }
    );
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  if (isNaN(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, listingId),
    with: { landlord: true },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const boostedUntil = new Date();
  boostedUntil.setDate(boostedUntil.getDate() + BOOST_DURATION_DAYS);

  let usedIncludedBoost = false;
  let remaining = 0;

  const landlord = listing.landlord;
  if (landlord) {
    remaining = getIncludedBoostsRemaining(landlord);
    if (remaining > 0) {
      usedIncludedBoost = true;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const resetAt = landlord.boostsMonthResetAt
        ? new Date(landlord.boostsMonthResetAt)
        : null;

      const needsReset = !resetAt || resetAt < startOfMonth;
      await db
        .update(landlords)
        .set({
          boostsUsedThisMonth: needsReset ? 1 : (landlord.boostsUsedThisMonth ?? 0) + 1,
          boostsMonthResetAt: needsReset ? startOfMonth : resetAt,
          updatedAt: now,
        })
        .where(eq(landlords.id, landlord.id));
      remaining = remaining - 1;
    }
  }

  await db
    .update(listings)
    .set({
      boostedUntil,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId));

  await logListingAction('listing_boost_activated', listingId, user.id, {
    usedIncludedBoost,
    landlordId: landlord?.id,
    remaining,
  });

  return NextResponse.json({
    success: true,
    boostedUntil: boostedUntil.toISOString(),
    usedIncludedBoost,
    remaining,
    message: usedIncludedBoost
      ? `Listing boosted for ${BOOST_DURATION_DAYS} days (used included Boost, ${remaining} remaining this month)`
      : `Listing boosted for ${BOOST_DURATION_DAYS} days`,
  });
}
