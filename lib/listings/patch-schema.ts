import { z } from 'zod';

/**
 * Validation and the trust-field rule for `PATCH /api/listings/[id]`.
 *
 * This lives outside the route handler on purpose. It is the check that stops a
 * landlord awarding themselves the Verified badge, and a Next.js route module
 * cannot export it for a test without tripping Next's route-export validation.
 * Here it is a plain module, so `tests/unit/listing-patch-schema.test.ts` can
 * exercise the exact code the route runs — rather than a copy of it that can
 * drift.
 */

/**
 * Fields a landlord must never set on their own listing.
 *
 * `verified` is the trust badge the whole product rests on: it drives the
 * Verified chip, inclusion in the `verifiedOnly` filter, and a term in the
 * search ranking (`getActiveListings`). `visited` claims a human went to the
 * property. Both are assertions Easy Rent makes ABOUT a landlord, so the
 * landlord cannot be the one making them.
 */
export const TRUST_FIELDS = ['verified', 'visited', 'verifiedAt', 'visitedAt'] as const;

/**
 * The request body was previously destructured raw, with no validation at all.
 *
 * `.strict()` is deliberate: a column added to `listings` later cannot be
 * smuggled through just because someone forgets to gate it. Every in-repo
 * caller sends only these keys, so nothing legitimate is rejected.
 *
 * `verifiedAt` / `visitedAt` / `rejectedAt` are nullable because the ops
 * approval form posts `Date | null` through `JSON.stringify`, which yields an
 * ISO string or null.
 */
export const patchListingSchema = z
  .object({
    status: z
      .enum(['pending', 'active', 'rented', 'archived', 'rejected', 'expired'])
      .optional(),
    verified: z.boolean().optional(),
    visited: z.boolean().optional(),
    verifiedAt: z.string().datetime().nullable().optional(),
    visitedAt: z.string().datetime().nullable().optional(),
    rejectionReason: z.string().max(1000).optional(),
    rejectedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export type PatchListingBody = z.infer<typeof patchListingSchema>;

/**
 * True when the body carries any field only ops/admin may set.
 *
 * Checked INDEPENDENTLY of `status`, which is the bug this fixes. The route's
 * landlord-permission block only engaged when `status !== undefined`, so a body
 * carrying `verified` and no `status` key skipped every permission check and
 * fell through to the apply blocks — which stamped `verifiedBy` with the
 * landlord's own id, producing a self-attested trust badge.
 *
 * Presence is what matters, not truthiness: `verified: false` is still an ops
 * decision, and allowing it would let a landlord strip a badge (or clear
 * `verifiedBy`) on a listing ops had already checked.
 */
export function bodyTouchesTrustFields(body: PatchListingBody): boolean {
  return TRUST_FIELDS.some((field) => body[field] !== undefined);
}
