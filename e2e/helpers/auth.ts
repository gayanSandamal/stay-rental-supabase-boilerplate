import { Page, expect } from '@playwright/test';

export type SeedRole = 'admin' | 'ops' | 'landlord' | 'tenant';

/** Resolve seed credentials from env. Returns null when not configured. */
export function creds(role: SeedRole): { email: string; password: string } | null {
  const map: Record<SeedRole, [string | undefined, string | undefined]> = {
    admin: [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD],
    ops: [process.env.OPS_EMAIL, process.env.OPS_PASSWORD],
    landlord: [process.env.LANDLORD_EMAIL, process.env.LANDLORD_PASSWORD],
    tenant: [process.env.TENANT_EMAIL, process.env.TENANT_PASSWORD],
  };
  const [email, password] = map[role];
  return email && password ? { email, password } : null;
}

/**
 * Log in via the /sign-in form and wait for the post-login navigation to land.
 * Role-based redirect: tenant -> /listings; landlord/ops/admin -> /dashboard.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => /\/(dashboard|listings)/.test(url.pathname), { timeout: 20_000 }),
    page.getByRole('button', { name: /^sign in$/i }).click(),
  ]);
}

/** Assert we are NOT able to reach a protected path (redirected away). */
export async function expectBlocked(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .not.toMatch(new RegExp(`^${path.replace(/[/\-]/g, '\\$&')}$`));
}
