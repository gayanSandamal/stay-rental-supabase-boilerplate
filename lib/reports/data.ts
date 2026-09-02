/**
 * The numbers behind a landlord's performance report.
 *
 * TWO QUERIES PER LANDLORD, NEVER MORE, AND NEVER CONCURRENT.
 *
 * On Vercel the pool is `max: 1` against Supabase's transaction pooler, so
 * pipelining concurrent queries onto that single PgBouncer-backed connection
 * wedges the request until the platform kills it (see commit a3ac4f9). A report
 * job iterating hundreds of landlords is the worst possible place to relearn
 * that, so the per-listing figures come from ONE grouped FILTER aggregate
 * rather than a query per listing, and the caller awaits each landlord in turn.
 *
 * The dashboard's own analytics page does NOT yet follow this rule — it fans
 * out `Promise.all` over two queries per listing. That is a latent instance of
 * the same wedge, noted here because the fix belongs with the page, not here.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, listingViews } from '@/lib/db/schema';
import type { ReportPeriod } from './period';

/**
 * A timestamp usable inside a RAW `sql` fragment.
 *
 * Drizzle's own operators (`eq`, `lte`, …) know the column type and bind a JS
 * Date correctly. A hand-written `sql` fragment does not: postgres.js is handed
 * an untyped parameter and throws "the string argument must be of type string
 * … received an instance of Date" at bind time — at RUNTIME, from inside the
 * driver, with nothing in the type system to catch it. The FILTER aggregates
 * below have to be raw, so every Date crossing into one goes through here.
 *
 * The columns are `timestamp` (no zone) and drizzle writes UTC wall-clock into
 * them, so an ISO string cast to `timestamp` — Postgres ignores the trailing Z —
 * compares against exactly the same instant.
 */
function ts(value: Date) {
  return sql`${value.toISOString()}::timestamp`;
}

export interface ReportListingRow {
  id: number;
  title: string;
  status: string;
  city: string;
  bedrooms: number;
  rentPerMonth: number;
  expiresAt: Date | null;
  views: number;
  previousViews: number;
}

export interface LandlordReportData {
  listings: ReportListingRow[];
  totalListings: number;
  activeListings: number;
  totalViews: number;
  previousViews: number;
  /** Percentage change vs the previous window, or null when there is no baseline. */
  changePct: number | null;
  /** Best performer in the window — the one line a landlord actually reads. */
  topListing: ReportListingRow | null;
  /** Active listings that got nothing at all. The actionable number. */
  zeroViewActive: number;
  /** Active listings expiring within 7 days — the single highest-value nudge. */
  expiringSoon: number;
  expiredListings: number;
}

/**
 * Views are counted against the period the join is bounded to, so the whole
 * back catalogue of `listing_views` never enters the aggregate — only the two
 * windows being compared.
 */
export async function getLandlordReportData(
  landlordId: number,
  period: ReportPeriod,
  now: Date = new Date()
): Promise<LandlordReportData> {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      status: listings.status,
      city: listings.city,
      bedrooms: listings.bedrooms,
      rentPerMonth: listings.rentPerMonth,
      expiresAt: listings.expiresAt,
      views: sql<number>`count(${listingViews.id}) filter (where ${listingViews.viewedAt} > ${ts(period.start)} and ${listingViews.viewedAt} <= ${ts(period.end)})`,
      previousViews: sql<number>`count(${listingViews.id}) filter (where ${listingViews.viewedAt} > ${ts(period.previousStart)} and ${listingViews.viewedAt} <= ${ts(period.start)})`,
    })
    .from(listings)
    .leftJoin(
      listingViews,
      and(
        eq(listingViews.listingId, listings.id),
        sql`${listingViews.viewedAt} > ${ts(period.previousStart)}`,
        sql`${listingViews.viewedAt} <= ${ts(period.end)}`
      )
    )
    .where(eq(listings.landlordId, landlordId))
    .groupBy(
      listings.id,
      listings.title,
      listings.status,
      listings.city,
      listings.bedrooms,
      listings.rentPerMonth,
      listings.expiresAt
    );

  const all: ReportListingRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    city: r.city,
    bedrooms: r.bedrooms,
    rentPerMonth: Number(r.rentPerMonth),
    expiresAt: r.expiresAt,
    views: Number(r.views ?? 0),
    previousViews: Number(r.previousViews ?? 0),
  }));

  const active = all.filter((l) => l.status === 'active');
  const totalViews = all.reduce((sum, l) => sum + l.views, 0);
  const previousViews = all.reduce((sum, l) => sum + l.previousViews, 0);

  const expiringCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    listings: all,
    totalListings: all.length,
    activeListings: active.length,
    totalViews,
    previousViews,
    // No baseline is not the same as "no change". A first report claiming
    // "0% vs last week" invents a week that was never measured.
    changePct:
      previousViews > 0
        ? Math.round(((totalViews - previousViews) / previousViews) * 100)
        : null,
    topListing:
      active.length > 0
        ? [...active].sort((a, b) => b.views - a.views)[0]
        : null,
    zeroViewActive: active.filter((l) => l.views === 0).length,
    expiringSoon: active.filter(
      (l) => l.expiresAt !== null && l.expiresAt > now && l.expiresAt <= expiringCutoff
    ).length,
    expiredListings: all.filter((l) => l.status === 'expired').length,
  };
}

/**
 * Average rent of comparable ACTIVE listings — same city, same bedroom count,
 * excluding the listing itself.
 *
 * Deliberately an SQL `avg` rather than a reuse of `getRentComparisonForListing`,
 * which pulls every comparable row into JS to compute the same number. In a
 * report loop that difference is the whole market's rent column, per landlord,
 * per run.
 *
 * Returns null when there is nothing to compare against — a "market average"
 * drawn from two listings is noise dressed as insight, so the caller drops the
 * pricing nudge entirely rather than printing a weak one.
 */
const MIN_COMPARABLES_FOR_PRICING_NUDGE = 3;

export async function getMarketAvgRent(
  listing: Pick<ReportListingRow, 'id' | 'city' | 'bedrooms'>,
  now: Date = new Date()
): Promise<number | null> {
  const [row] = await db
    .select({
      avgRent: sql<number | null>`avg(${listings.rentPerMonth})`,
      comparables: sql<number>`count(*)`,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        eq(listings.city, listing.city),
        eq(listings.bedrooms, listing.bedrooms),
        sql`${listings.id} <> ${listing.id}`,
        sql`(${listings.expiresAt} is null or ${listings.expiresAt} >= ${ts(now)})`
      )
    );

  if (!row || Number(row.comparables ?? 0) < MIN_COMPARABLES_FOR_PRICING_NUDGE) return null;
  const avg = row.avgRent === null ? null : Number(row.avgRent);
  return avg && Number.isFinite(avg) ? Math.round(avg) : null;
}
