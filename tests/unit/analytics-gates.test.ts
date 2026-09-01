import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLandlordPremiumOrAbove, getLandlordPlanTier } from '@/lib/landlord-plans';

/**
 * Defect D1: the analytics page gated on `tier !== 'premium' && tier !== 'agency'`.
 *
 * `premium` is the LEGACY alias. The current tiers are free | starter | pro |
 * agency (basic→starter, premium→pro), so a landlord on `pro` — the present-day
 * name for the tier that includes analytics — was shown the upgrade card
 * instead of their own data. The paying customer was the one locked out.
 */

const landlord = (tier: string) => ({ id: 1, landlordPlanTier: tier });

/**
 * Source scans below read CODE, not prose. Both defects are described at length
 * in the comments of the very files being checked, so an un-stripped scan
 * matches the explanation of the bug and reports the bug as still present.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('analytics access gate', () => {
  it('admits pro — the tier the old string comparison missed', () => {
    expect(isLandlordPremiumOrAbove(landlord('pro'))).toBe(true);
  });

  it('admits the legacy premium alias and agency', () => {
    expect(isLandlordPremiumOrAbove(landlord('premium'))).toBe(true);
    expect(isLandlordPremiumOrAbove(landlord('agency'))).toBe(true);
  });

  it('refuses free and starter', () => {
    expect(isLandlordPremiumOrAbove(landlord('free'))).toBe(false);
    expect(isLandlordPremiumOrAbove(landlord('starter'))).toBe(false);
    expect(isLandlordPremiumOrAbove(landlord('basic'))).toBe(false);
    expect(isLandlordPremiumOrAbove(null)).toBe(false);
  });

  it('refuses a paid tier whose plan has expired', () => {
    const expired = {
      id: 1,
      landlordPlanTier: 'pro',
      landlordPlanExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
    expect(getLandlordPlanTier(expired)).toBe('free');
    expect(isLandlordPremiumOrAbove(expired)).toBe(false);
  });

  it('does not compare plan tier strings in the analytics page itself', () => {
    const source = code('app/(dashboard)/dashboard/analytics/page.tsx');
    // `tier === 'agency'` is legitimate and stays: bulk renewal really is
    // agency-only. A `premium` comparison is the bug and must not come back.
    expect(source).not.toMatch(/tier\s*[!=]==\s*'premium'/);
    expect(source).toContain('isLandlordPremiumOrAbove');
  });
});

/**
 * Defect D2: the analytics page ran a `Promise.all` over the portfolio with a
 * nested `Promise.all` inside each iteration — ~70 concurrent queries for a
 * ten-listing landlord. On Vercel the pool is `max: 1` against Supabase's
 * transaction pooler, and pipelining concurrent queries onto that single
 * PgBouncer-backed connection wedges the request until the platform kills it.
 * Commit a3ac4f9 removed the same pattern from the back office.
 */
describe('no concurrent database fan-out on landlord pages', () => {
  const pages = [
    'app/(dashboard)/dashboard/analytics/page.tsx',
    'app/(dashboard)/dashboard/listings/page.tsx',
    // The same fan-out lived here too — on the public search page and its
    // infinite-scroll API, which are hit far more often than either of the
    // above. All three now share lib/listings/publisher-info.ts.
    'app/(dashboard)/listings/page.tsx',
    'app/api/listings/paginated/route.ts',
  ];

  for (const page of pages) {
    it(`${page} issues its queries one at a time`, () => {
      const source = code(page);
      expect(
        source.includes('Promise.all'),
        `${page} is back to running queries concurrently on a max:1 pool.`
      ).toBe(false);
    });
  }
});
