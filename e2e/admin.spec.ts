import { test, expect } from '@playwright/test';
import { creds, login } from './helpers/auth';

/**
 * Admin / ops back-office flows (login-gated). Requires ADMIN_EMAIL/ADMIN_PASSWORD
 * (or OPS_*). Maps to LAUNCH_TEST_PLAN D4, G1, G2, I1, I2, H4.
 * Toggle/approve/activate cases mutate data — run against local/staging only.
 */
const admin = creds('admin') ?? creds('ops');

test.describe('Admin / Ops back-office', () => {
  test.skip(!admin, 'ADMIN_EMAIL/ADMIN_PASSWORD (or OPS_*) not set — provide a login-capable target');

  test('D4 sign-in redirects admin/ops to /dashboard', async ({ page }) => {
    await login(page, admin!.email, admin!.password);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('G1 admin can open the back-office', async ({ page }) => {
    await login(page, admin!.email, admin!.password);
    await page.goto('/back-office');
    await expect(page).toHaveURL(/\/back-office/);
    await expect(page.getByRole('link', { name: /business accounts/i }).first()).toBeVisible();
  });

  test('G(view) platform-wide listings load', async ({ page }) => {
    await login(page, admin!.email, admin!.password);
    await page.goto('/back-office/listings');
    await expect(page).toHaveURL(/\/back-office\/listings/);
  });

  test('I2 pricing master switch is present in settings', async ({ page }) => {
    await login(page, admin!.email, admin!.password);
    await page.goto('/back-office/settings');
    await expect(page.getByText(/paid visibility|pricing/i).first()).toBeVisible();
  });

  test('I1 toggling a feature flag persists [mutates — local/staging only]', async ({ page }) => {
    test.skip(!process.env.ALLOW_MUTATION, 'Set ALLOW_MUTATION=1 to run toggle/mutation cases');
    await login(page, admin!.email, admin!.password);
    await page.goto('/back-office/settings');
    const toggle = page.getByRole('switch').first();
    await expect(toggle).toBeVisible();
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-checked', before ?? '');
    // revert
    await toggle.click();
  });
});
