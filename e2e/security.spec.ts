import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * Security / RBAC — API-level checks via the `request` fixture.
 * Maps to LAUNCH_TEST_PLAN suites A (headers/redirects) and J (RBAC/IDOR/cron).
 *
 * Every case here asserts a REJECTION (401/403) or a header — no mutation ever
 * succeeds — so this whole file is SAFE to run against prod as well as staging.
 * The deterministic gold of the suite: it needs no seed data and no login.
 */

const CRON_PATHS = [
  '/api/cron/saved-search-alerts',
  '/api/cron/refresh-suggestions',
];

const VISIBILITY_ACTIONS = ['boost', 'feature', 'urgent', 'bundle'];

test.describe('Security / RBAC (API)', () => {
  test('J1 cron endpoints fail closed without a bearer token', async ({ request }) => {
    for (const path of CRON_PATHS) {
      const noAuth = await request.get(path);
      expect(noAuth.status(), `${path} with no auth`).toBe(401);

      const wrongAuth = await request.get(path, {
        headers: { authorization: 'Bearer definitely-not-the-secret' },
      });
      expect(wrongAuth.status(), `${path} with wrong bearer`).toBe(401);
    }
  });

  test('J9 authenticated-only API rejects anonymous writes', async ({ request }) => {
    // Creating a listing requires a session — anonymous POST must be 401.
    const resp = await request.post('/api/listings', {
      data: { title: 'e2e-anon', city: 'Colombo', rent: 50000 },
    });
    expect(resp.status()).toBe(401);
  });

  test('J2/H2 visibility activation is not reachable anonymously', async ({ request }) => {
    // A landlord cannot self-activate (403) and an anonymous caller has no
    // session (401). Either way activation must NOT succeed (no 2xx).
    // Use a syntactically-valid but unowned id; the auth/role gate fires first.
    for (const action of VISIBILITY_ACTIONS) {
      const resp = await request.post(`/api/listings/00000000-0000-0000-0000-000000000000/${action}`);
      expect([401, 403], `anon POST ${action}`).toContain(resp.status());
    }
  });

  test('A6 baseline security headers are present', async ({ request }) => {
    const resp = await request.get('/');
    const headers = resp.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeTruthy();
    expect(headers['referrer-policy']).toBeTruthy();
    expect(headers['content-security-policy']).toContain('frame-ancestors');
  });
});

test.describe('Security (infra)', () => {
  // These probe the deployed host directly, independent of the app baseURL,
  // so they only run when explicitly pointed at a real https host.
  const target = process.env.BASE_URL ?? '';
  test.skip(!/^https:\/\//.test(target), 'BASE_URL is not an https host — infra checks skipped');

  test('A5 http → https redirect', async () => {
    const httpUrl = target.replace(/^https:/, 'http:');
    const ctx = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
    const resp = await ctx.get(httpUrl, { maxRedirects: 0 }).catch(() => null);
    await ctx.dispose();
    // Some hosts (Cloudflare) answer on http with a 301/308 to https.
    if (resp) expect([301, 302, 307, 308]).toContain(resp.status());
  });
});
