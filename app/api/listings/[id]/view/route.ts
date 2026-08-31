import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listingViews } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { visitorHash } from '@/lib/analytics/visitor-hash';

/**
 * POST /api/listings/[id]/view
 * Record a view for a listing. Rate-limited by IP to prevent spam.
 * Only track views for active listings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const ip = getClientIp(request);
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

  /*
   * The rate limit (30/min per IP) bounds abuse; the visitor hash is what makes
   * the resulting number honest. It is sha256(ip + user-agent + salt + today),
   * so it separates "views" from "people" WITHIN a day and cannot follow anyone
   * across days — see lib/analytics/visitor-hash.ts.
   *
   * Every view is still one row. Deduplication happens at read time, so the raw
   * count stays a real count and the two figures can be reported side by side
   * ("120 views from 34 people") instead of one silently replacing the other.
   */
  await db.insert(listingViews).values({
    listingId,
    viewedAt: new Date(),
    visitorHash: visitorHash(ip, request.headers.get('user-agent')),
  });

  return NextResponse.json({ ok: true });
}
