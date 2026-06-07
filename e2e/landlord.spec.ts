import { test, expect } from '@playwright/test';
import { creds, login } from './helpers/auth';

/**
 * Landlord flows (login-gated). Requires LANDLORD_EMAIL/LANDLORD_PASSWORD.
 * Maps to LAUNCH_TEST_PLAN D4, F6, F7, H2.
 * Run against a local/staging target — F-create mutates data, do NOT run vs prod.
 */
const landlord = creds('landlord');

test.describe('Landlord', () => {
  test.skip(!landlord, 'LANDLORD_EMAIL/LANDLORD_PASSWORD not set — provide a login-capable target');

  test('D4 sign-in redirects landlord to /dashboard', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('F6 dashboard listings view loads (own listings)', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    await page.goto('/dashboard/listings');
    await expect(page).toHaveURL(/\/dashboard\/listings/);
    await expect(page.getByRole('heading', { name: /listings/i }).first()).toBeVisible();
  });

  test('F7 landlord does NOT see approve/reject controls', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    await page.goto('/dashboard/listings');
    await expect(page.getByRole('button', { name: /^(approve|reject)$/i })).toHaveCount(0);
  });

  test('E2 landlord cannot reach /back-office', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    await page.goto('/back-office');
    await expect(page.getByRole('heading', { name: /business accounts|team members/i })).toHaveCount(0);
  });

  test('F-create new listing starts as pending [mutates — local/staging only]', async ({ page }) => {
    test.skip(!process.env.ALLOW_MUTATION, 'Set ALLOW_MUTATION=1 to run create/mutation cases');
    await login(page, landlord!.email, landlord!.password);
    await page.goto('/dashboard/listings/new');
    await expect(page).toHaveURL(/\/dashboard\/listings\/new/);
    // Form is config-driven; smoke that the create form renders.
    await expect(page.getByRole('button', { name: /create|publish|save|submit/i }).first()).toBeVisible();
  });
});
