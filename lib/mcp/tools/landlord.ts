import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, landlords, listings, userContactNumbers } from '@/lib/db/schema';
import { getPortfolioInsights } from '@/lib/db/queries';
import { parsePhotos } from '@/lib/images/manifest';
import { POST as createListingRoute } from '@/app/api/listings/route';
import { PATCH as patchListingRoute, PUT as putListingRoute } from '@/app/api/listings/[id]/route';
import { POST as bulkRenewRoute } from '@/app/api/listings/bulk-renew/route';
import {
  GET as listContactNumbersRoute,
  POST as addContactNumberRoute,
} from '@/app/api/contact-numbers/route';
import { routeError } from '../call-route';
import { ToolError, defineTool } from '../types';
import {
  POWER_BACKUP,
  PROPERTY_TYPES,
  VENTILATION,
  WATER_SOURCES,
  dashboardListingUrl,
  listingIdArg,
  listingUrl,
  ownedListingsCondition,
  promotion,
  requireOwnedListing,
} from './shared';

/**
 * Landlord tools. Every write goes through the same route handler the
 * dashboard uses (lib/mcp/call-route.ts), so re-approval on edit, moderation
 * queueing, duplicate detection, the photo cap, the tenant→landlord upgrade,
 * audit logging and the owner notices all apply exactly as they do in the
 * browser. Nothing here decides whether a change is allowed.
 */

const LISTING_STATUSES = ['pending', 'active', 'rented', 'archived', 'rejected', 'expired'] as const;

/**
 * Editable listing content. Field names are the API's own, so there is no
 * mapping layer to drift. Photos are deliberately absent: listing photos must
 * live in Easy Rent's storage (next/image refuses other hosts and moderation
 * reads the stored original), and an MCP client has no way to upload a file —
 * the tools point the user at the dashboard instead.
 */
const contentShape = {
  title: z.string().min(5).max(200).describe('e.g. "Spacious 3BR house with garden in Nugegoda"'),
  description: z.string().max(5000).describe('Free-text description. Do NOT include phone numbers — contact numbers are added separately'),
  propertyType: z.enum(PROPERTY_TYPES),
  address: z.string().max(300).describe('Street address or landmark. Optional when the town is a recognised Sri Lankan town'),
  city: z.string().min(2).max(100).describe('Town or city (use search_locations for the exact spelling)'),
  district: z.string().max(100).describe('District, e.g. "Colombo". Usually derived from the town automatically'),
  bedrooms: z.number().int().min(1).max(20),
  bathrooms: z.number().int().min(0).max(20),
  areaSqft: z.number().int().min(50).max(100000),
  rentPerMonth: z.number().int().min(1000).max(100_000_000).describe('Monthly rent in LKR'),
  depositMonths: z.number().int().min(0).max(24).describe('Deposit, in months of rent (default 3)'),
  utilitiesIncluded: z.boolean(),
  serviceCharge: z.number().int().min(0).max(10_000_000).describe('Monthly service charge in LKR (apartments)'),
  noticePeriodDays: z.number().int().min(0).max(365).describe('Notice period in days (default 30)'),
  isTemporary: z.boolean().describe('A shorter-duration rental the landlord declares as temporary'),
  powerBackup: z.enum([...POWER_BACKUP, 'none']),
  waterSource: z.enum(WATER_SOURCES),
  waterTankSize: z.number().int().min(0).max(100000).describe('Water tank size in litres'),
  hasFiber: z.boolean().describe('Fibre internet available'),
  fiberISPs: z.string().max(200).describe('Comma-separated providers, e.g. "SLT, Dialog"'),
  acUnits: z.number().int().min(0).max(50),
  fans: z.number().int().min(0).max(50),
  ventilation: z.enum(VENTILATION),
  isGated: z.boolean(),
  hasGuard: z.boolean(),
  hasCCTV: z.boolean(),
  hasBurglarBars: z.boolean(),
  parking: z.boolean(),
  parkingSpaces: z.number().int().min(0).max(50),
  petsAllowed: z.boolean(),
};

type ContentKey = keyof typeof contentShape;
const CONTENT_KEYS = Object.keys(contentShape) as ContentKey[];

const optionalContent = Object.fromEntries(
  CONTENT_KEYS.map((k) => [k, contentShape[k].optional()])
) as { [K in ContentKey]: z.ZodOptional<(typeof contentShape)[K]> };

function normaliseContent(input: Partial<Record<ContentKey, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CONTENT_KEYS) {
    if (input[k] === undefined) continue;
    out[k] = k === 'powerBackup' && input[k] === 'none' ? '' : input[k];
  }
  return out;
}

/** The user's landlord row, created on first use exactly as /dashboard/listings/new does. */
async function ensureLandlord(userId: number) {
  const existing = await db.query.landlords.findFirst({ where: eq(landlords.userId, userId) });
  if (existing) return existing;
  const [created] = await db.insert(landlords).values({ userId }).returning();
  return created;
}

function statusExplainer(status: string): string {
  switch (status) {
    case 'pending':
      return 'Waiting for review. Easy Rent checks every new or edited listing before it is public.';
    case 'active':
      return 'Live and visible to renters.';
    case 'rejected':
      return 'Not approved. Fix the reason given, then request a re-review.';
    case 'expired':
      return 'Expired — listings run 3 months after publishing. Renew it from the dashboard.';
    case 'archived':
      return 'Archived by the owner; not visible to renters.';
    case 'rented':
      return 'Marked as rented.';
    default:
      return status;
  }
}

export const listMyListings = defineTool({
  name: 'list_my_listings',
  title: 'List my listings',
  description:
    'The user\'s own listings (as landlord, creator, or through their business account) with status, rent, expiry, and — when includeStats is true — views, contact taps and how the rent compares with similar listings.',
  scope: 'read',
  input: z.object({
    status: z.enum(LISTING_STATUSES).optional().describe('Only listings in this status'),
    includeStats: z.boolean().default(true),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ status, includeStats, limit }, ctx) {
    const owned = await ownedListingsCondition(ctx.user);
    const rows = await db
      .select()
      .from(listings)
      .where(status ? and(owned, eq(listings.status, status)) : owned)
      .orderBy(desc(listings.createdAt))
      .limit(limit);

    // Five set-based queries for the whole portfolio, whatever its size.
    const insights = includeStats && rows.length ? await getPortfolioInsights(rows) : new Map();

    return {
      count: rows.length,
      listings: rows.map((l) => {
        const i = insights.get(l.id);
        return {
          id: l.id,
          title: l.title,
          status: l.status,
          statusMeaning: statusExplainer(l.status),
          rejectionReason: l.status === 'rejected' ? l.rejectionReason : undefined,
          rentPerMonthLKR: Number(l.rentPerMonth),
          city: l.city,
          bedrooms: l.bedrooms,
          photoCount: parsePhotos(l.photos).length,
          promoted: promotion(l),
          publishedAt: l.publishedAt,
          expiresAt: l.expiresAt,
          publicUrl: l.status === 'active' ? listingUrl(ctx.origin, l.id) : null,
          manageUrl: dashboardListingUrl(ctx.origin, l.id),
          ...(i
            ? {
                stats: {
                  totalViews: i.totalViews,
                  viewsLast7d: i.viewsLast7d,
                  // null = "cannot say", never zero (pre-0046 rows have no hash).
                  uniqueViewersLast7d: i.uniqueViewersLast7d,
                  // A floor, not an exact count — see lib/analytics/impressions.ts.
                  searchImpressionsAtLeast: i.impressions,
                  contactTaps: i.totalContacts,
                  contactTapsLast7d: i.contactsLast7d,
                  callTaps: i.callClicks,
                  whatsappTaps: i.whatsappClicks,
                  rentComparison: i.rentComparison,
                  rentPercentile: i.percentile,
                  comparableListings: i.comparableCount,
                },
              }
            : {}),
        };
      }),
    };
  },
});

export const listMyContactNumbers = defineTool({
  name: 'list_my_contact_numbers',
  title: 'List my contact numbers',
  description: 'Phone numbers on the user\'s account that can be shown on their listings, with ids for create_listing.',
  scope: 'read',
  input: z.object({}),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async handler(_args, ctx) {
    const res = await ctx.callRoute(listContactNumbersRoute, { method: 'GET', path: '/api/contact-numbers' });
    if (!res.ok) throw new ToolError(routeError(res));
    return {
      contactNumbers: (res.data.contactNumbers ?? []).map((c: any) => ({
        id: c.id,
        phoneNumber: c.phoneNumber,
        whatsapp: Boolean(c.isWhatsApp),
        verified: Boolean(c.verified),
        label: c.label ?? null,
        active: Boolean(c.isActive),
      })),
    };
  },
});

export const addContactNumber = defineTool({
  name: 'add_contact_number',
  title: 'Add a contact number',
  description:
    'Add a phone number renters can call about the user\'s listings. It starts unverified; the user can verify it from Dashboard → Settings.',
  scope: 'write',
  input: z.object({
    phoneNumber: z.string().min(9).max(20).describe('Sri Lankan number, e.g. "0771234567" or "+94771234567"'),
    isWhatsApp: z.boolean().default(true).describe('Whether renters can WhatsApp this number'),
    label: z.string().max(50).optional().describe('e.g. "Owner", "Caretaker"'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler(args, ctx) {
    const res = await ctx.callRoute(addContactNumberRoute, { method: 'POST', path: '/api/contact-numbers', body: args });
    if (!res.ok) throw new ToolError(routeError(res));
    const c = res.data.contactNumber ?? res.data;
    return { contactNumber: { id: c.id, phoneNumber: c.phoneNumber, whatsapp: Boolean(c.isWhatsApp), verified: Boolean(c.verified) } };
  },
});

export const createListing = defineTool({
  name: 'create_listing',
  title: 'Create a listing',
  description:
    'Publish a new rental listing for the user (free, no limits). It starts as "pending" and goes live after Easy Rent reviews it. ' +
    'Required: title, city, bedrooms, rentPerMonth (LKR). Confirm the details with the user before calling. ' +
    'Contact numbers default to all of the user\'s active numbers (see list_my_contact_numbers / add_contact_number). ' +
    'Photos cannot be added here — the result links to the page where the user uploads them.',
  scope: 'write',
  input: z.object({
    ...optionalContent,
    title: contentShape.title,
    city: contentShape.city,
    bedrooms: contentShape.bedrooms,
    rentPerMonth: contentShape.rentPerMonth,
    contactNumberIds: z.array(z.number().int().min(1)).min(1).max(5).optional().describe('Which of the user\'s contact numbers to show. Defaults to all active ones'),
    shareOnSocial: z
      .boolean()
      .default(false)
      .describe('Consent to also post the listing on Easy Rent\'s own Facebook, Instagram and TikTok once approved. Only set true if the user said yes'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler({ contactNumberIds, shareOnSocial, ...content }, ctx) {
    const landlord = await ensureLandlord(ctx.user.id);

    let contactNumbers = contactNumberIds;
    if (!contactNumbers) {
      const mine = await db
        .select({ id: userContactNumbers.id })
        .from(userContactNumbers)
        .where(and(eq(userContactNumbers.userId, ctx.user.id), eq(userContactNumbers.isActive, true)));
      contactNumbers = mine.map((c) => c.id);
    }
    if (!contactNumbers.length) {
      throw new ToolError(
        'The user has no contact number yet, and every listing needs one so renters can call. Ask for a number and call add_contact_number first.'
      );
    }

    const member = await db.query.businessAccountMembers.findFirst({
      where: and(eq(businessAccountMembers.userId, ctx.user.id), eq(businessAccountMembers.isActive, true)),
      columns: { businessAccountId: true },
    });

    const res = await ctx.callRoute(createListingRoute, {
      method: 'POST',
      path: '/api/listings',
      body: {
        ...normaliseContent(content),
        landlordId: landlord.id,
        businessAccountId: member?.businessAccountId,
        contactNumbers,
        photos: [],
        shareOnSocial,
      },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    const l = res.data.listing ?? res.data;
    return {
      listingId: l.id,
      status: l.status,
      statusMeaning: statusExplainer(l.status),
      addPhotosUrl: `${ctx.origin}/dashboard/listings/${l.id}/edit`,
      manageUrl: dashboardListingUrl(ctx.origin, l.id),
      next: 'Listings with photos get far more enquiries — ask the user to add photos at addPhotosUrl.',
    };
  },
});

export const updateListing = defineTool({
  name: 'update_listing',
  title: 'Edit a listing',
  description:
    'Change details of one of the user\'s listings. Pass only the fields to change. ' +
    'Editing the content of a LIVE listing sends it back to review (it is hidden until re-approved) — tell the user before doing it.',
  scope: 'write',
  input: z.object({
    listingId: listingIdArg,
    ...optionalContent,
    contactNumberIds: z.array(z.number().int().min(1)).min(1).max(5).optional(),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler({ listingId, contactNumberIds, ...changes }, ctx) {
    const current = await requireOwnedListing(ctx.user, listingId);
    const patch = normaliseContent(changes);
    if (Object.keys(patch).length === 0 && !contactNumberIds) {
      throw new ToolError('Nothing to change — pass at least one field.');
    }

    // PUT replaces the whole content block (that is what the dashboard form
    // sends), so start from the stored row and overlay the changes. Photos are
    // resubmitted unchanged, exactly as the edit form does, so nothing is lost.
    const body: Record<string, unknown> = {};
    for (const k of CONTENT_KEYS) body[k] = (current as Record<string, unknown>)[k];
    body.latitude = current.latitude;
    body.longitude = current.longitude;
    Object.assign(body, patch);
    body.photos = parsePhotos(current.photos);
    if (contactNumberIds) body.contactNumbers = contactNumberIds;

    const res = await ctx.callRoute(putListingRoute, {
      method: 'PUT',
      path: `/api/listings/${listingId}`,
      params: { id: String(listingId) },
      body,
    });
    if (!res.ok) throw new ToolError(routeError(res));
    const l = res.data.listing;
    return {
      listingId,
      status: l?.status,
      statusMeaning: statusExplainer(l?.status),
      changed: Object.keys(patch).concat(contactNumberIds ? ['contactNumbers'] : []),
      wentBackToReview: current.status === 'active' && l?.status === 'pending',
      manageUrl: dashboardListingUrl(ctx.origin, listingId),
    };
  },
});

export const archiveListing = defineTool({
  name: 'archive_listing',
  title: 'Archive a listing',
  description:
    'Take one of the user\'s listings off the marketplace (e.g. it has been rented). It also comes down from Easy Rent\'s social accounts. Confirm with the user first.',
  scope: 'write',
  input: z.object({ listingId: listingIdArg }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async handler({ listingId }, ctx) {
    await requireOwnedListing(ctx.user, listingId);
    const res = await ctx.callRoute(patchListingRoute, {
      method: 'PATCH',
      path: `/api/listings/${listingId}`,
      params: { id: String(listingId) },
      body: { status: 'archived' },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    return { listingId, status: 'archived' };
  },
});

export const requestReReview = defineTool({
  name: 'request_listing_review',
  title: 'Request a re-review',
  description:
    'Send a REJECTED listing back for review after the user has fixed the reason it was rejected (use update_listing first).',
  scope: 'write',
  input: z.object({ listingId: listingIdArg }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler({ listingId }, ctx) {
    const current = await requireOwnedListing(ctx.user, listingId);
    if (current.status !== 'rejected') {
      throw new ToolError(`Listing ${listingId} is "${current.status}", not rejected — only rejected listings can be sent back for review.`);
    }
    const res = await ctx.callRoute(patchListingRoute, {
      method: 'PATCH',
      path: `/api/listings/${listingId}`,
      params: { id: String(listingId) },
      body: { status: 'pending' },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    return { listingId, status: 'pending', statusMeaning: statusExplainer('pending') };
  },
});

export const renewListings = defineTool({
  name: 'renew_listings',
  title: 'Renew expiring listings',
  description:
    'Extend active listings that expire within 7 days by another 3 months. Available on the Agency plan; other plans renew from the dashboard.',
  scope: 'write',
  input: z.object({ listingIds: z.array(z.number().int().min(1)).min(1).max(100) }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler({ listingIds }, ctx) {
    const res = await ctx.callRoute(bulkRenewRoute, {
      method: 'POST',
      path: '/api/listings/bulk-renew',
      body: { listingIds },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    return { renewed: res.data.renewed ?? 0, message: res.data.message };
  },
});

export const landlordTools = [
  listMyListings,
  listMyContactNumbers,
  addContactNumber,
  createListing,
  updateListing,
  archiveListing,
  requestReReview,
  renewListings,
];
