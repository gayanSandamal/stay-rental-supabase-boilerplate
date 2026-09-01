import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, marketRentSnapshots } from '@/lib/db/schema';
import { loadFeatureFlags, } from '@/lib/feature-flags-store';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { MIN_COMPARABLES_FOR_RENT } from '@/lib/analytics/comparables';

/**
 * Weekly market reading: one row per (city, bedrooms) with enough active
 * listings to mean anything.
 *
 * The value of this job is entirely in its history, and history cannot be
 * backfilled — which is why it runs long before anything reads it. After ~8
 * weeks the analytics page can say "3BR homes in Nugegoda are up 8% since June
 * and your rent hasn't moved", a claim the live comparison can never make.
 *
 * ONE grouped query and ONE multi-row upsert, whatever the size of the market.
 * Secured by CRON_SECRET and fails closed, like every other job here.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableMarketRentSnapshots')) {
    return NextResponse.json({ ok: true, skipped: 'flag off' });
  }

  const now = new Date();

  /*
   * The same population the live rent comparison uses: active, unexpired. The
   * HAVING clause applies MIN_COMPARABLES_FOR_RENT at capture time, so a market
   * too thin to average never gets a row — a reader should not have to know to
   * distrust one.
   */
  const rows = await db
    .select({
      city: listings.city,
      bedrooms: listings.bedrooms,
      sampleSize: sql<number>`count(*)`,
      avgRent: sql<number>`round(avg(${listings.rentPerMonth}))`,
      medianRent: sql<number>`round(percentile_cont(0.5) within group (order by ${listings.rentPerMonth}))`,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        or(isNull(listings.expiresAt), gte(listings.expiresAt, now))
      )
    )
    .groupBy(listings.city, listings.bedrooms)
    .having(sql`count(*) >= ${MIN_COMPARABLES_FOR_RENT}`);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, markets: 0 });
  }

  const capturedOn = now.toISOString().slice(0, 10);

  /*
   * Upsert rather than insert. A re-run on the same day — a retry, a manual
   * kick, an overlapping schedule — must correct that day's reading, never add
   * a second one: two rows for one day would silently double the sample the
   * trend is computed from.
   */
  await db
    .insert(marketRentSnapshots)
    .values(
      rows.map((row) => ({
        city: row.city,
        bedrooms: row.bedrooms,
        avgRent: Number(row.avgRent),
        medianRent: row.medianRent === null ? null : Number(row.medianRent),
        sampleSize: Number(row.sampleSize),
        capturedOn,
      }))
    )
    .onConflictDoUpdate({
      target: [
        marketRentSnapshots.city,
        marketRentSnapshots.bedrooms,
        marketRentSnapshots.capturedOn,
      ],
      set: {
        avgRent: sql`excluded.avg_rent`,
        medianRent: sql`excluded.median_rent`,
        sampleSize: sql`excluded.sample_size`,
      },
    });

  return NextResponse.json({ ok: true, markets: rows.length, capturedOn });
}
