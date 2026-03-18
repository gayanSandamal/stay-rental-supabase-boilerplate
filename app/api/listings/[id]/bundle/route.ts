import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings, landlords } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { logListingAction } from '@/lib/db/audit-logger';
import { eq, and, ne, sql } from 'drizzle-orm';

const BOOST_DURATION_DAYS = 7;
const FEATURED_DURATION_DAYS = 7;
const URGENT_DURATION_DAYS = 7;
const STARTER_BUNDLE_DAYS = 30;

const BUNDLE_TYPES = ['quick_results', 'priority_exposure', 'starter'] as const;
type BundleType = (typeof BUNDLE_TYPES)[number];

/**
 * POST /api/listings/[id]/bundle
 * Activate a visibility bundle for a listing. Admin/ops only (manual payment confirmation).
 * Bundles: quick_results (LKR 350), priority_exposure (LKR 650), starter (LKR 1,000).
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
      { error: 'Only admin or ops can activate bundles. Contact support after payment.' },
      { status: 403 }
    );
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  if (isNaN(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  let body: { bundle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body. Expected { bundle: "quick_results" | "priority_exposure" | "starter" }' },
      { status: 400 }
    );
  }

  const bundle = body.bundle?.toLowerCase();
  if (!bundle || !BUNDLE_TYPES.includes(bundle as BundleType)) {
    return NextResponse.json(
      {
        error: `Invalid bundle. Use: ${BUNDLE_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, listingId),
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const now = new Date();

  if (bundle === 'quick_results') {
    const boostedUntil = new Date(now);
    boostedUntil.setDate(boostedUntil.getDate() + BOOST_DURATION_DAYS);
    const urgentUntil = new Date(now);
    urgentUntil.setDate(urgentUntil.getDate() + URGENT_DURATION_DAYS);

    await db
      .update(listings)
      .set({
        boostedUntil,
        urgentUntil,
        updatedAt: now,
      })
      .where(eq(listings.id, listingId));

    await logListingAction('listing_bundle_activated', listingId, user.id, { bundle: 'quick_results' });

    return NextResponse.json({
      success: true,
      bundle: 'quick_results',
      boostedUntil: boostedUntil.toISOString(),
      urgentUntil: urgentUntil.toISOString(),
      message: 'Quick Results Pack activated: Boost + Urgent for 7 days',
    });
  }

  if (bundle === 'priority_exposure') {
    // Featured is limited to one listing per landlord
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

    const featuredUntil = new Date(now);
    featuredUntil.setDate(featuredUntil.getDate() + FEATURED_DURATION_DAYS);
    const urgentUntil = new Date(now);
    urgentUntil.setDate(urgentUntil.getDate() + URGENT_DURATION_DAYS);

    await db
      .update(listings)
      .set({
        featured: true,
        featuredAt: now,
        featuredUntil,
        urgentUntil,
        updatedAt: now,
      })
      .where(eq(listings.id, listingId));

    await logListingAction('listing_bundle_activated', listingId, user.id, { bundle: 'priority_exposure' });

    return NextResponse.json({
      success: true,
      bundle: 'priority_exposure',
      featuredUntil: featuredUntil.toISOString(),
      urgentUntil: urgentUntil.toISOString(),
      message: 'Priority Exposure Pack activated: Featured + Urgent for 7 days',
    });
  }

  if (bundle === 'starter') {
    const landlordExpiresAt = new Date(now);
    landlordExpiresAt.setDate(landlordExpiresAt.getDate() + STARTER_BUNDLE_DAYS);
    const boostedUntil = new Date(now);
    boostedUntil.setDate(boostedUntil.getDate() + BOOST_DURATION_DAYS);

    await db
      .update(landlords)
      .set({
        landlordPlanTier: 'starter',
        landlordPlanExpiresAt: landlordExpiresAt,
        updatedAt: now,
      })
      .where(eq(landlords.id, listing.landlordId));

    await db
      .update(listings)
      .set({
        boostedUntil,
        updatedAt: now,
      })
      .where(eq(listings.id, listingId));

    await logListingAction('listing_bundle_activated', listingId, user.id, { bundle: 'starter' });

    return NextResponse.json({
      success: true,
      bundle: 'starter',
      landlordPlanTier: 'starter',
      landlordPlanExpiresAt: landlordExpiresAt.toISOString(),
      boostedUntil: boostedUntil.toISOString(),
      message: 'Landlord Starter Bundle activated: Starter 30 days + Boost for 7 days',
    });
  }

  return NextResponse.json({ error: 'Invalid bundle' }, { status: 400 });
}
