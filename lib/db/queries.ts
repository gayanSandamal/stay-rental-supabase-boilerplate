import { desc, and, eq, isNull, sql, gte, lte, or, like, inArray, lt, count as drizzleCount } from 'drizzle-orm';
import { db } from './drizzle';
import {
  users,
  listings,
  landlords,
  savedSearches,
  businessAccounts,
  auditLogs,
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { businessAccountMembers } from './schema';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getUserWithLandlord(userId: number) {
  const result = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      landlord: true,
    },
  });

  return result;
}

// Listings queries
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

  // For saved search alerts: only listings created after this date
  createdAtSince?: Date;
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

    // Created since (for saved search alerts)
    filters?.createdAtSince ? gte(listings.createdAt, filters.createdAtSince) : undefined,
    
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
  let orderByClause;
  if (filters?.sortBy) {
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
      default:
        orderByClause = desc(listings.createdAt);
    }
  } else {
    orderByClause = desc(listings.createdAt);
  }

  // Build query with all clauses at once
  const orderByArgs = filters?.sortExclusiveFirst
    ? [desc(listings.exclusive), orderByClause]
    : [orderByClause];

  let query = db
    .select()
    .from(listings)
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

export async function getListingById(id: number) {
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
