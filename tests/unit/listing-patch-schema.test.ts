import { describe, expect, it } from 'vitest';
import {
  TRUST_FIELDS,
  bodyTouchesTrustFields,
  patchListingSchema,
} from '@/lib/listings/patch-schema';

/**
 * Regression cover for the self-awarded Verified badge.
 *
 * Before this, `PATCH /api/listings/[id]` destructured the body raw and gated
 * only `status`. A landlord could PATCH `{"verified": true}` on their own
 * listing — with NO `status` key, so every permission check was skipped — and
 * receive the trust badge, `verifiedOnly` filter inclusion and the ranking
 * boost, stamped `verifiedBy: <their own id>`.
 */
describe('patchListingSchema', () => {
  it('accepts every body the in-repo callers actually send', () => {
    const callers = [
      { status: 'archived' }, // listing-actions-dropdown, archive-listing-button
      { status: 'pending' }, // request-rereview-button
      { status: 'rejected', rejectionReason: 'Duplicate listing' }, // reject-listing-modal
      // listing-approval-form posts Date | null through JSON.stringify
      { verified: true, verifiedAt: new Date().toISOString() },
      { visited: false, visitedAt: null },
      { status: 'active', verified: true },
    ];

    for (const body of callers) {
      expect(patchListingSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    }
  });

  it('rejects unknown keys, so a new column cannot be smuggled in', () => {
    // The whole point of .strict(): `listings` gains columns regularly, and a
    // future one must not become writable just because nobody gated it.
    for (const body of [
      { landlordId: 999 },
      { status: 'active', featured: true },
      { boostedUntil: '2030-01-01T00:00:00.000Z' },
      { verifiedBy: 1 },
    ]) {
      expect(patchListingSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('rejects a status outside the listing_status enum', () => {
    expect(patchListingSchema.safeParse({ status: 'live' }).success).toBe(false);
    expect(patchListingSchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('rejects a non-boolean verified and a non-date verifiedAt', () => {
    expect(patchListingSchema.safeParse({ verified: 'true' }).success).toBe(false);
    expect(patchListingSchema.safeParse({ verifiedAt: 'yesterday' }).success).toBe(false);
  });
});

describe('bodyTouchesTrustFields', () => {
  it('catches each trust field on its own, with no status present', () => {
    // This is the exact shape of the exploit: no `status` key, so the route's
    // landlord-permission block never engaged.
    expect(bodyTouchesTrustFields({ verified: true })).toBe(true);
    expect(bodyTouchesTrustFields({ visited: true })).toBe(true);
    expect(bodyTouchesTrustFields({ verifiedAt: new Date().toISOString() })).toBe(true);
    expect(bodyTouchesTrustFields({ visitedAt: new Date().toISOString() })).toBe(true);
  });

  it('treats a FALSE trust field as ops-only too', () => {
    // Presence, not truthiness. Letting a landlord send `verified: false` would
    // let them clear a badge (and `verifiedBy`) that ops had already awarded.
    expect(bodyTouchesTrustFields({ verified: false })).toBe(true);
    expect(bodyTouchesTrustFields({ visited: false })).toBe(true);
    expect(bodyTouchesTrustFields({ verifiedAt: null })).toBe(true);
  });

  it('leaves the transitions a landlord is genuinely allowed to make', () => {
    expect(bodyTouchesTrustFields({ status: 'archived' })).toBe(false);
    expect(bodyTouchesTrustFields({ status: 'pending' })).toBe(false);
    expect(bodyTouchesTrustFields({})).toBe(false);
  });

  it('covers every field the route gates on', () => {
    // If someone adds a trust-ish column and forgets it here, this fails loudly.
    expect([...TRUST_FIELDS].sort()).toEqual(
      ['verified', 'verifiedAt', 'visited', 'visitedAt'].sort()
    );

    for (const field of TRUST_FIELDS) {
      const body = patchListingSchema.parse(
        field === 'verified' || field === 'visited'
          ? { [field]: true }
          : { [field]: new Date().toISOString() }
      );
      expect(bodyTouchesTrustFields(body), field).toBe(true);
    }
  });
});
