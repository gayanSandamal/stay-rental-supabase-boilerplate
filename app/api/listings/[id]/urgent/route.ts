import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { logListingAction } from '@/lib/db/audit-logger';
import { eq } from 'drizzle-orm';

const URGENT_DURATION_DAYS = 7;

/**
 * POST /api/listings/[id]/urgent
 * Activate Urgent badge for a listing. Admin/ops only (manual payment confirmation).
 * LKR 150 for 7 days. Sets urgentUntil = now + 7 days.
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
      { error: 'Only admin or ops can activate Urgent. Contact support after payment.' },
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

  const urgentUntil = new Date();
  urgentUntil.setDate(urgentUntil.getDate() + URGENT_DURATION_DAYS);

  await db
    .update(listings)
    .set({
      urgentUntil,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId));

  await logListingAction('listing_urgent_activated', listingId, user.id);

  return NextResponse.json({
    success: true,
    urgentUntil: urgentUntil.toISOString(),
    message: `Urgent badge active for ${URGENT_DURATION_DAYS} days`,
  });
}
