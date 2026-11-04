import { z } from 'zod';
import { getListingById } from '@/lib/db/queries';
import { isListingAvailable } from '@/lib/seo/jsonld';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { isReservedWaEmail } from '@/lib/intake/landlord-identity';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  getNotificationsForUser,
  getUnreadCountForUser,
} from '@/lib/notifications';
import { isUserPremium } from '@/lib/subscription';
import { getIncludedBoostsRemaining, getLandlordPlanTier } from '@/lib/landlord-plans';
import { GET as paginatedListings } from '@/app/api/listings/paginated/route';
import { GET as searchLocationsRoute } from '@/app/api/locations/search/route';
import {
  GET as listSavedSearchesRoute,
  POST as createSavedSearchRoute,
} from '@/app/api/saved-searches/route';
import { DELETE as deleteSavedSearchRoute } from '@/app/api/saved-searches/[id]/route';
import { PATCH as markAllNotificationsRoute } from '@/app/api/notifications/route';
import { PATCH as markNotificationRoute } from '@/app/api/notifications/[id]/read/route';
import { routeError } from '../call-route';
import { ToolError, defineTool } from '../types';
import {
  SORTS,
  detailListing,
  isStaff,
  listingIdArg,
  ownedListingsCondition,
  searchFilterShape,
  summarizeListing,
  toFilterParams,
} from './shared';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export const searchListings = defineTool({
  name: 'search_listings',
  title: 'Search rentals',
  description:
    'Search active Easy Rent rental listings in Sri Lanka. Returns listing cards with rent (LKR/month), location, size, resilience features and a URL. ' +
    'Results use Easy Rent\'s default ranking unless sortBy is given; promoted (featured/boosted/urgent) listings rank first and are labelled in "promoted". ' +
    'Call get_listing for full details and the landlord\'s contact numbers.',
  scope: 'read',
  input: z.object({
    ...searchFilterShape,
    sortBy: z.enum(SORTS).optional().describe('Omit to use the default ranking'),
    page: z.number().int().min(1).max(50).default(1),
    limit: z.number().int().min(1).max(25).default(10).describe('Results per page (max 25)'),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler(args, ctx) {
    const { sortBy, page, limit, ...filters } = args;
    // The public search handler: same filters, same ranking, same premium and
    // early-access visibility rules, same impressions and demand logging.
    const res = await ctx.callRoute(paginatedListings, {
      method: 'GET',
      path: '/api/listings/paginated',
      query: { ...toFilterParams(filters), sortBy, page, limit },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    const rows = (res.data.listings ?? []) as any[];
    return {
      page,
      hasMore: Boolean(res.data.hasMore),
      count: rows.length,
      listings: rows.map((l) => summarizeListing(l, ctx.origin)),
      ...(rows.length === 0
        ? { tip: 'No matches. Try fewer filters, a nearby town (search_locations), or a wider rent range.' }
        : {}),
    };
  },
});

export const getListing = defineTool({
  name: 'get_listing',
  title: 'Get listing details',
  description:
    'Full details of one listing, including the landlord\'s published phone/WhatsApp numbers for contacting them directly. ' +
    'Active listings are visible to everyone; pending, rejected, rented or archived ones only to their owner and Easy Rent staff.',
  scope: 'read',
  input: z.object({ listingId: listingIdArg }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ listingId }, ctx) {
    // Contact numbers are public on the page, but a model can page through
    // thousands of ids far faster than a person — so the reveal is throttled
    // per user, at the same 60/min a browser gets on any other route.
    const rl = checkRateLimit(`mcp-user-${ctx.user.id}`, 'GET', '/mcp/get_listing');
    if (!rl.allowed) throw new ToolError('Too many listing lookups in a short time. Wait a minute and try again.');

    const listing = await getListingById(listingId);
    const publiclyVisible = listing && isListingAvailable(listing);

    let canSee = Boolean(publiclyVisible);
    let isOwnerView = false;
    if (listing && !publiclyVisible) {
      // Same rule as /listings/[id]: owner, business-account colleague, creator, or staff.
      if (isStaff(ctx.user)) {
        canSee = true;
      } else {
        const [owned] = await db
          .select({ id: listings.id })
          .from(listings)
          .where(and(eq(listings.id, listingId), await ownedListingsCondition(ctx.user)))
          .limit(1);
        canSee = Boolean(owned);
      }
      isOwnerView = canSee;
    }
    if (!listing || !canSee) throw new ToolError(`Listing ${listingId} is not available. It may have been rented or removed.`);

    const publishers = await resolvePublishers([listing]);
    const publisher = publishers.get(listing.id);

    const contacts = [...(listing.contactNumbers ?? [])]
      .filter((lc) => lc.contactNumber?.isActive)
      .sort((a, b) => Number(Boolean(b.contactNumber?.verified)) - Number(Boolean(a.contactNumber?.verified)))
      .map((lc) => {
        const c = lc.contactNumber!;
        const digits = c.phoneNumber.replace(/[^0-9]/g, '');
        return {
          phone: c.phoneNumber,
          label: c.label ?? null,
          verifiedNumber: Boolean(c.verified),
          whatsapp: Boolean(c.isWhatsApp),
          callLink: `tel:${c.phoneNumber}`,
          whatsappLink: c.isWhatsApp ? `https://wa.me/${digits}` : null,
        };
      });
    // The page's fallback when no listing number is linked.
    if (contacts.length === 0 && listing.landlord?.user?.phone) {
      const phone = listing.landlord.user.phone;
      contacts.push({
        phone,
        label: null,
        verifiedNumber: false,
        whatsapp: false,
        callLink: `tel:${phone}`,
        whatsappLink: null,
      });
    }

    return {
      ...detailListing(listing, ctx.origin),
      publisher: publisher?.publisherName ?? 'Property owner',
      publisherType: publisher?.publisherType ?? 'individual',
      publisherKycVerified: publisher?.kycVerified ?? false,
      publisherWhatsAppVerified: publisher?.whatsappVerified ?? false,
      // Only a live listing is contactable, exactly as on the page.
      contact: publiclyVisible ? contacts : [],
      ...(isOwnerView
        ? {
            ownerView: true,
            rejectionReason: listing.rejectionReason ?? null,
            moderationStatus: listing.moderationStatus,
            moderationSummary: listing.moderationSummary ?? null,
          }
        : {}),
      howToContact:
        'Call or WhatsApp the landlord directly. Easy Rent never asks for a deposit before you have viewed a property.',
    };
  },
});

export const searchLocations = defineTool({
  name: 'search_locations',
  title: 'Find a Sri Lankan town',
  description:
    'Look up Sri Lankan towns, suburbs and districts by partial name (English spelling). Use it to get the exact city name search_listings expects.',
  scope: 'read',
  input: z.object({ query: z.string().min(2).max(60).describe('Part of a town name, e.g. "nugeg", "kandy", "wattala"') }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async handler({ query }, ctx) {
    const res = await ctx.callRoute(searchLocationsRoute, {
      method: 'GET',
      path: '/api/locations/search',
      query: { q: query },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    return { results: res.data.results ?? [] };
  },
});

export const getMyAccount = defineTool({
  name: 'get_my_account',
  title: 'My Easy Rent account',
  description: 'Who this connection is signed in as: name, role (renter, landlord, ops, admin), plan, and what this connection is allowed to do.',
  scope: 'read',
  input: z.object({}),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async handler(_args, ctx) {
    const u = ctx.user;
    const syntheticEmail = isReservedWaEmail(u.email);
    const landlord = await db.query.landlords.findFirst({
      where: (l, { eq }) => eq(l.userId, u.id),
    });
    return {
      id: u.id,
      name: u.name ?? null,
      // A WhatsApp-created account has a placeholder address on a domain with
      // no mailbox — never present it as the user's email.
      email: syntheticEmail ? null : u.email,
      whatsappNumber: u.waPhoneVerifiedAt ? u.waPhone : null,
      role: u.role,
      renterPlan: isUserPremium(u) ? 'premium' : 'free',
      landlord: landlord
        ? {
            plan: getLandlordPlanTier(landlord),
            includedBoostsRemainingThisMonth: getIncludedBoostsRemaining(landlord),
            kycVerified: landlord.kycVerified,
          }
        : null,
      connectionScopes: ctx.scopes,
      dashboard: `${ctx.origin}/dashboard`,
      notes: syntheticEmail
        ? ['This account was created over WhatsApp and has no email address, so email alerts cannot reach it. Add an email in Dashboard → Settings to receive them.']
        : [],
    };
  },
});

/* ------------------------------------------------------------------------- */
/* Saved searches                                                             */
/* ------------------------------------------------------------------------- */

export const listSavedSearches = defineTool({
  name: 'list_saved_searches',
  title: 'List saved alerts',
  description: 'The user\'s saved searches (alerts) with their filters.',
  scope: 'read',
  input: z.object({}),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async handler(_args, ctx) {
    const res = await ctx.callRoute(listSavedSearchesRoute, { method: 'GET', path: '/api/saved-searches' });
    if (!res.ok) throw new ToolError(routeError(res));
    return {
      limit: res.data.limit ?? null,
      savedSearches: (res.data.savedSearches ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        filters: safeJson(s.searchParams),
        emailAlerts: s.emailAlerts,
        createdAt: s.createdAt,
        browseUrl: `${ctx.origin}/listings?${new URLSearchParams(stringRecord(safeJson(s.searchParams)))}`,
      })),
    };
  },
});

export const createSavedSearch = defineTool({
  name: 'create_saved_search',
  title: 'Save a search alert',
  description:
    'Save a search so the user is emailed when new matching listings are published. Free accounts can keep 3 saved alerts.',
  scope: 'write',
  input: z.object({
    name: z.string().min(1).max(100).describe('A short name, e.g. "2BR Nugegoda under 80k"'),
    ...searchFilterShape,
    emailAlerts: z.boolean().default(true),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler({ name, emailAlerts, ...filters }, ctx) {
    const searchParams = toFilterParams(filters);
    if (Object.keys(searchParams).length === 0) {
      throw new ToolError('Add at least one filter (a town, rent range, bedrooms…) — an alert for everything would email on every new listing.');
    }
    const res = await ctx.callRoute(createSavedSearchRoute, {
      method: 'POST',
      path: '/api/saved-searches',
      body: { name, searchParams, emailAlerts, whatsappAlerts: false },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    const notes: string[] = [];
    // Alerts are email-only (savedSearches.whatsappAlerts is read by nothing),
    // and a WhatsApp-created account's address has no mailbox. Never let the
    // model promise an alert that cannot arrive.
    if (emailAlerts && isReservedWaEmail(ctx.user.email)) {
      notes.push('This account has no email address yet, so alerts cannot be delivered until one is added in Dashboard → Settings.');
    }
    return { savedSearch: { id: res.data.savedSearch?.id, name, filters: searchParams, emailAlerts }, notes };
  },
});

export const deleteSavedSearch = defineTool({
  name: 'delete_saved_search',
  title: 'Delete a saved alert',
  description: 'Delete one of the user\'s saved searches by id (from list_saved_searches).',
  scope: 'write',
  input: z.object({ savedSearchId: z.number().int().min(1) }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async handler({ savedSearchId }, ctx) {
    const res = await ctx.callRoute(deleteSavedSearchRoute, {
      method: 'DELETE',
      path: `/api/saved-searches/${savedSearchId}`,
      params: { id: String(savedSearchId) },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    return { deleted: savedSearchId };
  },
});

/* ------------------------------------------------------------------------- */
/* Notifications                                                              */
/* ------------------------------------------------------------------------- */

export const listNotifications = defineTool({
  name: 'list_notifications',
  title: 'List notifications',
  description: 'The user\'s in-app notifications (listing approvals, rejections, expiry reminders…), newest first.',
  scope: 'read',
  input: z.object({
    limit: z.number().int().min(1).max(50).default(20),
    unreadOnly: z.boolean().default(false),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ limit, unreadOnly }, ctx) {
    // Called directly and sequentially rather than through GET
    // /api/notifications, which runs these two with Promise.all — the pattern
    // that wedges the `max: 1` pool (commit a3ac4f9).
    const rows = await getNotificationsForUser(ctx.user.id, unreadOnly ? 100 : limit);
    const unreadCount = await getUnreadCountForUser(ctx.user.id);
    const shown = (unreadOnly ? rows.filter((n) => !n.readAt) : rows).slice(0, limit);
    return {
      unreadCount,
      notifications: shown.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.body ?? null,
        link: n.link ? new URL(n.link, ctx.origin).toString() : null,
        read: Boolean(n.readAt),
        createdAt: n.createdAt,
      })),
    };
  },
});

export const markNotificationsRead = defineTool({
  name: 'mark_notifications_read',
  title: 'Mark notifications read',
  description: 'Mark one notification as read (pass notificationId), or all of them (omit it).',
  scope: 'write',
  input: z.object({ notificationId: z.number().int().min(1).optional() }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler({ notificationId }, ctx) {
    const res = notificationId
      ? await ctx.callRoute(markNotificationRoute, {
          method: 'PATCH',
          path: `/api/notifications/${notificationId}/read`,
          params: { id: String(notificationId) },
        })
      : await ctx.callRoute(markAllNotificationsRoute, {
          method: 'PATCH',
          path: '/api/notifications',
          body: { action: 'mark_all_read' },
        });
    if (!res.ok) throw new ToolError(routeError(res));
    return { ok: true, marked: notificationId ?? 'all' };
  },
});

function safeJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function stringRecord(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

export const renterTools = [
  searchListings,
  getListing,
  searchLocations,
  getMyAccount,
  listSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  listNotifications,
  markNotificationsRead,
];
