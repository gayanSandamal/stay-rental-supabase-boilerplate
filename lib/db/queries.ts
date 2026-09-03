import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  IMPERSONATION_COOKIE,
  resolveImpersonation,
} from '@/lib/auth/impersonation';
import { desc, and, eq, isNull, sql, gte, gt, lte, or, like, inArray, lt, count as drizzleCount, getTableColumns } from 'drizzle-orm';
import { db } from './drizzle';
import {
  users,
  listings,
  landlords,
  savedSearches,
  businessAccounts,
  auditLogs,
  listingViews,
  listingContactEvents,
  listingImpressions,
  marketRentSnapshots,
} from './schema';
import { createClient } from '@/lib/supabase/server';
import { businessAccountMembers } from './schema';
import { withDeadline } from '@/lib/observability/phase-timer';
import {
  TREND_TOLERANCE_DAYS,
  TREND_WINDOWS_WEEKS,
  computePercentile,
  computeRentComparison,
  pickMarketTrend,
  type MarketRentTrend,
  type RentComparison,
} from '@/lib/analytics/comparables';

const AUTH_DEADLINE_MS = 10_000;

/**
 * REQUEST-MEMOIZED. `cache()` from React dedupes by argument list for the
 * lifetime of ONE server request, and this function is the most expensive thing
 * in the app to call twice: an HTTPS round trip to Supabase auth (a fresh client
 * per call, see lib/supabase/server.ts) PLUS a DB query on a pool that is
 * `max: 1` in production.
 *
 * It has 64 call sites, and a single page render routinely hit 2-3 of them
 * independently — the root layout, the page body, and a footer or trust-signal
 * component. On a connection where every round trip costs real milliseconds
 * that was the largest avoidable cost in a navigation.
 *
 * `cache()` is per-request, not a shared cache: two different visitors never see
 * each other's user, and nothing is retained between requests. That is exactly
 * the property this needs — the value is derived from the request's own cookies.
 */
export const getUser = cache(async function getUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = await createClient();

  /*
   * Bounded, because this is a network call on EVERY authenticated render and
   * nothing else limits it. An unbounded hang here is invisible: no error, no
   * stack, just a function that never returns until the platform kills it at
   * 300s and the operator sees a blank page. Failing closed (null -> sign-in)
   * is worse than succeeding but far better than hanging, and the log line
   * says which it was.
   */
  let authUser: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'];
  try {
    const result = await withDeadline(
      'supabase.auth.getUser',
      supabase.auth.getUser(),
      AUTH_DEADLINE_MS
    );
    authUser = result.data.user;
  } catch (err) {
    console.error('[getUser] auth lookup failed or timed out:', err);
    return null;
  }

  if (!authUser) {
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.authUserId, authUser.id), isNull(users.deletedAt))
    )
    .limit(1);

  if (!user) {
    return null;
  }

  const self = { ...user, emailVerified: !!authUser.email_confirmed_at };

  /*
   * IMPERSONATION. If this admin holds a live session, every caller from here on
   * sees the SUBJECT — that is the whole point: the 70 call sites of this
   * function are what make the app render as that user.
   *
   * `impersonatedBy` is how anything that needs the truth can still find it, and
   * it is why writes are blocked (middleware for every non-GET,
   * assertNotImpersonating for server actions). Without that block, `logAudit`
   * would record the subject as the actor and the audit trail would contain a
   * false statement.
   *
   * The DB lookup is skipped entirely when the cookie is absent, so ordinary
   * requests — effectively all of them — pay one cookie read and nothing else.
   * That matters on a `max: 1` pool where every extra query is serialised
   * latency.
   */
  const impersonationToken = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (impersonationToken && self.role === 'admin') {
    const ctx = await resolveImpersonation(impersonationToken);
    // Only honour a session this very admin opened. A cookie carried to another
    // admin's browser must do nothing.
    if (ctx && ctx.actor.id === self.id) {
      const [subject] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, ctx.subjectUserId), isNull(users.deletedAt)))
        .limit(1);
      if (subject) {
        return {
          ...subject,
          emailVerified: true,
          impersonatedBy: {
            id: ctx.actor.id,
            name: ctx.actor.name,
            email: ctx.actor.email,
          },
          impersonationExpiresAt: ctx.expiresAt,
        };
      }
    }
  }

  return { ...self, impersonatedBy: null, impersonationExpiresAt: null };
});

export async function getUserWithLandlord(userId: number) {
  const result = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      landlord: true,
    },
  });

  return result;
}
export async function getActiveListings(filters?: {
  // Search & Location
  search?: string;
  city?: string;
  district?: string;
  locationRadius?: string;
  latitude?: number;
  longitude?: number;
  
  // Property Type & Size
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  minArea?: number;
  maxArea?: number;
  
  // Pricing
  minPrice?: number;
  maxPrice?: number;
  depositMonths?: number;
  utilitiesIncluded?: boolean;
  maxServiceCharge?: number;
  
  // Power & Water
  powerBackup?: string;
  waterSource?: string;
  minWaterTankSize?: number;
  
  // Internet
  hasFiber?: boolean;
  fiberISP?: string;
  
  // Climate
  minACUnits?: number;
  minFans?: number;
  ventilation?: string;
  
  // Security
  isGated?: boolean;
  hasGuard?: boolean;
  hasCCTV?: boolean;
  hasBurglarBars?: boolean;
  
  // Parking & Amenities
  parking?: boolean;
  minParkingSpaces?: number;
  petsAllowed?: boolean;
  
  // Lease Terms
  maxNoticePeriod?: number;
  
  // Verification
  verifiedOnly?: boolean;
  visitedOnly?: boolean;

  // Exclusive (premium-only listings)
  excludeExclusive?: boolean; // When true, hide exclusive listings (for free users)
  sortExclusiveFirst?: boolean; // When true, show exclusive listings first (for premium users)
  
  // Sorting
  sortBy?: string;
  
  // Pagination
  limit?: number;
  offset?: number;

  /*
   * Saved-search alerts: the window of listings to consider, by PUBLICATION
   * time, not creation time.
   *
   * This used to be `createdAtSince` against `listings.createdAt`, and it meant
   * alerts silently skipped every listing that spent time in moderation. A
   * listing created Monday and approved Thursday is `active` on Thursday, but
   * its `createdAt` is Monday's — older than the alert cursor — so it was never
   * matched, ever. `publishedAt` is set when a listing is first published and is
   * indexed (migration 0005).
   */
  publishedSince?: Date;
  publishedUntil?: Date;

  // Early access: free users don't see listings newer than X hours (Premium sees all)
  hideNewListingsHours?: number;
}) {
  const conditions = [
    eq(listings.status, 'active'),
    // Exclude expired listings (only show if expiresAt is null or in the future)
    or(
      isNull(listings.expiresAt),
      gte(listings.expiresAt, new Date())
    ),
    
    // Search (FTS when search_vector exists from migration 0009, else LIKE fallback)
    filters?.search
      ? (() => {
          const tokens = filters
            .search!.trim()
            .split(/\s+/)
            .map((t) => t.replace(/\W/g, '') + ':*')
            .filter((t) => t !== ':*');
          const tsQuery = tokens.join(' & ');
          if (tsQuery) {
            return sql`"listings"."search_vector" @@ to_tsquery('simple', ${tsQuery})`;
          }
          return or(
            like(listings.title, `%${filters.search}%`),
            like(listings.address, `%${filters.search}%`),
            like(listings.description, `%${filters.search}%`)
          );
        })()
      : undefined,
    
    // Location
    filters?.city ? eq(listings.city, filters.city) : undefined,
    filters?.district ? like(listings.district, `%${filters.district}%`) : undefined,
    
    // Property Type & Size
    filters?.propertyType ? eq(listings.propertyType, filters.propertyType) : undefined,
    filters?.bedrooms ? eq(listings.bedrooms, filters.bedrooms) : undefined,
    filters?.bathrooms ? eq(listings.bathrooms, filters.bathrooms) : undefined,
    filters?.minArea ? gte(listings.areaSqft, filters.minArea) : undefined,
    filters?.maxArea ? lte(listings.areaSqft, filters.maxArea) : undefined,
    
    // Pricing
    filters?.minPrice ? gte(listings.rentPerMonth, filters.minPrice.toString()) : undefined,
    filters?.maxPrice ? lte(listings.rentPerMonth, filters.maxPrice.toString()) : undefined,
    filters?.depositMonths ? lte(listings.depositMonths, filters.depositMonths) : undefined,
    filters?.utilitiesIncluded !== undefined
      ? eq(listings.utilitiesIncluded, filters.utilitiesIncluded)
      : undefined,
    filters?.maxServiceCharge
      ? lte(listings.serviceCharge, filters.maxServiceCharge.toString())
      : undefined,
    
    // Power & Water
    filters?.powerBackup ? eq(listings.powerBackup, filters.powerBackup) : undefined,
    filters?.waterSource ? eq(listings.waterSource, filters.waterSource) : undefined,
    filters?.minWaterTankSize
      ? gte(listings.waterTankSize, filters.minWaterTankSize)
      : undefined,
    
    // Internet
    filters?.hasFiber !== undefined ? eq(listings.hasFiber, filters.hasFiber) : undefined,
    filters?.fiberISP
      ? like(listings.fiberISPs, `%${filters.fiberISP}%`)
      : undefined,
    
    // Climate
    filters?.minACUnits ? gte(listings.acUnits, filters.minACUnits) : undefined,
    filters?.minFans ? gte(listings.fans, filters.minFans) : undefined,
    filters?.ventilation ? eq(listings.ventilation, filters.ventilation) : undefined,
    
    // Security
    filters?.isGated !== undefined ? eq(listings.isGated, filters.isGated) : undefined,
    filters?.hasGuard !== undefined ? eq(listings.hasGuard, filters.hasGuard) : undefined,
    filters?.hasCCTV !== undefined ? eq(listings.hasCCTV, filters.hasCCTV) : undefined,
    filters?.hasBurglarBars !== undefined
      ? eq(listings.hasBurglarBars, filters.hasBurglarBars)
      : undefined,
    
    // Parking & Amenities
    filters?.parking !== undefined ? eq(listings.parking, filters.parking) : undefined,
    filters?.minParkingSpaces
      ? gte(listings.parkingSpaces, filters.minParkingSpaces)
      : undefined,
    filters?.petsAllowed !== undefined
      ? eq(listings.petsAllowed, filters.petsAllowed)
      : undefined,
    
    // Lease Terms
    filters?.maxNoticePeriod
      ? lte(listings.noticePeriodDays, filters.maxNoticePeriod)
      : undefined,
    
    // Verification
    filters?.verifiedOnly ? eq(listings.verified, true) : undefined,
    filters?.visitedOnly ? eq(listings.visited, true) : undefined,

    // Exclusive: free users cannot see exclusive listings
    filters?.excludeExclusive ? eq(listings.exclusive, false) : undefined,

    // Published window (for saved search alerts). See the note on the params.
    filters?.publishedSince ? gt(listings.publishedAt, filters.publishedSince) : undefined,
    filters?.publishedUntil ? lte(listings.publishedAt, filters.publishedUntil) : undefined,

    /*
     * Early access: free users don't see listings published in the last X hours.
     *
     * Also `publishedAt`, and for the same reason as above: keyed on `createdAt`
     * a listing held three days in moderation counted as three days old the
     * instant it went live, so the perk premium renters pay for did nothing for
     * exactly the listings moderation had delayed.
     */
    filters?.hideNewListingsHours
      ? lte(
          listings.publishedAt,
          new Date(Date.now() - filters.hideNewListingsHours * 60 * 60 * 1000)
        )
      : undefined,
    
    // Location radius (requires lat/lng)
    filters?.locationRadius && filters?.latitude && filters?.longitude
      ? sql`(
          6371 * acos(
            cos(radians(${filters.latitude})) *
            cos(radians(${listings.latitude}::numeric)) *
            cos(radians(${listings.longitude}::numeric) - radians(${filters.longitude})) +
            sin(radians(${filters.latitude})) *
            sin(radians(${listings.latitude}::numeric))
          )
        ) <= ${filters.locationRadius}`
      : undefined,
  ].filter(Boolean);

  // Determine sort order
  // Default: monetization ranking (boosted > plan tier > verified > completeness > newest)
  // Explicit sortBy: user's choice
  let orderByArgs: any[];
  if (filters?.sortBy) {
    let orderByClause;
    switch (filters.sortBy) {
      case 'newest':
        orderByClause = desc(listings.createdAt);
        break;
      case 'oldest':
        orderByClause = listings.createdAt;
        break;
      case 'price_asc':
        orderByClause = listings.rentPerMonth;
        break;
      case 'price_desc':
        orderByClause = desc(listings.rentPerMonth);
        break;
      case 'area_desc':
        orderByClause = desc(listings.areaSqft);
        break;
      case 'area_asc':
        orderByClause = listings.areaSqft;
        break;
      case 'bedrooms_desc':
        orderByClause = desc(listings.bedrooms);
        break;
      case 'bedrooms_asc':
        orderByClause = listings.bedrooms;
        break;
      case 'published_asc':
        /*
         * Oldest-published first. Internal only — not offered in the filter
         * form, and used by the saved-search alert job.
         *
         * The alert window has to be consumed in a deterministic order so the
         * cursor can advance to the last row actually sent and the rest simply
         * wait for the next run. Under the default ranking the survivors of a
         * truncated window are whichever listings paid the most, which would
         * mean telling a renter about the most-boosted homes rather than the
         * ones that arrived.
         */
        orderByClause = listings.publishedAt;
        break;
      default:
        orderByClause = desc(listings.createdAt);
    }
    orderByArgs = filters?.sortExclusiveFirst
      ? [desc(listings.exclusive), orderByClause]
      : [orderByClause];
  } else {
    // Default ranking: Featured > Boost > Plan tier > verified > completeness > newest (Reimagined model)
    orderByArgs = [
      sql`(CASE WHEN ${listings.featuredUntil} IS NOT NULL AND ${listings.featuredUntil} > NOW() THEN 1 ELSE 0 END) DESC`,
      sql`(CASE WHEN ${listings.boostedUntil} IS NOT NULL AND ${listings.boostedUntil} > NOW() THEN 1 ELSE 0 END) DESC`,
      sql`(SELECT CASE COALESCE(l.landlord_plan_tier, 'free') WHEN 'agency' THEN 3 WHEN 'pro' THEN 2 WHEN 'premium' THEN 2 WHEN 'starter' THEN 1 WHEN 'basic' THEN 1 ELSE 0 END FROM landlords l WHERE l.id = ${listings.landlordId}) DESC`,
      sql`(CASE WHEN ${listings.urgentUntil} IS NOT NULL AND ${listings.urgentUntil} > NOW() THEN 1 ELSE 0 END) DESC`,
      desc(listings.verified),
      sql`(CASE WHEN ${listings.photos} IS NOT NULL AND ${listings.photos} != '[]' THEN 1 ELSE 0 END) + (CASE WHEN ${listings.description} IS NOT NULL AND LENGTH(${listings.description}) > 50 THEN 1 ELSE 0 END) DESC`,
      desc(listings.createdAt),
    ];
    if (filters?.sortExclusiveFirst) {
      orderByArgs = [desc(listings.exclusive), ...orderByArgs];
    }
  }

  const listingColumns = getTableColumns(listings);
  let query = db
    .select({
      ...listingColumns,
      landlordPlanTier: landlords.landlordPlanTier,
      landlordPlanExpiresAt: landlords.landlordPlanExpiresAt,
    })
    .from(listings)
    .leftJoin(landlords, eq(listings.landlordId, landlords.id))
    .where(and(...conditions))
    .orderBy(...orderByArgs);

  if (filters?.limit) {
    query = query.limit(filters.limit) as any;
  }
  if (filters?.offset) {
    query = query.offset(filters.offset) as any;
  }

  return await query;
}

/**
 * REQUEST-MEMOIZED, because Next.js calls this twice for one page view.
 *
 * `generateMetadata` and the page component both need the listing, and Next
 * runs them CONCURRENTLY — so `/listings/[id]` fired two identical four-level
 * relational queries at the same moment, on a pool that is `max: 1` in
 * production. That is both a wasted query and precisely the concurrent-use
 * pattern CLAUDE.md warns wedges the transaction pooler.
 */
export const getListingById = cache(async function getListingById(id: number) {
  const result = await db.query.listings.findFirst({
    where: eq(listings.id, id),
    with: {
      landlord: {
        with: {
          user: true,
        },
      },
      contactNumbers: {
        with: {
          contactNumber: {
            with: {
              user: true,
              businessAccount: true,
            },
          },
        },
      },
    },
  });

  return result;
});

/** Count listings toward plan limit: active + pending (excludes rented, archived, rejected, expired). */
/**
 * Platform-wide "N listings, M verified" for the homepage trust strip.
 *
 * ONE aggregate, because the caller needs two integers. TrustSignals used to get
 * them from `getActiveListings({ limit: 1000 })` — up to a thousand full listing
 * rows, every column including `description`, `photos` and `photos_manifest`,
 * pulled through the ranking sort and across the wire, so it could call
 * `.filter(...).length` on them. On the homepage, on every render.
 *
 * The visibility rules are passed in rather than assumed: a free renter must not
 * be counted into exclusive listings they cannot open, and early access has to
 * hide the same rows here that it hides in the grid, or the count contradicts
 * the page.
 */
export async function getPublicListingCounts(opts?: {
  excludeExclusive?: boolean;
  hideNewListingsHours?: number;
}): Promise<{ total: number; verified: number }> {
  const conditions = [
    eq(listings.status, 'active'),
    or(isNull(listings.expiresAt), gte(listings.expiresAt, new Date())),
    opts?.excludeExclusive ? eq(listings.exclusive, false) : undefined,
    // publishedAt, matching getActiveListings — keyed on createdAt a listing
    // held in moderation counts as old the instant it goes live.
    opts?.hideNewListingsHours
      ? lte(
          listings.publishedAt,
          new Date(Date.now() - opts.hideNewListingsHours * 60 * 60 * 1000)
        )
      : undefined,
  ].filter(Boolean);

  const [row] = await db
    .select({
      total: drizzleCount(),
      verified: sql<number>`count(*) FILTER (WHERE ${listings.verified})`,
    })
    .from(listings)
    .where(and(...(conditions as any)));

  return { total: Number(row?.total ?? 0), verified: Number(row?.verified ?? 0) };
}

export async function getActiveListingCountForLandlord(landlordId: number): Promise<number> {
  const result = await db
    .select({ count: drizzleCount() })
    .from(listings)
    .where(
      and(
        eq(listings.landlordId, landlordId),
        inArray(listings.status, ['active', 'pending'])
      )
    );
  return Number(result[0]?.count ?? 0);
}

export async function getListingsForOps(filters?: {
  status?: 'pending' | 'active' | 'rented' | 'archived';
  verified?: boolean;
  limit?: number;
  offset?: number;
  userId?: number; // For filtering by user (landlord or business account member)
  userRole?: string; // User's role to determine filtering logic
}) {
  const conditions: any[] = [];
  
  // Filter by status if provided, otherwise show active, pending, and rejected by default
  if (filters?.status) {
    conditions.push(eq(listings.status, filters.status));
  } else {
    // Default: show active, pending, and rejected listings (not archived or rented)
    conditions.push(inArray(listings.status, ['active', 'pending', 'rejected']));
  }
  
  // Filter by verified if provided
  if (filters?.verified !== undefined) {
    conditions.push(eq(listings.verified, filters.verified));
  }

  // If user is provided and not admin/ops, filter by their listings
  if (filters?.userId && filters?.userRole && filters.userRole !== 'admin' && filters.userRole !== 'ops') {
    const userConditions: any[] = [];
    
    // Check if user is a landlord
    const landlord = await db.query.landlords.findFirst({
      where: eq(landlords.userId, filters.userId),
    });
    
    if (landlord) {
      userConditions.push(eq(listings.landlordId, landlord.id));
    }
    
    // Check if user is a business account member
    const member = await db.query.businessAccountMembers.findFirst({
      where: and(
        eq(businessAccountMembers.userId, filters.userId),
        eq(businessAccountMembers.isActive, true)
      ),
    });
    
    if (member) {
      // Filter by business account ID (if column exists)
      try {
        userConditions.push(eq(listings.businessAccountId, member.businessAccountId));
      } catch (error: any) {
        // Column might not exist yet, skip this condition
        if (!error.message?.includes('does not exist')) {
          throw error;
        }
      }
    }
    
    // Always try to filter by createdBy (if column exists)
    // This covers listings created directly by the user
    try {
      userConditions.push(eq(listings.createdBy, filters.userId));
    } catch (error: any) {
      // Column might not exist yet, skip this condition
      if (!error.message?.includes('does not exist')) {
        throw error;
      }
    }
    
    // If we have user-specific conditions, combine them with OR
    // (listing belongs to user if it matches any of: landlordId, businessAccountId, or createdBy)
    if (userConditions.length > 0) {
      conditions.push(or(...userConditions));
    } else {
      // User has no landlord record and no business account, return empty
      return [];
    }
  }
  // For admin/ops, no additional filtering (show all listings)

  let query = db
    .select({
      id: listings.id,
      landlordId: listings.landlordId,
      title: listings.title,
      description: listings.description,
      status: listings.status,
      address: listings.address,
      city: listings.city,
      district: listings.district,
      latitude: listings.latitude,
      longitude: listings.longitude,
      propertyType: listings.propertyType,
      bedrooms: listings.bedrooms,
      bathrooms: listings.bathrooms,
      areaSqft: listings.areaSqft,
      rentPerMonth: listings.rentPerMonth,
      depositMonths: listings.depositMonths,
      utilitiesIncluded: listings.utilitiesIncluded,
      serviceCharge: listings.serviceCharge,
      powerBackup: listings.powerBackup,
      waterSource: listings.waterSource,
      waterTankSize: listings.waterTankSize,
      hasFiber: listings.hasFiber,
      fiberISPs: listings.fiberISPs,
      acUnits: listings.acUnits,
      fans: listings.fans,
      ventilation: listings.ventilation,
      isGated: listings.isGated,
      hasGuard: listings.hasGuard,
      hasCCTV: listings.hasCCTV,
      hasBurglarBars: listings.hasBurglarBars,
      parking: listings.parking,
      parkingSpaces: listings.parkingSpaces,
      petsAllowed: listings.petsAllowed,
      noticePeriodDays: listings.noticePeriodDays,
      verified: listings.verified,
      verifiedAt: listings.verifiedAt,
      verifiedBy: listings.verifiedBy,
      visited: listings.visited,
      visitedAt: listings.visitedAt,
      visitedBy: listings.visitedBy,
      rejectionReason: listings.rejectionReason,
      rejectedAt: listings.rejectedAt,
      rejectedBy: listings.rejectedBy,
      photos: listings.photos,
      createdAt: listings.createdAt,
      updatedAt: listings.updatedAt,
      lastPingedAt: listings.lastPingedAt,
      createdBy: listings.createdBy,
      businessAccountId: listings.businessAccountId,
      // Join with landlord and user
      landlordUserId: landlords.userId,
      landlordUserName: users.name,
      landlordUserEmail: users.email,
    })
    .from(listings)
    .leftJoin(landlords, eq(listings.landlordId, landlords.id))
    .leftJoin(users, eq(landlords.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(listings.createdAt));

  if (filters?.limit) {
    query = query.limit(filters.limit) as typeof query;
  }
  if (filters?.offset) {
    query = query.offset(filters.offset) as typeof query;
  }

  return await query;
}

export async function getStaleListings(daysSinceUpdate: number = 60) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceUpdate);

  return await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        or(
          sql`${listings.updatedAt} < ${cutoffDate}`,
          sql`${listings.lastPingedAt} < ${cutoffDate}`
        )
      )
    );
}

// Saved searches
export async function getSavedSearchesForUser(userId: number) {
  return await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
}

export async function getSavedSearchCount(userId: number): Promise<number> {
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId));
  return rows.length;
}

// Dashboard stats for ops
export async function getOpsDashboardStats() {
  const activeListings = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(eq(listings.status, 'active'));

  const verifiedListings = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.verified, true)));

  return {
    activeListings: Number(activeListings[0]?.count || 0),
    verifiedListings: Number(verifiedListings[0]?.count || 0),
  };
}

export async function getSimilarListings(
  currentListingId: number,
  city: string,
  bedrooms: number,
  rentPerMonth: number,
  limit: number = 4
) {
  const priceMin = rentPerMonth * 0.7;
  const priceMax = rentPerMonth * 1.3;

  return await db
    .select({
      id: listings.id,
      title: listings.title,
      city: listings.city,
      bedrooms: listings.bedrooms,
      bathrooms: listings.bathrooms,
      rentPerMonth: listings.rentPerMonth,
      photos: listings.photos,
      propertyType: listings.propertyType,
      verified: listings.verified,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        or(isNull(listings.expiresAt), gte(listings.expiresAt, new Date())),
        sql`${listings.id} != ${currentListingId}`,
        or(
          eq(listings.city, city),
          and(
            gte(listings.rentPerMonth, priceMin.toString()),
            lte(listings.rentPerMonth, priceMax.toString())
          ),
          eq(listings.bedrooms, bedrooms)
        )
      )
    )
    .orderBy(
      sql`CASE WHEN ${listings.city} = ${city} THEN 0 ELSE 1 END`,
      desc(listings.createdAt)
    )
    .limit(limit);
}

export async function getAnalyticsDashboardData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Listing counts by status
  const listingsByStatus = await db
    .select({
      status: listings.status,
      count: sql<number>`count(*)`,
    })
    .from(listings)
    .groupBy(listings.status);

  // Listings created in last 30 days
  const monthlyListings = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(gte(listings.createdAt, thirtyDaysAgo));

  // Top cities by listing count
  const topCities = await db
    .select({
      city: listings.city,
      count: sql<number>`count(*)`,
    })
    .from(listings)
    .where(eq(listings.status, 'active'))
    .groupBy(listings.city)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Average rent by city
  const avgRentByCity = await db
    .select({
      city: listings.city,
      avgRent: sql<number>`ROUND(AVG(${listings.rentPerMonth}::numeric))`,
      count: sql<number>`count(*)`,
    })
    .from(listings)
    .where(eq(listings.status, 'active'))
    .groupBy(listings.city)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Listings expiring soon (next 7 days)
  const expiringListings = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        lte(listings.expiresAt, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
        gte(listings.expiresAt, now)
      )
    );

  // Total users
  const totalUsers = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(isNull(users.deletedAt));

  // Verified listings ratio
  const verifiedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.verified, true)));

  const activeCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(eq(listings.status, 'active'));

  return {
    listingsByStatus: listingsByStatus.reduce(
      (acc, item) => {
        acc[item.status] = Number(item.count);
        return acc;
      },
      {} as Record<string, number>
    ),
    monthlyListingsCount: Number(monthlyListings[0]?.count || 0),
    topCities: topCities.map((c) => ({ city: c.city, count: Number(c.count) })),
    avgRentByCity: avgRentByCity.map((c) => ({
      city: c.city,
      avgRent: Number(c.avgRent),
      count: Number(c.count),
    })),
    expiringListingsCount: Number(expiringListings[0]?.count || 0),
    totalUsersCount: Number(totalUsers[0]?.count || 0),
    verifiedListingsCount: Number(verifiedCount[0]?.count || 0),
    activeListingsCount: Number(activeCount[0]?.count || 0),
  };
}

/*
 * Portfolio analytics.
 *
 * These replace the old per-listing `getRentComparisonForListing` and
 * `getListingPerformanceData`. Those were correct but were called from inside a
 * `Promise.all` over the portfolio, so a ten-listing landlord fired ~70 mostly
 * concurrent queries. On Vercel the pool is `max: 1` (lib/db/drizzle.ts) against
 * Supabase's transaction pooler, and pipelining concurrent queries onto that one
 * PgBouncer-backed connection wedges the request until the platform kills it —
 * the same failure commit a3ac4f9 removed from the back office. The agency
 * landlord who hits it hardest is also the one most likely to be paying.
 *
 * They are gone rather than deprecated: a per-listing insight helper sitting in
 * this file is an invitation to reintroduce the fan-out somewhere new.
 */

export type PortfolioListingInput = {
  id: number;
  city: string;
  bedrooms: number;
  rentPerMonth: string | number;
};

export type ListingRentComparison = RentComparison;
export type { MarketRentTrend };

export type ListingInsights = {
  /**
   * Times this listing was served on a results page. A FLOOR, not an exact
   * total: counts buffered in an instance that is recycled before its next
   * flush are lost (lib/analytics/impressions.ts), and nothing was recorded at
   * all before migration 0048.
   */
  impressions: number;
  impressionsLast7d: number;
  totalViews: number;
  viewsLast7d: number;
  /**
   * Distinct daily visitor hashes in the last 7 days, or NULL when part of that
   * window predates migration 0046 and therefore has no hashes. Null means "we
   * cannot say", never "zero": counting only the rows that happen to carry a
   * hash would under-report a historical week as a traffic collapse.
   */
  uniqueViewersLast7d: number | null;
  totalContacts: number;
  contactsLast7d: number;
  callClicks: number;
  whatsappClicks: number;
  /** Null below MIN_COMPARABLES_FOR_RENT — the caller must say why, not hide the row. */
  rentComparison: ListingRentComparison | null;
  /** Null below MIN_COMPARABLES_FOR_PERCENTILE. */
  percentile: number | null;
  /** Active listings in the same (city, bedrooms) market, excluding this one. */
  comparableCount: number;
  /**
   * How this listing's market has moved since an earlier weekly snapshot, or
   * null while there is not yet enough history. Silence here is the normal
   * state for the first couple of months after migration 0047 lands.
   */
  marketTrend: MarketRentTrend | null;
};

/**
 * Every insight the analytics page renders, for a whole portfolio, in FIVE
 * queries — the same five whether the landlord has one listing or two hundred.
 *
 * Dates are bound through Drizzle's own operators even inside the raw `sql`
 * FILTER fragments (`${gte(col, date)}` rather than an interpolated string), so
 * the driver gets a real bind parameter and nothing depends on the session
 * timezone or on remembering a `::timestamp` cast.
 */
export async function getPortfolioInsights(
  portfolioListings: PortfolioListingInput[]
): Promise<Map<number, ListingInsights>> {
  const insights = new Map<number, ListingInsights>();
  if (portfolioListings.length === 0) return insights;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ids = portfolioListings.map((l) => l.id);

  // 1 — views, one grouped aggregate for the whole portfolio.
  const viewRows = await db
    .select({
      listingId: listingViews.listingId,
      total: drizzleCount(),
      last7d: sql<number>`count(*) filter (where ${gte(listingViews.viewedAt, sevenDaysAgo)})`,
      unique7d: sql<number>`count(distinct ${listingViews.visitorHash}) filter (where ${gte(
        listingViews.viewedAt,
        sevenDaysAgo
      )})`,
      // Views in the window with no hash at all. Non-zero means the window
      // straddles the deploy, so `unique7d` is not a number we may show.
      untracked7d: sql<number>`count(*) filter (where ${gte(
        listingViews.viewedAt,
        sevenDaysAgo
      )} and ${listingViews.visitorHash} is null)`,
    })
    .from(listingViews)
    .where(inArray(listingViews.listingId, ids))
    .groupBy(listingViews.listingId);

  // 2 — impressions, from the daily rollup (migration 0048).
  const impressionRows = await db
    .select({
      listingId: listingImpressions.listingId,
      total: sql<number>`sum(${listingImpressions.count})`,
      last7d: sql<number>`sum(${listingImpressions.count}) filter (where ${gte(
        listingImpressions.day,
        sevenDaysAgo.toISOString().slice(0, 10)
      )})`,
    })
    .from(listingImpressions)
    .where(inArray(listingImpressions.listingId, ids))
    .groupBy(listingImpressions.listingId);

  // 3 — contact clicks, same shape.
  const contactRows = await db
    .select({
      listingId: listingContactEvents.listingId,
      total: drizzleCount(),
      last7d: sql<number>`count(*) filter (where ${gte(
        listingContactEvents.occurredAt,
        sevenDaysAgo
      )})`,
      calls: sql<number>`count(*) filter (where ${listingContactEvents.channel} = ${'call'})`,
      whatsapps: sql<number>`count(*) filter (where ${listingContactEvents.channel} = ${'whatsapp'})`,
    })
    .from(listingContactEvents)
    .where(inArray(listingContactEvents.listingId, ids))
    .groupBy(listingContactEvents.listingId);

  // 4 — the comparable market: every active listing sharing a (city, bedrooms)
  // pair with something in this portfolio, with its own view count. One query
  // serves BOTH the rent comparison and the percentile, because both are
  // computed over exactly this row set.
  const pairs = new Map<string, { city: string; bedrooms: number }>();
  for (const listing of portfolioListings) {
    pairs.set(`${listing.city}|${listing.bedrooms}`, {
      city: listing.city,
      bedrooms: listing.bedrooms,
    });
  }
  const pairPredicates = [...pairs.values()].map((pair) =>
    and(eq(listings.city, pair.city), eq(listings.bedrooms, pair.bedrooms))
  );

  const comparableRows = await db
    .select({
      id: listings.id,
      city: listings.city,
      bedrooms: listings.bedrooms,
      rentPerMonth: listings.rentPerMonth,
      views: sql<number>`count(${listingViews.id})`,
    })
    .from(listings)
    .leftJoin(listingViews, eq(listingViews.listingId, listings.id))
    .where(
      and(
        eq(listings.status, 'active'),
        or(isNull(listings.expiresAt), gte(listings.expiresAt, now)),
        or(...pairPredicates)
      )
    )
    .groupBy(listings.id, listings.city, listings.bedrooms, listings.rentPerMonth);

  /*
   * 5 — the weekly market history for those same pairs (migration 0047).
   *
   * Bounded by one row per market per week, so ~13 rows per pair. The trend is
   * chosen in memory rather than with a lateral join per listing, for the same
   * reason as everything else here: a fixed number of round trips.
   */
  const trendHorizon = new Date(now.getTime() - (Math.max(...TREND_WINDOWS_WEEKS) * 7 + TREND_TOLERANCE_DAYS) * 24 * 60 * 60 * 1000);
  const snapshotRows = await db
    .select({
      city: marketRentSnapshots.city,
      bedrooms: marketRentSnapshots.bedrooms,
      avgRent: marketRentSnapshots.avgRent,
      sampleSize: marketRentSnapshots.sampleSize,
      capturedOn: marketRentSnapshots.capturedOn,
    })
    .from(marketRentSnapshots)
    .where(
      and(
        gte(marketRentSnapshots.capturedOn, trendHorizon.toISOString().slice(0, 10)),
        or(
          ...[...pairs.values()].map((pair) =>
            and(
              eq(marketRentSnapshots.city, pair.city),
              eq(marketRentSnapshots.bedrooms, pair.bedrooms)
            )
          )
        )
      )
    )
    .orderBy(desc(marketRentSnapshots.capturedOn));

  const snapshotsByPair = new Map<string, typeof snapshotRows>();
  for (const row of snapshotRows) {
    const key = `${row.city}|${row.bedrooms}`;
    const bucket = snapshotsByPair.get(key);
    if (bucket) bucket.push(row);
    else snapshotsByPair.set(key, [row]);
  }

  const viewsById = new Map(viewRows.map((r) => [r.listingId, r]));
  const impressionsById = new Map(impressionRows.map((r) => [r.listingId, r]));
  const contactsById = new Map(contactRows.map((r) => [r.listingId, r]));
  const comparablesByPair = new Map<string, typeof comparableRows>();
  for (const row of comparableRows) {
    const key = `${row.city}|${row.bedrooms}`;
    const bucket = comparablesByPair.get(key);
    if (bucket) bucket.push(row);
    else comparablesByPair.set(key, [row]);
  }

  for (const listing of portfolioListings) {
    const views = viewsById.get(listing.id);
    const contacts = contactsById.get(listing.id);
    const impressions = impressionsById.get(listing.id);
    const totalViews = Number(views?.total ?? 0);
    const viewsLast7d = Number(views?.last7d ?? 0);
    const untracked7d = Number(views?.untracked7d ?? 0);

    const market = comparablesByPair.get(`${listing.city}|${listing.bedrooms}`) ?? [];
    const others = market.filter((row) => row.id !== listing.id);
    const rents = others.map((row) => Number(row.rentPerMonth));
    const yourRent = Number(listing.rentPerMonth);

    // Both of these return null below their sample-size floor. That decision is
    // pure and lives in lib/analytics/comparables.ts, so the boundary is
    // testable without a database and there is ONE threshold, not three.
    const rentComparison = computeRentComparison(yourRent, rents);
    const percentile = computePercentile(
      totalViews,
      market.map((row) => Number(row.views))
    );

    const pairKey = `${listing.city}|${listing.bedrooms}`;
    insights.set(listing.id, {
      impressions: Number(impressions?.total ?? 0),
      impressionsLast7d: Number(impressions?.last7d ?? 0),
      totalViews,
      viewsLast7d,
      uniqueViewersLast7d: untracked7d > 0 ? null : Number(views?.unique7d ?? 0),
      totalContacts: Number(contacts?.total ?? 0),
      contactsLast7d: Number(contacts?.last7d ?? 0),
      callClicks: Number(contacts?.calls ?? 0),
      whatsappClicks: Number(contacts?.whatsapps ?? 0),
      rentComparison,
      percentile,
      comparableCount: others.length,
      marketTrend: pickMarketTrend(snapshotsByPair.get(pairKey) ?? [], now),
    });
  }

  return insights;
}

export type DailyViewBucket = { day: string; count: number };

/**
 * Daily view counts for a set of listings over the last `days` days — ONE
 * grouped query for a whole page of listing cards.
 *
 * This is the free-tier sparkline's only data source. It exists as its own
 * function precisely so nobody reaches for a per-card insight call: that is
 * defect D2 in a new place.
 *
 * Days with no views are absent from the result; the renderer fills the gaps,
 * because a sparkline that skips empty days draws a flat line over a dead week.
 */
export async function getDailyViewCounts(
  listingIds: number[],
  days = 30
): Promise<Map<number, DailyViewBucket[]>> {
  const byListing = new Map<number, DailyViewBucket[]>();
  if (listingIds.length === 0) return byListing;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      listingId: listingViews.listingId,
      // Rendered as text rather than a date so the key is a stable string on
      // both sides of the driver, whatever the session timezone.
      day: sql<string>`to_char(date_trunc('day', ${listingViews.viewedAt}), 'YYYY-MM-DD')`,
      count: drizzleCount(),
    })
    .from(listingViews)
    .where(and(inArray(listingViews.listingId, listingIds), gte(listingViews.viewedAt, since)))
    .groupBy(listingViews.listingId, sql`date_trunc('day', ${listingViews.viewedAt})`);

  for (const row of rows) {
    const bucket = byListing.get(row.listingId);
    const entry = { day: row.day, count: Number(row.count) };
    if (bucket) bucket.push(entry);
    else byListing.set(row.listingId, [entry]);
  }
  return byListing;
}

/** Portfolio data for a landlord: listings with rent comparison and performance. */
export async function getLandlordPortfolioData(landlordId: number) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const landlordListings = await db
    .select()
    .from(listings)
    .where(eq(listings.landlordId, landlordId))
    .orderBy(desc(listings.createdAt));

  const [byStatus, expiringListings] = await Promise.all([
    db
      .select({ status: listings.status, count: drizzleCount() })
      .from(listings)
      .where(eq(listings.landlordId, landlordId))
      .groupBy(listings.status),
    db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.landlordId, landlordId),
          eq(listings.status, 'active'),
          lte(listings.expiresAt, expiringSoon),
          gte(listings.expiresAt, now)
        )
      ),
  ]);

  const statusCounts = byStatus.reduce((acc, r) => {
    acc[r.status] = Number(r.count);
    return acc;
  }, {} as Record<string, number>);

  return {
    listings: landlordListings,
    total: landlordListings.length,
    active: statusCounts['active'] ?? 0,
    pending: statusCounts['pending'] ?? 0,
    expiringSoon: expiringListings.length,
    expiringListingIds: expiringListings.map((r) => r.id),
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve landlord by profile slug (custom URL) or publicId (UUID). Returns landlord with user and active listings. */
/** Request-memoized for the same reason as getListingById: the public profile
 *  page resolves the same slug in `generateMetadata` and again in the body. */
export const getLandlordByProfileSlugOrPublicId = cache(async function getLandlordByProfileSlugOrPublicId(
  slug: string
) {
  const isUuid = UUID_REGEX.test(slug);
  const landlord = await db.query.landlords.findFirst({
    where: isUuid ? eq(landlords.publicId, slug) : eq(landlords.profileSlug, slug),
    with: {
      user: true,
      listings: {
        where: and(
          eq(listings.status, 'active'),
          or(isNull(listings.expiresAt), gte(listings.expiresAt, new Date()))
        ),
        orderBy: desc(listings.createdAt),
      },
    },
  });
  return landlord;
});

export async function getRecentAuditLogs(limit: number = 20) {
  try {
    return await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        userId: auditLogs.userId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getBusinessAccountByUserId(userId: number) {
  const member = await db.query.businessAccountMembers.findFirst({
    where: and(
      eq(businessAccountMembers.userId, userId),
      eq(businessAccountMembers.isActive, true)
    ),
    with: {
      businessAccount: true,
    },
  });

  return member?.businessAccount || null;
}

export async function getUserBusinessAccount(userId: number) {
  return await getBusinessAccountByUserId(userId);
}

export async function getListingsByBusinessAccount(businessAccountId: number) {
  // Check if column exists by trying a simple query first
  try {
    return await db.query.listings.findMany({
      where: eq(listings.businessAccountId, businessAccountId),
      with: {
        creator: true,
        landlord: {
          with: {
            user: true,
          },
        },
      },
      orderBy: desc(listings.createdAt),
    });
  } catch (error: any) {
    // If column doesn't exist yet, return empty array
    if (error.message?.includes('does not exist') || error.message?.includes('column')) {
      console.warn('business_account_id column does not exist yet. Please run migrations.');
      return [];
    }
    throw error;
  }
}

export async function getListingsByCreator(userId: number) {
  // Check if column exists by trying a simple query first
  try {
    return await db.query.listings.findMany({
      where: eq(listings.createdBy, userId),
      with: {
        businessAccount: true,
        landlord: {
          with: {
            user: true,
          },
        },
      },
      orderBy: desc(listings.createdAt),
    });
  } catch (error: any) {
    // If column doesn't exist yet, return empty array
    if (error.message?.includes('does not exist') || error.message?.includes('column')) {
      console.warn('created_by column does not exist yet. Please run migrations.');
      return [];
    }
    throw error;
  }
}
