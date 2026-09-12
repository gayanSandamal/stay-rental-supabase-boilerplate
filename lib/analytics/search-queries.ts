import 'server-only';
import { NextRequest, after } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { searchQueries } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { visitorHash } from '@/lib/analytics/visitor-hash';

/**
 * Demand instrumentation — the Phase 3 blocker named throughout the broker
 * pivot docs (_bmad-output/planning-artifacts/broker-pivot/): "the product
 * cannot answer what renters typed, or which queries returned zero results."
 * Zero-result search is the single highest-signal input for which supply to
 * onboard first, and until this, nothing captured it — search suggestions
 * are derived from existing listings (supply), never from what was searched.
 *
 * One row per genuine new search (caller only invokes this for page 1 — see
 * app/api/listings/paginated/route.ts). Deferred via `after()`, same pattern
 * as impressions/contact-events, so it never adds to the response time of
 * the most-hit search endpoint in the app.
 */
export function logSearchQuery(input: {
  searchParams: URLSearchParams;
  resultCount: number;
  request: NextRequest;
}): void {
  if (!isFeatureEnabled('trackSearchQueries')) return;

  const { searchParams, resultCount, request } = input;
  // Snapshot now — the request/searchParams object may not survive into the
  // deferred after() callback on every runtime.
  const queryParams = JSON.stringify(Object.fromEntries(searchParams.entries()));
  const city = searchParams.get('city') || null;
  const bedroomsRaw = searchParams.get('bedrooms');
  const bedrooms = bedroomsRaw ? Number(bedroomsRaw) || null : null;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const ua = request.headers.get('user-agent');
  const hash = visitorHash(ip, ua);

  after(async () => {
    try {
      await db.insert(searchQueries).values({
        queryParams,
        city,
        bedrooms,
        resultCount,
        visitorHash: hash,
      });
    } catch (error) {
      console.error('[search-queries] log failed', error);
    }
  });
}
