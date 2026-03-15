import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listingViews } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

/**
 * POST /api/listings/[id]/view
 * Record a view for a listing. Rate-limited by IP to prevent spam.
 * Only track views for active listings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || '127.0.0.1';
  const rl = checkRateLimit(ip, 'POST', '/api/listings/[id]/view');
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  if (isNaN(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  // Verify listing exists and is active
  const { listings } = await import('@/lib/db/schema');
  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, listingId),
    columns: { id: true, status: true },
  });

  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ ok: true }); // Silently ignore
  }

  // Rate limit (30/min per IP) prevents spam. No per-listing dedup for MVP.
  await db.insert(listingViews).values({
    listingId,
    viewedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
