import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for Easy Rent.
 *
 * Target is parameterized so the same specs run against prod (read-only public
 * flows), a staging/preview deploy, or a local dev server:
 *
 *   BASE_URL=http://localhost:3000 pnpm exec playwright test         # local
 *   BASE_URL=https://easyrent.lk   pnpm exec playwright test public  # prod, public only
 *
 * Login-gated specs read seed credentials from env and skip themselves when
 * the creds (or a login-capable target) are absent:
 *   ADMIN_EMAIL / ADMIN_PASSWORD, OPS_EMAIL / OPS_PASSWORD,
 *   LANDLORD_EMAIL / LANDLORD_PASSWORD, TENANT_EMAIL / TENANT_PASSWORD
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://easyrent.lk',
    headless: true,
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'off',
    // A realistic UA/viewport to avoid being treated as a bot by Cloudflare.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
