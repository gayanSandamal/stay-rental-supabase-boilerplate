import { test } from '@playwright/test';
import { login } from './helpers/auth';

/** Diagnostic: does each documented seed account authenticate on the target,
 *  and what role does it actually have? Read-only (no mutation). */
const accounts: Array<[string, string, string]> = [
  ['tenant', 'tenant@test.com', 'tenant123'],
  ['landlord', 'landlord@test.com', 'landlord123'],
  ['admin', 'admin@easyrent.com', 'admin123'],
  ['ops', 'ops@easyrent.com', 'ops123'],
];

for (const [label, email, password] of accounts) {
  test(`role probe: ${label} (${email})`, async ({ page }) => {
    let landedOn = '(login failed)';
    try {
      await login(page, email, password);
      landedOn = new URL(page.url()).pathname;
    } catch {
      landedOn = `(no redirect) ${new URL(page.url()).pathname}`;
    }
    // Read the authenticated user's real role straight from the API (reuses cookies).
    const res = await page.request.get('/api/user');
    const body = await res.text();
    let role = 'n/a';
    try { role = JSON.parse(body)?.role ?? 'null'; } catch { /* non-json */ }
    console.log(`[PROBE] ${label.padEnd(9)} login->${landedOn.padEnd(22)} /api/user role=${role}`);
  });
}
