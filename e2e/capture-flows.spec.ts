import { test, expect, Page } from '@playwright/test';
import { creds, login } from './helpers/auth';

/**
 * Documentation capture spec.
 *
 * Drives the renter, landlord and admin/ops flows and writes named, stable
 * screenshots to docs/screenshots/ for docs/USER_ADMIN_FLOWS.md.
 *
 * Run against a SEEDED local stack (rich data + properly-roled accounts):
 *   BASE_URL=http://localhost:3000 \
 *   ADMIN_EMAIL=admin@easyrent.com ADMIN_PASSWORD=admin123 \
 *   LANDLORD_EMAIL=landlord@test.com LANDLORD_PASSWORD=landlord123 \
 *   TENANT_EMAIL=tenant@test.com TENANT_PASSWORD=tenant123 \
 *   ALLOW_MUTATION=1 pnpm exec playwright test e2e/capture-flows.spec.ts --project=desktop
 *
 * Captures are best-effort: a missing optional element is logged and skipped so
 * one absent button never aborts the whole run.
 */

const DIR = 'docs/screenshots';
const MUTATE = !!process.env.ALLOW_MUTATION;

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  console.log(`[SHOT] ${name}`);
}

/** Click a locator if present/visible; log and continue otherwise. */
async function softClick(page: Page, locator: ReturnType<Page['locator']>, label: string): Promise<boolean> {
  try {
    const el = locator.first();
    if (await el.isVisible({ timeout: 3000 })) {
      await el.click();
      return true;
    }
  } catch { /* ignore */ }
  console.log(`[SKIP] ${label} not found`);
  return false;
}

// ─────────────────────────────────────────── Renter / public ──────────────
test.describe('Renter flow', () => {
  test('renter: home → browse → filter → detail → contact', async ({ page }) => {
    await page.goto('/');
    await shot(page, '01-home');

    await page.goto('/listings');
    await expect(page.getByRole('heading', { name: /available rentals/i })).toBeVisible();
    await shot(page, '02-listings-index');

    await page.goto('/listings?city=Colombo');
    await shot(page, '03-listings-filtered');

    // Open the first listing card if any exist.
    const card = page.locator('a[href^="/listings/"]').first();
    if (await card.count()) {
      const href = await card.getAttribute('href');
      await page.goto(href!);
      await shot(page, '04-listing-detail');
      // Reveal/contact controls (Call / WhatsApp / Show number).
      await softClick(page, page.getByRole('button', { name: /show|reveal|contact|call|whatsapp/i }), 'contact reveal');
      await shot(page, '05-listing-contact');
    } else {
      console.log('[SKIP] no listing cards — is the stack seeded?');
    }
  });
});

test.describe('Renter flow (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('renter: listings on mobile', async ({ page }) => {
    await page.goto('/listings');
    await shot(page, '06-listings-mobile');
  });
});

// ─────────────────────────────────────────── Landlord ─────────────────────
const landlord = creds('landlord');
test.describe('Landlord flow', () => {
  test.skip(!landlord, 'LANDLORD_EMAIL/LANDLORD_PASSWORD not set');

  test('landlord: sign-in → dashboard → listings → new → detail', async ({ page }) => {
    await page.goto('/sign-in');
    await shot(page, '10-signin');

    await login(page, landlord!.email, landlord!.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await shot(page, '11-dashboard-overview');

    await page.goto('/dashboard/listings');
    await shot(page, '12-dashboard-listings');

    await page.goto('/dashboard/listings/new');
    await shot(page, '13-new-listing-form');

    // Landlord-side detail view (shows Boost/Featured/Urgent REQUEST buttons).
    // Derive the detail URL from an Edit link (always rendered on each card).
    await page.goto('/dashboard/listings');
    const editLink = page.locator('a[href^="/dashboard/listings/"][href$="/edit"]').first();
    try {
      await editLink.waitFor({ state: 'attached', timeout: 10_000 });
      const href = await editLink.getAttribute('href'); // /dashboard/listings/<id>/edit
      await page.goto(href!.replace(/\/edit$/, ''));
      await shot(page, '14-listing-detail-dashboard');
    } catch {
      console.log('[SKIP] no landlord listing detail link found');
    }
  });
});

// ─────────────────────────────────────────── Admin / Ops ──────────────────
const admin = creds('admin') ?? creds('ops');
test.describe('Admin / Ops flow', () => {
  test.skip(!admin, 'ADMIN_EMAIL/ADMIN_PASSWORD (or OPS_*) not set');

  test('admin: back-office tour', async ({ page }) => {
    await login(page, admin!.email, admin!.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/back-office');
    await expect(page.getByRole('link', { name: /business accounts/i }).first()).toBeVisible();
    await shot(page, '20-backoffice-overview');

    await page.goto('/back-office/business-accounts');
    await shot(page, '21-business-accounts');

    await page.goto('/back-office/business-accounts/new');
    await shot(page, '22-business-account-new');

    await page.goto('/back-office/team-members');
    await shot(page, '23-team-members');

    await page.goto('/back-office/listings');
    await shot(page, '24-backoffice-listings');

    await page.goto('/back-office/settings');
    await shot(page, '25-settings-feature-flags');
  });

  test('admin: listing approval workflow', async ({ page }) => {
    await login(page, admin!.email, admin!.password);

    // Find a listing to view the approval controls on (prefer a pending one).
    await page.goto('/back-office/listings');
    const row = page.locator('a[href^="/dashboard/listings/"], a[href^="/listings/"]').first();
    let detail: string | null = null;
    if (await row.count()) detail = await row.getAttribute('href');

    if (detail) {
      // Normalise to the dashboard detail route where the approval form lives.
      const id = detail.split('/').pop();
      await page.goto(`/dashboard/listings/${id}`);
      await expect(page.getByRole('button', { name: /approve|reject|mark visited/i }).first())
        .toBeVisible({ timeout: 8000 })
        .catch(() => console.log('[SKIP] approval controls not visible on this listing'));
      await shot(page, '26-approval-form');

      // Open (but do not submit) the reject modal to capture it.
      const opened = await softClick(page, page.getByRole('button', { name: /reject listing/i }), 'reject button');
      if (opened) {
        await page.waitForTimeout(500);
        await shot(page, '27-reject-modal');
      }
    } else {
      console.log('[SKIP] no listing found for approval capture');
    }
  });

  test('admin: toggle a feature flag [ALLOW_MUTATION]', async ({ page }) => {
    test.skip(!MUTATE, 'Set ALLOW_MUTATION=1 to capture the toggle interaction');
    await login(page, admin!.email, admin!.password);
    await page.goto('/back-office/settings');
    const toggle = page.getByRole('switch').first();
    if (await toggle.count()) {
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      await page.waitForTimeout(800);
      await shot(page, '28-feature-flag-toggled');
      // revert to leave state unchanged
      await toggle.click();
      console.log(`[INFO] toggled feature flag (was aria-checked=${before}) then reverted`);
    } else {
      console.log('[SKIP] no toggle switch found in settings');
    }
  });
});
