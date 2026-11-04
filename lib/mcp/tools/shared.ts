import { z } from 'zod';
import { and, eq, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, landlords, listings } from '@/lib/db/schema';
import type { User } from '@/lib/db/schema';
import { parsePhotos } from '@/lib/images/manifest';
import { ToolError } from '../types';

/* ------------------------------------------------------------------------- */
/* Vocabularies — the exact values the listing form writes                     */
/* ------------------------------------------------------------------------- */

export const PROPERTY_TYPES = ['house', 'apartment', 'room'] as const;
export const POWER_BACKUP = ['generator', 'solar', 'ups'] as const;
export const WATER_SOURCES = ['mains', 'tank', 'borehole', 'mains_tank', 'mains_borehole'] as const;
export const VENTILATION = ['excellent', 'good', 'fair', 'poor'] as const;
export const SORTS = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'area_desc',
  'area_asc',
  'bedrooms_desc',
  'bedrooms_asc',
] as const;

const id = (what: string) => z.number().int().min(1).describe(`The ${what} id`);
export const listingIdArg = id('listing');

/**
 * The renter-side filters, shared by search_listings and create_saved_search so
 * a saved alert means exactly what the search meant. Names are the tool's own;
 * `toFilterParams` maps them onto lib/listings/filter-params.ts param names.
 */
export const searchFilterShape = {
  query: z.string().max(100).optional().describe('Free-text search over title, address and description, or a reference code like "EZR123"'),
  city: z.string().max(100).optional().describe('Town or city, e.g. "Colombo", "Nugegoda", "Kandy". Use search_locations if unsure of the spelling'),
  district: z.string().max(100).optional().describe('District, e.g. "Colombo", "Gampaha", "Kandy"'),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  bedrooms: z.number().int().min(1).max(20).optional().describe('Exact number of bedrooms'),
  bathrooms: z.number().int().min(1).max(20).optional().describe('Exact number of bathrooms'),
  minRent: z.number().int().min(1).optional().describe('Minimum monthly rent in LKR'),
  maxRent: z.number().int().min(1).optional().describe('Maximum monthly rent in LKR'),
  maxDepositMonths: z.number().int().min(1).max(24).optional().describe('Largest acceptable deposit, in months of rent'),
  utilitiesIncluded: z.boolean().optional().describe('true = only listings whose rent includes utilities'),
  powerBackup: z.enum(POWER_BACKUP).optional().describe('Required power backup during outages'),
  waterSource: z.enum(WATER_SOURCES).optional(),
  hasFiber: z.boolean().optional().describe('true = only listings with fibre internet'),
  parking: z.boolean().optional().describe('true = only listings with parking'),
  petsAllowed: z.boolean().optional().describe('true = only pet-friendly listings'),
  gated: z.boolean().optional().describe('true = only gated properties'),
  securityGuard: z.boolean().optional().describe('true = only properties with a guard'),
  cctv: z.boolean().optional().describe('true = only properties with CCTV'),
  minACUnits: z.number().int().min(1).max(20).optional(),
  maxNoticePeriodDays: z.number().int().min(1).max(365).optional(),
  verifiedOnly: z.boolean().optional().describe('true = only listings Easy Rent has verified'),
  temporaryOnly: z.boolean().optional().describe('true = only landlord-declared temporary (shorter) rentals'),
};

export type SearchFilters = {
  [K in keyof typeof searchFilterShape]?: z.infer<(typeof searchFilterShape)[K]>;
};

/**
 * Tool filters → the URL param names parseListingFilters understands. Booleans
 * are emitted ONLY when true: that module treats anything but 'true' as unset,
 * and `false` must mean "don't care", never "must be absent".
 */
export function toFilterParams(f: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== '') out[k] = String(v);
  };
  const flag = (k: string, v: boolean | undefined) => {
    if (v === true) out[k] = 'true';
  };
  set('search', f.query?.trim());
  set('city', f.city?.trim());
  set('district', f.district?.trim());
  set('propertyType', f.propertyType);
  set('bedrooms', f.bedrooms);
  set('bathrooms', f.bathrooms);
  set('minPrice', f.minRent);
  set('maxPrice', f.maxRent);
  set('depositMonths', f.maxDepositMonths);
  flag('utilitiesIncluded', f.utilitiesIncluded);
  set('powerBackup', f.powerBackup);
  set('waterSource', f.waterSource);
  flag('hasFiber', f.hasFiber);
  flag('parking', f.parking);
  flag('petsAllowed', f.petsAllowed);
  flag('isGated', f.gated);
  flag('hasGuard', f.securityGuard);
  flag('hasCCTV', f.cctv);
  set('minACUnits', f.minACUnits);
  set('maxNoticePeriod', f.maxNoticePeriodDays);
  flag('verifiedOnly', f.verifiedOnly);
  flag('isTemporary', f.temporaryOnly);
  return out;
}

/* ------------------------------------------------------------------------- */
/* Presentation                                                                */
/* ------------------------------------------------------------------------- */

export function listingUrl(origin: string, listingId: number): string {
  return `${origin}/listings/${listingId}`;
}

export function dashboardListingUrl(origin: string, listingId: number): string {
  return `${origin}/dashboard/listings/${listingId}`;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Paid visibility, said plainly. The ranking puts Featured and Boosted listings
 * first — that is the product — and a model summarising results should be able
 * to tell the user which ones are promoted rather than presenting order as
 * merit.
 */
export function promotion(l: {
  featured?: boolean | null;
  featuredUntil?: Date | string | null;
  boostedUntil?: Date | string | null;
  urgentUntil?: Date | string | null;
}): string[] {
  const now = Date.now();
  const live = (d: Date | string | null | undefined) => !!d && new Date(d).getTime() > now;
  const out: string[] = [];
  if (l.featured && (!l.featuredUntil || live(l.featuredUntil))) out.push('featured');
  if (live(l.boostedUntil)) out.push('boosted');
  if (live(l.urgentUntil)) out.push('urgent');
  return out;
}

type ListingRow = typeof listings.$inferSelect;

/** Compact card for result lists. */
export function summarizeListing(l: ListingRow & Record<string, any>, origin: string) {
  const photos = parsePhotos(l.photos);
  return {
    id: l.id,
    title: l.title,
    url: listingUrl(origin, l.id),
    rentPerMonthLKR: num(l.rentPerMonth),
    city: l.city,
    district: l.district,
    propertyType: l.propertyType,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    areaSqft: l.areaSqft,
    depositMonths: l.depositMonths,
    utilitiesIncluded: l.utilitiesIncluded,
    powerBackup: l.powerBackup || null,
    waterSource: l.waterSource || null,
    hasFiber: l.hasFiber,
    parking: l.parking,
    petsAllowed: l.petsAllowed,
    temporary: l.isTemporary,
    verifiedByEasyRent: l.verified,
    visitedByEasyRent: l.visited,
    promoted: promotion(l),
    publisher: l.publisherName ?? undefined,
    publisherWhatsAppVerified: l.whatsappVerified ?? undefined,
    photoCount: photos.length,
    coverPhoto: photos[0] ?? null,
    views: typeof l.viewTotal === 'number' ? l.viewTotal : undefined,
    publishedAt: l.publishedAt ?? null,
  };
}

/** Everything a renter would read on the listing page. */
export function detailListing(l: ListingRow, origin: string) {
  return {
    ...summarizeListing(l, origin),
    status: l.status,
    description: l.description,
    address: l.address,
    serviceChargeLKR: num(l.serviceCharge),
    noticePeriodDays: l.noticePeriodDays,
    waterTankLitres: l.waterTankSize,
    fiberISPs: l.fiberISPs,
    acUnits: l.acUnits,
    fans: l.fans,
    ventilation: l.ventilation,
    gated: l.isGated,
    securityGuard: l.hasGuard,
    cctv: l.hasCCTV,
    burglarBars: l.hasBurglarBars,
    parkingSpaces: l.parkingSpaces,
    photos: parsePhotos(l.photos).slice(0, 12),
    expiresAt: l.expiresAt,
  };
}

/* ------------------------------------------------------------------------- */
/* Ownership                                                                   */
/* ------------------------------------------------------------------------- */

export function isStaff(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin' || user.role === 'ops';
}

/**
 * Listings this user OWNS, as the dashboard reckons it: their landlord row,
 * anything they created, and their business account's listings. Sequential
 * lookups, never Promise.all, on the `max: 1` pool.
 */
export async function ownedListingsCondition(user: Pick<User, 'id'>): Promise<SQL> {
  const landlord = await db.query.landlords.findFirst({
    where: eq(landlords.userId, user.id),
    columns: { id: true },
  });
  const member = await db.query.businessAccountMembers.findFirst({
    where: and(eq(businessAccountMembers.userId, user.id), eq(businessAccountMembers.isActive, true)),
    columns: { businessAccountId: true },
  });
  const conds: SQL[] = [eq(listings.createdBy, user.id)];
  if (landlord) conds.push(eq(listings.landlordId, landlord.id));
  if (member) conds.push(eq(listings.businessAccountId, member.businessAccountId));
  return conds.length === 1 ? conds[0] : or(...conds)!;
}

/** The listing, if this user owns it (or is staff). Not-owned and missing read the same. */
export async function requireOwnedListing(user: Pick<User, 'id' | 'role'>, listingId: number): Promise<ListingRow> {
  const where = isStaff(user)
    ? eq(listings.id, listingId)
    : and(eq(listings.id, listingId), await ownedListingsCondition(user));
  const [row] = await db.select().from(listings).where(where).limit(1);
  if (!row) throw new ToolError(`Listing ${listingId} was not found among your listings.`);
  return row;
}
