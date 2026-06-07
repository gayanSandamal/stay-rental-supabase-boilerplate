import { test, expect } from '@playwright/test';
import { creds, login } from './helpers/auth';

/**
 * Tenant flows (login-gated). Requires TENANT_EMAIL/TENANT_PASSWORD and a
 * login-capable target. Maps to LAUNCH_TEST_PLAN D4, E1, E2.
 */
const tenant = creds('tenant');

test.describe('Tenant', () => {
  test.skip(!tenant, 'TENANT_EMAIL/TENANT_PASSWORD not set — provide a login-capable target');

  test('D4 sign-in redirects tenant to /listings', async ({ page }) => {
    await login(page, tenant!.email, tenant!.password);
    await expect(page).toHaveURL(/\/listings/);
  });

  test('E1 tenant cannot reach /dashboard', async ({ page }) => {
    await login(page, tenant!.email, tenant!.password);
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/dashboard$/);
  });

  test('E2 tenant cannot reach /back-office', async ({ page }) => {
    await login(page, tenant!.email, tenant!.password);
    await page.goto('/back-office');
    // Must be redirected away (PPR may serve a shell, so assert no back-office UI).
    await expect(page.getByRole('heading', { name: /business accounts|back office|team members/i })).toHaveCount(0);
  });
});
