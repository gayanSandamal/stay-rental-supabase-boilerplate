import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { landlords } from '@/lib/db/schema';
import { getUser, getUserWithLandlord } from '@/lib/db/queries';
import { isLandlordPremiumOrAbove } from '@/lib/landlord-plans';
import { eq } from 'drizzle-orm';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,29}$/;

const RESERVED_SLUGS = new Set([
  'listings',
  'sign-in',
  'sign-up',
  'dashboard',
  'list-your-property',
  'privacy-policy',
  'terms-of-service',
  'forgot-password',
  'reset-password',
  'terminal',
  'back-office',
  'api',
  'me',
]);

/**
 * PATCH /api/landlords/me/profile-slug
 * Set custom profile slug (Premium+ only, one-time).
 */
export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userWithLandlord = await getUserWithLandlord(user.id);
  const landlord = userWithLandlord?.landlord;
  if (!landlord) {
    return NextResponse.json(
      { error: 'Landlord account required' },
      { status: 403 }
    );
  }

  if (!isLandlordPremiumOrAbove(landlord)) {
    return NextResponse.json(
      { error: 'Custom profile URL is a Premium feature. Upgrade to Premium or above.' },
      { status: 403 }
    );
  }

  if (landlord.profileSlug) {
    return NextResponse.json(
      { error: 'Custom profile URL can only be set once' },
      { status: 400 }
    );
  }

  const body = await request.json();
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';

  if (!slug) {
    return NextResponse.json(
      { error: 'Slug is required' },
      { status: 400 }
    );
  }

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      {
        error:
          'Slug must be 3-30 characters, lowercase letters, numbers, and hyphens only. Must start with a letter or number.',
      },
      { status: 400 }
    );
  }

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: 'This URL is reserved' },
      { status: 400 }
    );
  }

  // Check uniqueness
  const existing = await db.query.landlords.findFirst({
    where: eq(landlords.profileSlug, slug),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'This URL is already taken' },
      { status: 409 }
    );
  }

  const [updated] = await db
    .update(landlords)
    .set({
      profileSlug: slug,
      updatedAt: new Date(),
    })
    .where(eq(landlords.id, landlord.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({
    profileSlug: updated.profileSlug,
    publicId: updated.publicId,
    profileUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk'}/${updated.profileSlug}`,
  });
}

/**
 * GET /api/landlords/me/profile-slug
 * Get current landlord's profile URL info.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userWithLandlord = await getUserWithLandlord(user.id);
  const landlord = userWithLandlord?.landlord;
  if (!landlord) {
    return NextResponse.json(
      { error: 'Landlord account required' },
      { status: 403 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';
  const slug = landlord.profileSlug ?? landlord.publicId;
  const profileUrl = `${baseUrl}/${slug}`;

  return NextResponse.json({
    profileSlug: landlord.profileSlug,
    publicId: landlord.publicId,
    profileUrl,
    canSetCustomSlug:
      isLandlordPremiumOrAbove(landlord) && !landlord.profileSlug,
  });
}
