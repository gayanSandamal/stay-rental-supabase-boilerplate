import { z } from 'zod';
import { and, asc, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, listings, users } from '@/lib/db/schema';
import { getRecentAuditLogs } from '@/lib/db/queries';
import { isReservedWaEmail } from '@/lib/intake/landlord-identity';
import { parsePhotos } from '@/lib/images/manifest';
import { PATCH as patchListingRoute } from '@/app/api/listings/[id]/route';
import { POST as boostRoute } from '@/app/api/listings/[id]/boost/route';
import { POST as featureRoute } from '@/app/api/listings/[id]/feature/route';
import { POST as urgentRoute } from '@/app/api/listings/[id]/urgent/route';
import { POST as bundleRoute } from '@/app/api/listings/[id]/bundle/route';
import { routeError } from '../call-route';
import { ToolError, defineTool } from '../types';
import { dashboardListingUrl, listingIdArg, listingUrl, promotion } from './shared';

/**
 * Back-office tools. Listed only for ops/admin accounts whose token holds the
 * `admin` scope — and the route handlers underneath re-check the role on every
 * call, so neither the scope nor the listing filter is the real lock.
 *
 * Visibility activation stays MANUAL (CLAUDE.md, "Payments are MANUAL"): the
 * tool exists so an operator can activate a Boost they have already been paid
 * for, and refuses to run without an explicit confirmation that they were.
 */
const STAFF = ['ops', 'admin'] as const;

export const adminPlatformStats = defineTool({
  name: 'admin_platform_stats',
  title: 'Platform stats',
  description: 'Listing counts by status, the review queue, and user counts by role.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler() {
    const byStatus = await db
      .select({ status: listings.status, n: count() })
      .from(listings)
      .groupBy(listings.status);
    const byRole = await db
      .select({ role: users.role, n: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.role);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [newThisWeek] = await db
      .select({ n: count() })
      .from(listings)
      .where(gte(listings.createdAt, weekAgo));
    const [verifiedActive] = await db
      .select({ n: count() })
      .from(listings)
      .where(and(eq(listings.status, 'active'), eq(listings.verified, true)));
    return {
      listingsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
      verifiedActiveListings: Number(verifiedActive?.n ?? 0),
      listingsCreatedLast7Days: Number(newThisWeek?.n ?? 0),
      usersByRole: Object.fromEntries(byRole.map((r) => [r.role, Number(r.n)])),
    };
  },
});

export const adminListListings = defineTool({
  name: 'admin_list_listings',
  title: 'Browse all listings',
  description:
    'Any listing on the platform by status — defaults to the review queue ("pending", oldest first) with moderation notes and the owner.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({
    status: z.enum(['pending', 'active', 'rented', 'archived', 'rejected', 'expired']).default('pending'),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).default(0),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ status, limit, offset }, ctx) {
    const rows = await db
      .select({
        listing: listings,
        ownerName: users.name,
        ownerEmail: users.email,
        ownerWaPhone: users.waPhone,
        ownerWaVerifiedAt: users.waPhoneVerifiedAt,
        landlordKyc: landlords.kycVerified,
      })
      .from(listings)
      .leftJoin(landlords, eq(listings.landlordId, landlords.id))
      .leftJoin(users, eq(landlords.userId, users.id))
      .where(eq(listings.status, status))
      .orderBy(status === 'pending' ? asc(listings.createdAt) : desc(listings.createdAt))
      .limit(limit)
      .offset(offset);
    return {
      status,
      count: rows.length,
      listings: rows.map(({ listing: l, ...o }) => ({
        id: l.id,
        title: l.title,
        city: l.city,
        district: l.district,
        bedrooms: l.bedrooms,
        rentPerMonthLKR: Number(l.rentPerMonth),
        photoCount: parsePhotos(l.photos).length,
        createdAt: l.createdAt,
        moderationStatus: l.moderationStatus,
        moderationSummary: l.moderationSummary,
        rejectionReason: l.rejectionReason,
        verified: l.verified,
        visited: l.visited,
        promoted: promotion(l),
        owner: {
          name: o.ownerName,
          email: isReservedWaEmail(o.ownerEmail) ? null : o.ownerEmail,
          whatsapp: o.ownerWaVerifiedAt ? o.ownerWaPhone : null,
          kycVerified: Boolean(o.landlordKyc),
        },
        reviewUrl: dashboardListingUrl(ctx.origin, l.id),
        publicUrl: l.status === 'active' ? listingUrl(ctx.origin, l.id) : null,
      })),
    };
  },
});

export const adminReviewListing = defineTool({
  name: 'admin_review_listing',
  title: 'Approve or reject a listing',
  description:
    'Approve (publish) or reject a listing, optionally marking it verified/visited. Approval notifies the owner and starts the 30-day listing period. A rejection needs a reason the owner can act on.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({
    listingId: listingIdArg,
    decision: z.enum(['approve', 'reject']),
    rejectionReason: z.string().min(10).max(500).optional().describe('Required when rejecting. Shown to the owner'),
    markVerified: z.boolean().optional().describe('Set the "verified by Easy Rent" badge'),
    markVisited: z.boolean().optional().describe('Set the "visited by Easy Rent" badge'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler({ listingId, decision, rejectionReason, markVerified, markVisited }, ctx) {
    if (decision === 'reject' && !rejectionReason) {
      throw new ToolError('A rejection needs a rejectionReason the owner can act on.');
    }
    const res = await ctx.callRoute(patchListingRoute, {
      method: 'PATCH',
      path: `/api/listings/${listingId}`,
      params: { id: String(listingId) },
      body: {
        status: decision === 'approve' ? 'active' : 'rejected',
        ...(decision === 'reject' ? { rejectionReason } : {}),
        ...(markVerified !== undefined ? { verified: markVerified } : {}),
        ...(markVisited !== undefined ? { visited: markVisited } : {}),
      },
    });
    if (!res.ok) throw new ToolError(routeError(res));
    const l = res.data.listing;
    return {
      listingId,
      status: l?.status,
      publishedAt: l?.publishedAt ?? null,
      expiresAt: l?.expiresAt ?? null,
      verified: l?.verified,
      visited: l?.visited,
      publicUrl: l?.status === 'active' ? listingUrl(ctx.origin, listingId) : null,
    };
  },
});

export const adminActivateVisibility = defineTool({
  name: 'admin_activate_visibility',
  title: 'Activate paid visibility',
  description:
    'Activate a paid visibility product on a listing AFTER the landlord has paid offline: boost (LKR 250 / 7 days; uses a plan\'s included boost first), feature (LKR 500 / 7 days), urgent (LKR 150 / 7 days), or a bundle. ' +
    'Never call this on a landlord\'s say-so — only when the operator confirms the payment was received.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({
    listingId: listingIdArg,
    product: z.enum(['boost', 'feature', 'urgent', 'bundle']),
    bundle: z.enum(['quick_results', 'priority_exposure', 'starter']).optional().describe('Required when product is "bundle"'),
    paymentConfirmed: z.literal(true).describe('Must be true: the operator confirms the offline payment was received'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler({ listingId, product, bundle }, ctx) {
    if (product === 'bundle' && !bundle) throw new ToolError('Say which bundle: quick_results, priority_exposure or starter.');
    const route = { boost: boostRoute, feature: featureRoute, urgent: urgentRoute, bundle: bundleRoute }[product];
    const path = `/api/listings/${listingId}/${product}`;
    const res = await ctx.callRoute(route, {
      method: 'POST',
      path,
      params: { id: String(listingId) },
      body: product === 'bundle' ? { bundle } : {},
    });
    if (!res.ok) throw new ToolError(routeError(res));
    return { listingId, product, bundle: bundle ?? null, result: res.data };
  },
});

export const adminRecentAudit = defineTool({
  name: 'admin_recent_audit_log',
  title: 'Recent audit log',
  description: 'The most recent consequential actions on the platform (approvals, visibility activations, bans, flag changes…). Admin only.',
  scope: 'admin',
  roles: ['admin'],
  input: z.object({ limit: z.number().int().min(1).max(100).default(25) }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ limit }) {
    const rows = await getRecentAuditLogs(limit);
    return {
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.userName || (isReservedWaEmail(r.userEmail) ? 'WhatsApp user' : r.userEmail) || null,
        metadata: safeParse(r.metadata),
        at: r.createdAt,
      })),
    };
  },
});

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const adminTools = [
  adminPlatformStats,
  adminListListings,
  adminReviewListing,
  adminActivateVisibility,
  adminRecentAudit,
];
