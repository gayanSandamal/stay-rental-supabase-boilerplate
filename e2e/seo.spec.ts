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

  /*
   * B7 — the soft-404 regression.
   *
   * Every unknown URL on the site returned HTTP 200 (measured on prod
   * 2026-09-07): the root `[slug]` catch-all matches any path, and under PPR
   * the shell is flushed — committing 200 — before `notFound()` runs in the
   * Suspense child. middleware.ts now answers these before the render, so this
   * test is what stops the status quietly reverting.
   */
  test('B7 unknown URLs return a real 404, not a soft 200', async ({ request }) => {
    for (const path of [
      '/this-page-does-not-exist-xyz',
      '/listings/99999999',
      '/listings/not-a-number',
      '/listings/0',
      /*
       * Area pages exist only above an inventory threshold. This one was
       * missed in the first pass and shipped as a soft 200 to production —
       * middleware knew about /listings/<id> and root slugs but not
       * /rentals/<area>.
       */
      '/rentals/definitely-not-a-sri-lankan-town',
    ]) {
      const resp = await request.get(path, { maxRedirects: 0 });
      expect(resp.status(), `${path} must 404`).toBe(404);
    }
  });

  test('B8 real pages still return 200', async ({ request }) => {
    for (const path of ['/', '/listings', '/rentals', '/list-your-property', '/how-to-use']) {
      const resp = await request.get(path);
      expect(resp.status(), `${path} must be reachable`).toBe(200);
    }
  });

  /*
   * B9 — crawl-space containment.
   *
   * `search` is free text, so a self-canonical on filtered /listings URLs meant
   * an unbounded set of near-identical indexable pages. lib/seo/indexability.ts
   * owns the policy; these are the two ends of it.
   */
  test('B9 filtered listings URLs follow the index policy', async ({ page }) => {
    await page.goto('/listings?search=luxury');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/i
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/listings$/
    );

    // A stable, low-cardinality facet stays indexable and self-canonical.
    await page.goto('/listings?propertyType=house');
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count()) {
      await expect(robots).toHaveAttribute('content', /(?<!no)index/i);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /propertyType=house/
    );
  });

  /*
   * B10 — the root layout applies `template: '%s | Easy Rent'`, so any page
   * that also appends the brand renders it twice. That was live on every
   * filtered /listings view and on /terminal.
   */
  test('B10 titles never double-append the brand', async ({ page }) => {
    for (const path of ['/', '/listings', '/listings?bedrooms=3', '/rentals']) {
      await page.goto(path);
      const title = await page.title();
      const occurrences = title.match(/Easy Rent/gi)?.length ?? 0;
      expect(occurrences, `"${title}" repeats the brand`).toBeLessThanOrEqual(1);
    }
  });

  /*
   * B11 — SECURITY, not SEO. `/l/` serves passwordless landlord access links;
   * an indexed one is a published login URL. Neither the header nor the
   * robots.txt disallow may be dropped.
   */
  test('B11 access links stay noindex', async ({ request }) => {
    const resp = await request.get('/l/not-a-real-token', { maxRedirects: 0 });
    expect(resp.headers()['x-robots-tag']).toMatch(/noindex/i);

    const robotsBody = await (await request.get('/robots.txt')).text();
    expect(robotsBody).toMatch(/Disallow:\s*\/l\//i);
  });

  /*
   * B12 — a sitemap containing 404s stops being trusted as a whole, and area
   * pages appear and disappear with inventory, so this is the pairing most
   * likely to drift.
   */
  /*
   * B13 — lastmod must be a real modification date.
   *
   * Every entry used to carry `new Date()`, so two fetches seconds apart
   * reported different modification times for /privacy-policy. Google USES
   * lastmod (unlike priority and changefreq, which it ignores), and its
   * documented response to a site reporting it unreliably is to stop trusting
   * the field site-wide — so an always-now timestamp spends credibility to
   * convey nothing.
   */
  test('B13 sitemap lastmod is stable across requests', async ({ request }) => {
    const read = async () =>
      [...(await (await request.get('/sitemap.xml')).text()).matchAll(
        /<lastmod>([^<]+)<\/lastmod>/g
      )].map((m) => m[1]);

    const first = await read();
    await new Promise((r) => setTimeout(r, 2000));
    const second = await read();

    expect(second).toEqual(first);
    // And none of them may be "just now".
    for (const stamp of first) {
      const age = Date.now() - new Date(stamp).getTime();
      expect(age, `${stamp} looks like a request timestamp`).toBeGreaterThan(10_000);
    }
  });

  test('B12 every sitemap URL resolves', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);

    // Areas and static routes in full; listings sampled — the set can be large.
    const areaAndStatic = locs.filter((u) => !/\/listings\/\d+$/.test(u));
    const listingSample = locs.filter((u) => /\/listings\/\d+$/.test(u)).slice(0, 10);

    for (const url of [...areaAndStatic, ...listingSample]) {
      const resp = await request.get(new URL(url).pathname || '/');
      expect(resp.status(), `${url} is in the sitemap but does not resolve`).toBe(200);
    }
  });
});
