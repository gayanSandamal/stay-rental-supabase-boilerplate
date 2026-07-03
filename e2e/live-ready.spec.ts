import { test, expect } from '@playwright/test';
import { creds, login } from './helpers/auth';

/**
 * Live-readiness journey — automates the FULL manual test flow through the
 * real UI, end to end, as a brand-new user would experience it:
 *
 *   1. Account creation via /sign-up (fresh unique email)
 *   2. Sign-in → tenant lands on /listings
 *   3. New-listing page auto-creates the landlord record
 *   4. Add a contact number inline + fill the real config-driven form
 *   5. Submit → listing starts `pending`; tenant is auto-upgraded to landlord
 *   6. Ops/admin opens the dashboard detail → "Approve & Activate"
 *      (sets status=active + verified=true) and "Mark as Visited"
 *   7. Listing is publicly visible with verified badge; contact reveal works
 *
 * MUTATES DATA — gated behind ALLOW_MUTATION. Run against local/staging only.
 * Maps to LAUNCH_TEST_PLAN D1, F1, F2, G2 (+ verification badges C6).
 */
const admin = creds('admin') ?? creds('ops');

const RUN = Date.now();
const EMAIL = `e2e.liveready.${RUN}@example.com`;
const PASSWORD = 'e2e-Pass-1234';
const TITLE = `E2E LiveReady 3BR House ${RUN}`;

test.describe.serial('Live-readiness journey (mutating)', () => {
  test.skip(!admin, 'ADMIN_*/OPS_* creds required');
  test.skip(!process.env.ALLOW_MUTATION, 'Set ALLOW_MUTATION=1 to run this journey');

  let listingId: string | undefined;

  test('D1 sign-up with a fresh email → redirected to sign-in', async ({ page }) => {
    await page.goto('/sign-up');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole('button', { name: /^sign up$/i }).click();
    // App redirects new signups to /sign-in (with signed_up banner)
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 });
  });

  test('D4 fresh user signs in as tenant → /listings', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await expect(page).toHaveURL(/\/listings/);
  });

  test('F1 fresh user creates first listing through the real form', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, EMAIL, PASSWORD);

    // Visiting the new-listing page auto-creates the landlord record server-side.
    await page.goto('/dashboard/listings/new');
    await expect(page.getByRole('button', { name: /create listing/i })).toBeVisible();

    // Required basics (config-driven form renders native inputs by name).
    await page.fill('input[name="title"]', TITLE);
    await page.fill('textarea[name="description"]', 'Automated live-readiness journey listing. Spacious, fiber-ready, generator backup.');
    await page.selectOption('select[name="propertyType"]', 'house');
    await page.fill('input[name="bedrooms"]', '3');
    await page.fill('input[name="address"]', `77 LiveReady Lane ${RUN}`);
    await page.fill('input[name="city"]', 'Colombo');
    await page.fill('input[name="rentPerMonth"]', '95000');

    // Add a contact number inline (fresh account has none).
    await page.getByRole('button', { name: /add new contact number/i }).click();
    await page.getByPlaceholder('+94 77 123 4567').fill('+94 77 555 1234');
    await page.getByRole('button', { name: /^add$/i }).click();
    // A "Contact Number Added" dialog pops with manual-verification guidance —
    // dismiss it, otherwise its overlay blocks the submit button.
    await page.getByRole('dialog').getByRole('button', { name: /^ok$/i }).click();
    // The new number auto-selects and renders in the selector list.
    await expect(page.getByText('+94 77 555 1234').first()).toBeVisible({ timeout: 10_000 });

    // Submit; capture the created listing id from the API response.
    const [createResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/listings') && r.request().method() === 'POST',
        { timeout: 20_000 }
      ),
      page.getByRole('button', { name: /create listing/i }).click(),
    ]);
    expect(createResp.ok(), `create listing HTTP ${createResp.status()}`).toBeTruthy();
    const created = await createResp.json();
    listingId = String(created?.id ?? created?.listing?.id);
    expect(listingId, 'listing id from create response').toBeTruthy();

    // Lands on the listings dashboard with the new listing visible.
    await page.waitForURL(/\/dashboard\/listings/, { timeout: 20_000 });
    await expect(page.getByText(TITLE).first()).toBeVisible();
  });

  test('F1b tenant was auto-upgraded to landlord (redirect now → /dashboard)', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('F2 listing starts pending and is NOT publicly visible', async ({ page }) => {
    // NOTE: the page/meta echoes the search query back, so match listing CARD
    // LINKS, not raw text — a pending listing must produce no card and its
    // detail page must 404 anonymously.
    await page.goto('/listings?search=' + encodeURIComponent(TITLE));
    await expect(page.locator('a[href^="/listings/"]', { hasText: TITLE })).toHaveCount(0);
    await expect(page.getByText(/no listings found/i).first()).toBeVisible();
  });

  test('G2 ops approves & verifies via the dashboard UI', async ({ page }) => {
    test.setTimeout(90_000);
    expect(listingId, 'listing id captured from create step').toBeTruthy();
    await login(page, admin!.email, admin!.password);

    // Admin sees the pending listing in the dashboard with a Review action.
    await page.goto('/dashboard/listings?status=pending');
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 10_000 });

    // Open its review page directly and approve.
    await page.goto(`/dashboard/listings/${listingId}`);
    // Approve; assert on the PATCH response (page has multiple selects, so
    // DOM state is ambiguous — the API result is the ground truth here).
    const [patchResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/listings/${listingId}`) && r.request().method() === 'PATCH',
        { timeout: 15_000 }
      ),
      page.getByRole('button', { name: /approve & activate/i }).click(),
    ]);
    expect(patchResp.ok(), `approve PATCH HTTP ${patchResp.status()}`).toBeTruthy();
    const visitBtn = page.getByRole('button', { name: /mark as visited/i });
    if (await visitBtn.count()) await visitBtn.click();
  });

  test('C5/C6 listing is now publicly live with verified badge + contact', async ({ page }) => {
    expect(listingId, 'listing id captured from approval step').toBeTruthy();
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByText(TITLE).first()).toBeVisible();
    // Verified badge from the approval, LKR rent, and the contact number.
    await expect(page.getByText(/verified/i).first()).toBeVisible();
    await expect(page.getByText(/95,?000/).first()).toBeVisible();
    await expect(page.getByText(/\+94 77 555 1234/).first()).toBeVisible();
  });
});
