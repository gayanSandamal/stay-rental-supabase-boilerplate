import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';

const BOOST_DURATION_DAYS = 7;

/**
 * POST /api/listings/[id]/boost
 * Activate boost for a listing. MVP: admin/ops only (manual payment confirmation).
 * Sets boostedUntil = now + 7 days.
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
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const boostedUntil = new Date();
  boostedUntil.setDate(boostedUntil.getDate() + BOOST_DURATION_DAYS);

  await db
    .update(listings)
    .set({
      boostedUntil,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId));

  return NextResponse.json({
    success: true,
    boostedUntil: boostedUntil.toISOString(),
    message: `Listing boosted for ${BOOST_DURATION_DAYS} days`,
  });
}
