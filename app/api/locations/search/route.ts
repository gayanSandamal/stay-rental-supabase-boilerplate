import { NextRequest, NextResponse } from 'next/server';
import { searchLocations } from '@/lib/locations/store';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Type-ahead for the listing form's town field.
 *
 * Public and unauthenticated on purpose: the catalogue is a published list of
 * Sri Lankan place names, it is needed before a landlord has signed in on the
 * listing flow, and it exposes nothing about users or listings. Rate-limited
 * all the same, since it is an open door to a LIKE query.
 */
export async function GET(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const rl = checkRateLimit(ip, 'GET', '/api/locations/search');
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const q = request.nextUrl.searchParams.get('q') ?? '';
  try {
    const results = await searchLocations(q);
    return NextResponse.json(
      { results },
      {
        // The place list changes when someone reseeds it, so let the CDN and the
        // browser hold each keystroke's answer rather than re-running the query.
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
      }
    );
  } catch (err) {
    console.error('[locations/search] failed', err);
    // An empty list degrades the field to plain free text, which still works.
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
