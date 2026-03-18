import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { logListingAction } from '@/lib/db/audit-logger';
import { eq, and, ne, sql } from 'drizzle-orm';

const FEATURED_DURATION_DAYS = 7;

/**
 * POST /api/listings/[id]/feature
 * Activate Featured for a listing. Admin/ops only (manual payment confirmation).
 * LKR 500 for 7 days. Sets featuredUntil = now + 7 days.
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
      { error: 'Only admin or ops can activate Featured. Contact support after payment.' },
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

  // Featured is limited to one listing per landlord (plan Section 5.1.C)
  const otherFeatured = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.landlordId, listing.landlordId),
        ne(listings.id, listingId),
        sql`${listings.featuredUntil} IS NOT NULL AND ${listings.featuredUntil} > NOW()`
      )
    )
    .limit(1);

  if (otherFeatured.length > 0) {
    return NextResponse.json(
      {
        error:
          'This landlord already has a featured listing. Featured is limited to one listing per landlord.',
      },
      { status: 400 }
    );
  }

  const featuredUntil = new Date();
  featuredUntil.setDate(featuredUntil.getDate() + FEATURED_DURATION_DAYS);

  await db
    .update(listings)
    .set({
      featured: true,
      featuredAt: new Date(),
      featuredUntil,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId));

  await logListingAction('listing_featured_activated', listingId, user.id);

  return NextResponse.json({
    success: true,
    featuredUntil: featuredUntil.toISOString(),
    message: `Listing featured for ${FEATURED_DURATION_DAYS} days`,
  });
}
