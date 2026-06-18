import { test, expect } from '@playwright/test';

/**
 * SEO & crawlability — read-only, SAFE against prod.
 * Maps to LAUNCH_TEST_PLAN suite B (robots, sitemap, metadata, noindex).
 */

test.describe('SEO & crawlability', () => {
  test('B1 robots.txt allows public, disallows private areas', async ({ request }) => {
    const resp = await request.get('/robots.txt');
    expect(resp.status()).toBe(200);
    const body = await resp.text();
    expect(body).toMatch(/Disallow:\s*\/dashboard/i);
    expect(body).toMatch(/Disallow:\s*\/back-office/i);
    expect(body).toMatch(/Disallow:\s*\/api/i);

    // No catch-all `Disallow: /` under the `User-Agent: *` group. Scope this to
    // the `*` block only — Cloudflare injects per-bot AI blockers (GPTBot,
    // meta-externalagent → Disallow: /) which are intentional, not a site-wide ban.
    const lines = body.split('\n').map((l) => l.trim());
    const starIdx = lines.findIndex((l) => /^user-agent:\s*\*/i.test(l));
    expect(starIdx, 'robots.txt has a `User-Agent: *` group').toBeGreaterThanOrEqual(0);
    const nextGroupIdx = lines.findIndex(
      (l, i) => i > starIdx && /^user-agent:/i.test(l)
    );
    const starGroup = lines.slice(starIdx, nextGroupIdx === -1 ? undefined : nextGroupIdx);
    expect(starGroup.some((l) => /^disallow:\s*\/\s*$/i.test(l))).toBe(false);
  });

  test('B2 sitemap.xml is valid and includes core routes', async ({ request }) => {
    const resp = await request.get('/sitemap.xml');
    expect(resp.status()).toBe(200);
    const body = await resp.text();
    expect(body).toContain('<urlset');
    expect(body).toMatch(/<loc>[^<]*\/listings<\/loc>/);
    expect(body).toMatch(/<loc>[^<]*\/list-your-property<\/loc>/);
  });

  test('B3 root metadata: title template, canonical, OpenGraph', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Easy Rent/i);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });

  test('B5 auth pages are noindexed', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up']) {
      await page.goto(path);
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute('content', /noindex/i);
    }
  });

  test('B6 dynamic OpenGraph image renders', async ({ request }) => {
    const resp = await request.get('/opengraph-image');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toMatch(/image\//);
  });
});
