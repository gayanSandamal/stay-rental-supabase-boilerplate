import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { listingsIndexability } from '@/lib/seo/indexability';
import { areaSlug, listingUrl, absoluteUrl } from '@/lib/seo/urls';
import { isListingAvailable, breadcrumbList, jsonLdHtml } from '@/lib/seo/jsonld';

const LIVE_AREAS = new Set(['kandy', 'colombo']);

function decide(params: Record<string, string>, extra?: { resultCount?: number }) {
  return listingsIndexability({
    params,
    liveAreaCities: LIVE_AREAS,
    resultCount: extra?.resultCount,
  });
}

describe('listings indexability policy', () => {
  it('indexes the bare hub as itself', () => {
    const { canonical, robots } = decide({});
    expect(robots.index).toBe(true);
    expect(canonical).toBe(absoluteUrl('/listings'));
  });

  it('indexes stable low-cardinality facets self-canonically', () => {
    const cases: Record<string, string>[] = [
      { propertyType: 'house' },
      { bedrooms: '3' },
      { propertyType: 'apartment', bedrooms: '2' },
    ];
    for (const params of cases) {
      const { robots } = decide(params);
      expect(robots.index, `${JSON.stringify(params)} should be indexable`).toBe(true);
    }
    expect(decide({ propertyType: 'house' }).canonical).toContain('propertyType=house');
  });

  /*
   * The reason this module exists. `search` is free text, so a self-canonical
   * here is an infinite set of near-identical indexable pages.
   */
  it('never indexes a free-text search, and points it at the hub', () => {
    const { canonical, robots } = decide({ search: 'luxury villa colombo' });
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(true);
    expect(canonical).toBe(absoluteUrl('/listings'));
  });

  it('hands a city filter to its area page when that page is live', () => {
    const { canonical, robots } = decide({ city: 'Kandy' });
    expect(robots.index).toBe(false);
    expect(canonical).toBe(absoluteUrl('/rentals/kandy'));
  });

  /*
   * Canonicalizing at a URL that 404s is worse than not setting one, and area
   * pages only exist above an inventory threshold.
   */
  it('falls back to the hub when the city has no area page', () => {
    const { canonical } = decide({ city: 'Hambantota' });
    expect(canonical).toBe(absoluteUrl('/listings'));
  });

  it('does not index deep filter combinations', () => {
    const { robots, canonical } = decide({
      minPrice: '50000',
      maxPrice: '90000',
      bedrooms: '2',
      parking: 'true',
    });
    expect(robots.index).toBe(false);
    expect(canonical).toBe(absoluteUrl('/listings'));
  });

  it('treats a sort as an ordering, not a page, and strips it', () => {
    const { canonical, robots } = decide({ sortBy: 'price_asc' });
    expect(robots.index).toBe(true);
    expect(canonical).toBe(absoluteUrl('/listings'));
  });

  /*
   * The filter form offers villa/townhouse but no write path can produce them
   * (the create form is house|apartment|room), so those pages can only ever be
   * empty.
   */
  it('refuses to index property types nothing can ever have', () => {
    expect(decide({ propertyType: 'villa' }).robots.index).toBe(false);
    expect(decide({ propertyType: 'townhouse' }).robots.index).toBe(false);
  });

  it('does not index a facet that currently has no results', () => {
    expect(decide({ propertyType: 'room' }, { resultCount: 0 }).robots.index).toBe(false);
    expect(decide({ propertyType: 'room' }, { resultCount: 4 }).robots.index).toBe(true);
  });

  it('always keeps follow, so equity still reaches listing pages', () => {
    const cases: Record<string, string>[] = [
      { search: 'x' },
      { city: 'Kandy' },
      { propertyType: 'villa' },
    ];
    for (const params of cases) {
      expect(decide(params).robots.follow).toBe(true);
    }
  });

  it('is stable: the same filters always produce the same canonical', () => {
    const a = decide({ bedrooms: '2', propertyType: 'house' }).canonical;
    const b = decide({ propertyType: 'house', bedrooms: '2' }).canonical;
    expect(a).toBe(b);
  });
});

describe('seo url helpers', () => {
  it('slugifies Sri Lankan place names', () => {
    expect(areaSlug('Colombo')).toBe('colombo');
    expect(areaSlug('Mount Lavinia')).toBe('mount-lavinia');
    expect(areaSlug('Nuwara Eliya')).toBe('nuwara-eliya');
    expect(areaSlug('Sri Jayewardenepura Kotte')).toBe('sri-jayewardenepura-kotte');
    expect(areaSlug('Colombo 3')).toBe('colombo-3');
  });

  it('never emits leading or trailing separators', () => {
    expect(areaSlug('  Kandy  ')).toBe('kandy');
    expect(areaSlug('--Galle--')).toBe('galle');
  });

  it('builds absolute listing URLs', () => {
    expect(listingUrl(42)).toMatch(/\/listings\/42$/);
    expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x');
  });
});

describe('structured data honesty', () => {
  const base = {
    id: 1,
    title: 'T',
    city: 'Kandy',
    bedrooms: 2,
    rentPerMonth: '50000',
  };

  it('marks only live listings as available', () => {
    expect(isListingAvailable({ ...base, status: 'active', expiresAt: null })).toBe(true);
    expect(isListingAvailable({ ...base, status: 'rented', expiresAt: null })).toBe(false);
    expect(isListingAvailable({ ...base, status: 'archived', expiresAt: null })).toBe(false);
  });

  /*
   * Listings expire 30 days after publish. `status === 'active'` alone left an
   * expired listing advertised as available until somebody archived it.
   */
  it('treats an expired listing as unavailable even while still active', () => {
    const past = new Date(Date.now() - 1000);
    expect(isListingAvailable({ ...base, status: 'active', expiresAt: past })).toBe(false);
  });

  /*
   * JSON-LD is injected with dangerouslySetInnerHTML, so an unescaped `<` in
   * landlord-supplied text can close the script tag and turn listing copy into
   * markup.
   */
  it('escapes < so JSON-LD cannot break out of its script tag', () => {
    const html = jsonLdHtml({ name: '</script><img src=x onerror=alert(1)>' });
    expect(html).not.toContain('</script>');
    expect(html).toContain('\\u003c');
  });

  it('numbers breadcrumb positions from one and absolutises items', () => {
    const crumbs = breadcrumbList([
      { name: 'Home', path: '/' },
      { name: 'Rentals', path: '/rentals' },
    ]) as { itemListElement: Array<{ position: number; item: string }> };
    expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(crumbs.itemListElement[1].item).toMatch(/^https?:\/\/.*\/rentals$/);
  });
});

/**
 * Production regression, 2026-09-07.
 *
 * `/listings` generateMetadata awaited a database call (the eligible-area
 * lookup, to canonicalize `?city=` at its area page). Next runs
 * generateMetadata CONCURRENTLY with the page body, which is already querying
 * — so on the `max: 1` pool behind Supabase's transaction pooler that was a
 * second connection checkout racing the first. The request held its function
 * open to the 300-second ceiling, the RSC stream aborted with "Connection
 * closed", and for a while every route returned a connection failure.
 *
 * Same defect as commit a3ac4f9, and the reason getListingById is
 * request-memoized. These scans read CODE with comments stripped, because the
 * explanation above would otherwise match the pattern it warns about.
 */
describe('no database work on the /listings metadata path', () => {
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const read = (p: string) =>
    stripComments(readFileSync(join(process.cwd(), p), 'utf-8'));

  it('generateMetadata never awaits the eligibility lookup', () => {
    const src = read('app/(dashboard)/listings/page.tsx');
    expect(src).not.toMatch(/await\s+liveAreaCitySlugs/);
    expect(src).not.toMatch(/await\s+eligibleAreas/);
    expect(src).not.toMatch(/await\s+findEligibleArea/);
    expect(src).toContain('cachedLiveAreaNames(');
  });

  /*
   * The synchronous reader is what makes the above safe. If it ever becomes
   * async, the await creeps back in at the call site.
   */
  it('cachedLiveAreaNames stays synchronous and query-free', () => {
    const src = read('lib/seo/area-eligibility.ts');
    const fn = src.slice(src.indexOf('export function cachedLiveAreaNames'));
    expect(fn).toMatch(/export function cachedLiveAreaNames\(\)\s*:\s*ReadonlySet<string>/);
    expect(fn).not.toMatch(/async|await|db\./);
  });
});
