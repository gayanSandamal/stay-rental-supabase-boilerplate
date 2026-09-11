import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The card's view count renders on six surfaces, three of which are the
 * hottest paths in the product (search, its infinite-scroll API, the homepage
 * strip). The risk is not the number — it is the per-card query that would
 * come with it. `resolveViewTotals` is the set-based answer, mirroring
 * `resolvePublishers`; these tests keep it that way.
 */

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const CARD_SURFACES = [
  'app/(dashboard)/listings/listings-results.tsx',
  'app/(dashboard)/rentals/[area]/area-results.tsx',
  'app/api/listings/paginated/route.ts',
  'components/featured-listings.tsx',
  'components/similar-listings.tsx',
  'app/(dashboard)/[slug]/page.tsx',
];

describe('every card surface resolves view totals set-based', () => {
  it.each(CARD_SURFACES)('%s calls resolveViewTotals once for the page', (surface) => {
    const source = code(surface);
    expect(source).toContain('resolveViewTotals');
    // One call for the whole page. A call inside a .map() is the fan-out.
    expect(source.match(/resolveViewTotals\(/g)?.length).toBe(1);
  });

  it.each(CARD_SURFACES)('%s issues its queries one at a time', (surface) => {
    // Same gate as tests/unit/analytics-gates.test.ts: a max:1 pool behind the
    // transaction pooler wedges on concurrent queries (commit a3ac4f9).
    expect(code(surface)).not.toContain('Promise.all');
  });
});

describe('the view-totals helper', () => {
  const source = code('lib/listings/view-totals.ts');

  it('is server-only — it reads the flag snapshot and the database', () => {
    expect(source).toContain("import 'server-only'");
  });

  it('loads the flag snapshot itself rather than trusting six callers', () => {
    // Two callers are API routes with no root layout to have loaded it; a
    // caller that forgets would read defaults and ignore the kill switch.
    expect(source).toContain('await loadFeatureFlags()');
    expect(source).toContain("isFeatureEnabled('showPublicViewCounts')");
  });

  it('returns nothing at all when the flag is off, so no card renders a count', () => {
    expect(source).toMatch(/isFeatureEnabled\('showPublicViewCounts'\)\) return totals/);
  });

  it('deduplicates website views instead of counting page loads', () => {
    expect(source).toContain('count(distinct');
    expect(source).toMatch(/count\(\*\) filter \(where .*is null\)/);
  });

  it('counts only social posts that are currently live', () => {
    expect(source).toMatch(/eq\(listingSocialPosts\.status, 'posted'\)/);
  });

  it('never lets an unreadable platform stand in as a zero in the total', () => {
    // sum() skips NULLs, so an unknown reading contributes nothing. The coalesce
    // is for a listing with posts but no readings at all, not for a NULL row.
    expect(source).toContain('sum(');
    expect(source).not.toMatch(/viewCount\s*\?\?\s*0/);
  });

  it('degrades to no counts rather than failing the page', () => {
    expect(source).toContain('catch');
    expect(source).toMatch(/return new Map\(\)/);
  });
});

describe('the card renders only a count it was actually given', () => {
  const source = code('components/listing-card.tsx');

  it('renders nothing when no total was supplied', () => {
    // `0` is a real count and must still render; undefined must not become 0.
    expect(source).toContain("typeof total !== 'number'");
    expect(source).toMatch(/return null/);
  });

  it('shows the count in both grid and list view modes', () => {
    expect(source.match(/<ViewCount/g)?.length).toBe(2);
  });

  it('singularises one view', () => {
    expect(source).toMatch(/total === 1 \? 'view' : 'views'/);
  });
});
