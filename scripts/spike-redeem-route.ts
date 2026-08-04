/**
 * SPIKE — verifies the full /l/<token> redeem path against a locally running
 * dev server pointed at production Supabase: creates a throwaway landlord,
 * mints a real access link, fetches the URL like a browser would, and asserts
 * that session cookies come back and the redirect targets the right page.
 * Cleans up unconditionally.
 */
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { mintAccessLink } from '../lib/auth/access-links';

const BASE = process.env.SPIKE_BASE_URL ?? 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 20 });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => { console.log(`  ✗ ${s}`); failures++; };
let failures = 0;

async function main() {
  const suffix = crypto.randomBytes(4).toString('hex');
  const email = `wa-spike-${suffix}@wa.easyrent.lk`;
  let authUserId: string | null = null;
  let userId: number | null = null;

  try {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    authUserId = created.data.user!.id;
    const rows = await sql`select id from public.users where auth_user_id = ${authUserId}`;
    userId = rows[0]?.id ?? null;
    if (!userId) throw new Error('no public.users row');
    await sql`update public.users set role='landlord', wa_phone=${'+9477' + suffix} where id = ${userId}`;
    ok(`throwaway landlord ready (user ${userId})`);

    const links = await mintAccessLink({ userId, listingId: 3 });
    ok(`minted link (${links.editUrl.replace(/\/l\/[^/]+/, '/l/<token>')})`);

    // 1. bot UA must NOT consume the token or set cookies
    const bot = await fetch(links.dashboardUrl, {
      redirect: 'manual',
      headers: { 'user-agent': 'facebookexternalhit/1.1' },
    });
    bot.status === 200 && !bot.headers.getSetCookie().length
      ? ok('link-preview crawler got a stub, no session')
      : bad(`crawler got ${bot.status} with ${bot.headers.getSetCookie().length} cookie(s)`);

    // 2. a real browser-ish request should be signed in and redirected
    const res = await fetch(`${BASE}${new URL(links.editUrl).pathname}`, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
    });
    const cookies = res.headers.getSetCookie();
    const authCookies = cookies.filter((c) => /^sb-/.test(c));
    console.log(`    status ${res.status} → ${res.headers.get('location')}`);
    res.status === 303 || res.status === 307 ? ok('redirected') : bad(`unexpected status ${res.status}`);
    authCookies.length ? ok(`session cookies set (${authCookies.length})`) : bad('NO session cookies set');
    (res.headers.get('location') ?? '').includes('/dashboard/listings/3/edit')
      ? ok('landed on the edit page')
      : bad(`wrong destination: ${res.headers.get('location')}`);
    res.headers.get('cache-control')?.includes('no-store') ? ok('no-store set') : bad('missing no-store');

    // 3. an unknown token must not sign anyone in
    const bogus = await fetch(`${BASE}/l/${'z'.repeat(43)}`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
    (bogus.headers.get('location') ?? '').includes('/link-expired')
      ? ok('unknown token → link-expired')
      : bad(`unknown token gave ${bogus.status} ${bogus.headers.get('location')}`);

    // 4. reusable: the same link works twice (unlike a Supabase magic link)
    const again = await fetch(`${BASE}${new URL(links.editUrl).pathname}`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
    again.headers.getSetCookie().some((c) => /^sb-/.test(c))
      ? ok('link is reusable — second redemption also signed in')
      : bad('second redemption did NOT sign in (link not reusable)');
  } catch (e: any) {
    bad(`crashed: ${e.message}`);
  } finally {
    if (userId) {
      // Order matters: audit_logs.user_id and landlords.user_id both FK to users
      // with no ON DELETE, so the child rows must go first or the delete fails
      // and leaves a throwaway account on production.
      await sql`delete from audit_logs where user_id = ${userId}`.catch(() => {});
      await sql`delete from landlord_access_tokens where user_id = ${userId}`.catch(() => {});
      await sql`delete from landlords where user_id = ${userId}`.catch(() => {});
      await sql`delete from public.users where id = ${userId}`.catch((e: any) => bad(`user delete: ${e.message}`));
    }
    if (authUserId) {
      const d = await admin.auth.admin.deleteUser(authUserId);
      d.error ? bad(`AUTH USER LEFT: ${authUserId}`) : ok('cleaned up');
    }
    const left = await sql`select count(*)::int n from public.users where email like 'wa-spike-%'`.catch(() => [{ n: -1 }]);
    console.log(`  leftover spike rows: ${left[0].n}`);
    await sql.end().catch(() => {});
  }

  console.log(failures ? `\n${failures} problem(s)\n` : '\nRedeem route verified\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('spike crashed:', e);
  process.exit(1);
});
