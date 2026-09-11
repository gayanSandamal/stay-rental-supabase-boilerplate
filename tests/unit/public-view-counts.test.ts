import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEASURABLE_PLATFORMS, SOCIAL_PLATFORMS } from '@/lib/social/types';
import { facebookPageAdapter } from '@/lib/social/adapters/facebook-page';
import { instagramAdapter } from '@/lib/social/adapters/instagram';
// The TikTok adapter is deliberately NOT imported — it touches the DB at module
// scope for its rotating tokens, which would make this file need DATABASE_URL.
// Its contract is covered by the source scans at the bottom.

/**
 * The public view-count block prints four numbers a landlord will read as a
 * verdict on their advert. Every test here defends one rule: WE NEVER SHOW A
 * NUMBER WE DO NOT HAVE, and we never show zero in its place.
 */

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('measurable platforms', () => {
  it('excludes facebook_group — Meta removed the Groups API in 2024', () => {
    expect(MEASURABLE_PLATFORMS).not.toContain('facebook_group');
  });

  it('covers every other platform we publish to', () => {
    const rest = SOCIAL_PLATFORMS.filter((p) => p !== 'facebook_group');
    expect([...MEASURABLE_PLATFORMS].sort()).toEqual([...rest].sort());
  });

  it('has no metrics reader on the group adapter', async () => {
    const { facebookGroupAdapter } = await import('@/lib/social/adapters/facebook-group');
    // Absence is the contract: the page omits a platform it cannot measure
    // rather than printing a zero for it.
    expect(facebookGroupAdapter.metrics).toBeUndefined();
  });
});

describe('an unconfigured adapter reports unknown, not zero', () => {
  const adapters = [
    ['facebook_page', facebookPageAdapter],
    ['instagram', instagramAdapter],
  ] as const;

  it.each(adapters)('%s refuses to guess with no credentials', async (_name, adapter) => {
    expect(adapter.metrics).toBeDefined();
    const result = await adapter.metrics!('1234_5678');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Permanent: no retry can conjure a credential, so the sweeper must stop.
    expect(result.permanent).toBe(true);
    // The shape carries no `views` at all — there is nothing to mistake for 0.
    expect('views' in result).toBe(false);
  });
});

describe('the refresh sweeper', () => {
  const source = code('lib/social/metrics.ts');

  it('never asks about a post that was never sent', () => {
    expect(source).toContain('DRY_RUN_ID_PREFIX');
    expect(source).toMatch(/not like/);
  });

  it('only reads posts that are currently live', () => {
    expect(source).toMatch(/eq\(listingSocialPosts\.status, 'posted'\)/);
  });

  it('leaves the last good reading in place when a read fails', () => {
    // The failure branch stamps the ask and the error, and must NOT write
    // viewCount — blanking a real number because one call timed out is the
    // same defect as printing 0.
    const unknownAt = source.indexOf('counts.unknown++');
    const failureBranch = source.slice(source.lastIndexOf('await db', unknownAt), unknownAt);
    expect(failureBranch).toContain('metricsError: result.error');
    expect(failureBranch).not.toContain('viewCount:');
  });

  it('stamps the attempt on failure so a dead grant is not retried forever', () => {
    expect(source).toMatch(/set\(\{\s*metricsFetchedAt: now, metricsError: result\.error/);
  });

  it('issues its platform reads one at a time on a max:1 pool', () => {
    expect(source).not.toContain('Promise.all');
  });
});

describe('the public read', () => {
  const source = code('lib/db/queries.ts');
  const breakdown = source.slice(source.indexOf('getListingViewBreakdown'));

  it('counts only live posts', () => {
    expect(breakdown).toMatch(/eq\(listingSocialPosts\.status, 'posted'\)/);
  });

  it('never coerces an unknown reading to zero', () => {
    // `?? null` is the whole point: `?? 0` here is the bug this guards.
    expect(breakdown).toContain('byPlatform.get(platform) ?? null');
    expect(breakdown).not.toContain('viewCount ?? 0');
  });

  it('omits a platform with no live post rather than listing it as zero', () => {
    expect(breakdown).toContain('byPlatform.has(platform)');
  });

  it('queries sequentially, not concurrently', () => {
    expect(breakdown).not.toContain('Promise.all');
  });

  /*
   * Reported 2026-09-11: the website figure climbed on every reload, because
   * this read used `count(*)` — and `listing_views` holds one row per page
   * load BY DESIGN (the write route says so; the landlord analytics need the
   * raw count to report views and people side by side). So the deduplication
   * belongs here, and `count(*)` on this table is a page-load counter that
   * includes the landlord's own refreshes.
   */
  it('deduplicates by visitor-day instead of counting page loads', () => {
    expect(breakdown).toContain('count(distinct');
    expect(breakdown).toContain('listingViews.visitorHash');
    // The raw row count is the defect; it must not come back.
    expect(breakdown).not.toMatch(/drizzleCount\(listingViews\.id\)/);
  });

  it('still counts pre-0046 rows, which carry no hash to dedupe on', () => {
    // count(distinct ...) skips NULLs in Postgres, so legacy rows would vanish
    // from the total without this term — an undercount, not a dedup.
    expect(breakdown).toMatch(/count\(\*\) filter \(where .*is null\)/);
  });
});

describe('the rendered block', () => {
  const source = code('components/listing-view-counts.tsx');

  it('renders a dash for an unknown platform figure', () => {
    expect(source).toContain('value === null');
    expect(source).toContain('—');
  });

  it('labels the four lines the way the listing page promises', () => {
    for (const label of [
      'Website views',
      'Facebook views',
      'Instagram views',
      'TikTok views',
    ]) {
      expect(source).toContain(label);
    }
  });

  it('is gated so it can be switched off without a deploy', () => {
    expect(source).toContain("isFeatureEnabled('showPublicViewCounts')");
    // The gate reads the snapshot, so it has to load it first.
    expect(source).toContain('loadFeatureFlags');
  });
});

describe('Facebook insight metric names track Meta retirements', () => {
  const source = code('lib/social/adapters/facebook-page.ts');

  it('asks for the current metric, not the retired post_impressions family', () => {
    // Measured live 2026-09-11: both old names returned
    // "(#100) The value must be a valid insights metric" against our own Page.
    expect(source).toContain('post_media_view');
    expect(source).not.toMatch(/'post_impressions'/);
    expect(source).not.toMatch(/'post_impressions_unique'/);
  });

  it('keeps the people-counting metric second so a degraded read under-counts', () => {
    const chain = source.slice(source.indexOf('graphInsightValue(remotePostId'));
    expect(chain.indexOf('post_media_view')).toBeLessThan(
      chain.indexOf('post_total_media_view_unique')
    );
  });
});

describe('TikTok needs a read scope it did not used to request', () => {
  it('asks for video.list at connect time', () => {
    const source = code('app/api/social/tiktok/connect/route.ts');
    expect(source).toContain('user.info.basic,video.publish,video.list');
  });

  it('treats a missing scope as permanent so the sweeper backs off', () => {
    const source = code('lib/social/adapters/tiktok.ts');
    const metrics = source.slice(source.indexOf('/video/query/'));
    expect(metrics).toMatch(/scope/);
    expect(metrics).toContain('permanent');
  });
});
