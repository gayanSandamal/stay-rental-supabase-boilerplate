import { test, expect } from '@playwright/test';
import { creds, login } from './helpers/auth';

/**
 * Full listing lifecycle — create → edit → approve / reject → delete, plus
 * ownership (IDOR) enforcement. Drives the REAL API handlers via authenticated
 * request contexts (page.request inherits login cookies), so it exercises
 * server-side RBAC + DB writes, not just UI.
 *
 * MUTATES DATA — gated behind ALLOW_MUTATION. Run against local/staging only.
 * Maps to LAUNCH_TEST_PLAN F1/F2/F5/F8/F11, G2/G3.
 *
 * Each created listing is tagged in its title (`E2E Lifecycle …`) so a DB sweep
 * can verify final state and clean up afterwards.
 */
const landlord = creds('landlord');
const admin = creds('admin') ?? creds('ops');

const CONTACT_ID = Number(process.env.LANDLORD_CONTACT_ID ?? 49);
const LANDLORD_ID = Number(process.env.LANDLORD_ID ?? 1);
// A listing owned by a DIFFERENT landlord, for the IDOR probe.
const FOREIGN_ID = Number(process.env.FOREIGN_LISTING_ID ?? 3);

function newListingBody(tag: string) {
  return {
    landlordId: LANDLORD_ID,
    title: `E2E Lifecycle ${tag}`,
    description: 'Created by the automated lifecycle e2e test.',
    propertyType: 'house',
    // Unique address per listing so duplicate-detection (F10) doesn't 409 us.
    address: `42 Test Lane ${tag}`,
    city: 'Colombo',
    district: 'Colombo',
    bedrooms: 2,
    bathrooms: 1,
    rentPerMonth: 75000,
    depositMonths: 2,
    contactNumbers: [CONTACT_ID],
  };
}

const idFrom = (b: any): number | undefined => b?.id ?? b?.listing?.id ?? b?.data?.id;

async function create(page: any, tag: string): Promise<number> {
  const resp = await page.request.post('/api/listings', { data: newListingBody(tag) });
  expect(resp.ok(), `create '${tag}' status ${resp.status()}`).toBeTruthy();
  const id = idFrom(await resp.json());
  expect(id, `create '${tag}' returned id`).toBeTruthy();
  return id!;
}

test.describe.serial('Listing lifecycle (mutating)', () => {
  test.skip(!landlord || !admin, 'LANDLORD_* and ADMIN_*/OPS_* creds required');
  test.skip(!process.env.ALLOW_MUTATION, 'Set ALLOW_MUTATION=1 to run lifecycle mutations');

  let approveId: number;
  let rejectId: number;
  let deleteId: number;

  test('F1/F2 landlord creates a listing (→ pending)', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    approveId = await create(page, `approve ${Date.now()}`);
  });

  test('F5 landlord edits own listing (PUT)', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    const resp = await page.request.put(`/api/listings/${approveId}`, {
      data: { ...newListingBody('approve-edited'), rentPerMonth: 88000 },
    });
    expect(resp.ok(), `edit status ${resp.status()}`).toBeTruthy();
  });

  test('G2 admin/ops approves the listing (→ active)', async ({ page }) => {
    await login(page, admin!.email, admin!.password);
    const resp = await page.request.patch(`/api/listings/${approveId}`, {
      data: { status: 'active' },
    });
    expect(resp.ok(), `approve status ${resp.status()}`).toBeTruthy();
  });

  test('G3 admin/ops rejects a listing with a reason (→ rejected)', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    rejectId = await create(page, `reject ${Date.now()}`);

    await login(page, admin!.email, admin!.password);
    const resp = await page.request.patch(`/api/listings/${rejectId}`, {
      data: { status: 'rejected', rejectionReason: 'e2e: insufficient detail' },
    });
    expect(resp.ok(), `reject status ${resp.status()}`).toBeTruthy();
  });

  test('F8 landlord cannot edit/delete another landlord\'s listing (IDOR)', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    const put = await page.request.put(`/api/listings/${FOREIGN_ID}`, { data: newListingBody('idor') });
    expect([403, 404], `IDOR PUT status ${put.status()}`).toContain(put.status());
    const del = await page.request.delete(`/api/listings/${FOREIGN_ID}`);
    expect([403, 404], `IDOR DELETE status ${del.status()}`).toContain(del.status());
  });

  test('F11 landlord deletes own listing (→ gone)', async ({ page }) => {
    await login(page, landlord!.email, landlord!.password);
    deleteId = await create(page, `delete ${Date.now()}`);
    const resp = await page.request.delete(`/api/listings/${deleteId}`);
    expect(resp.ok(), `delete status ${resp.status()}`).toBeTruthy();
  });
});
