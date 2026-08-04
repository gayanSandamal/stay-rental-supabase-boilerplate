/**
 * SPIKE — throwaway. Proves the passwordless access-link mechanism the
 * WhatsApp edit/delete links depend on:
 *
 *   admin.generateLink({type:'magiclink'})  →  hashed_token   (sends NO email)
 *   POST /auth/v1/verify {type, token_hash} →  a real session
 *
 * Why this matters: the app's only existing link→session path is
 * exchangeCodeForSession (PKCE, app/auth/callback/route.ts), which REQUIRES the
 * code-verifier cookie from the browser that started the flow — so a link
 * pasted in a WhatsApp chat and opened on another device cannot work with it.
 * token_hash verification carries no verifier, which is what makes the link
 * portable across devices.
 *
 * Creates one throwaway auth user and DELETES IT in the finally block.
 *   npx tsx scripts/spike-access-link.ts
 */

import dotenv from 'dotenv';
// .env ONLY. Loading .env.local with override would repoint DATABASE_URL at the
// unrelated local stack on port 54323 (documented footgun) — and this script
// talks to the same project its Supabase URL points at, so they must agree.
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import crypto from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dbUrl = process.env.DATABASE_URL!;

const suffix = crypto.randomBytes(4).toString('hex');
const email = `wa-spike-${suffix}@wa.easyrent.lk`;
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);

async function main() {
  if (!url || !serviceKey) throw new Error('Missing Supabase env');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sql = postgres(dbUrl, { ssl: 'require', max: 1, connect_timeout: 20 });
  let authUserId: string | null = null;
  let failures = 0;

  try {
    console.log(`\nSpike: passwordless access link\n  throwaway account: ${email}\n`);

    // --- 1. create the auth user (no password, email pre-confirmed) --------
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { source: 'whatsapp_intake_spike', wa_phone: '+94770000000' },
    });
    if (created.error || !created.data.user) {
      bad(`createUser failed: ${created.error?.message}`);
      return { failures: 1 };
    }
    authUserId = created.data.user.id;
    ok(`auth user created (${authUserId.slice(0, 8)}…), no password set`);

    // Did the migration-0020 trigger materialise public.users?
    const rows = await sql`select id, email, role from public.users where auth_user_id = ${authUserId}`;
    if (rows.length) ok(`trigger created public.users row (id=${rows[0].id}, role=${rows[0].role})`);
    else bad('no public.users row — the 0020 trigger did not fire');

    // --- 2. generateLink: does it yield a token WITHOUT emailing? ----------
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data?.properties?.hashed_token) {
      bad(`generateLink failed: ${link.error?.message}`);
      failures++;
    } else {
      const hashed = link.data.properties.hashed_token;
      ok(`generateLink returned hashed_token (${hashed.slice(0, 10)}…)`);
      console.log(`    action_link host: ${new URL(link.data.properties.action_link).host}`);

      // --- 3. exchange it for a session, with NO code verifier anywhere ----
      const verify = await fetch(`${url}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: serviceKey },
        body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
      });
      const body: any = await verify.json().catch(() => ({}));

      if (!verify.ok || !body?.access_token) {
        bad(`verify failed (${verify.status}): ${JSON.stringify(body).slice(0, 300)}`);
        failures++;
      } else {
        ok(`verify returned a session (access_token + ${body.refresh_token ? 'refresh_token' : 'NO refresh_token'})`);
        ok(`expires_in: ${body.expires_in}s`);

        // --- 4. is the session actually usable? --------------------------
        const who = await fetch(`${url}/auth/v1/user`, {
          headers: { apikey: serviceKey, authorization: `Bearer ${body.access_token}` },
        });
        const me: any = await who.json().catch(() => ({}));
        if (who.ok && me?.id === authUserId) ok(`session resolves to the right user (${me.email})`);
        else {
          bad(`session did not resolve: ${who.status} ${JSON.stringify(me).slice(0, 200)}`);
          failures++;
        }

        // --- 5. is the token single-use? (affects link reuse design) -----
        const again = await fetch(`${url}/auth/v1/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: serviceKey },
          body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
        });
        console.log(
          `    re-using the same hashed_token: ${again.status} → ${
            again.ok ? 'still valid (reusable)' : 'consumed (single-use)'
          }`
        );
      }
    }
  } finally {
    // --- cleanup: leave production exactly as we found it -----------------
    // Each step is independently guarded: a failure in one must never skip the
    // others, or a throwaway account is left behind on production.
    if (authUserId) {
      await sql`delete from public.users where auth_user_id = ${authUserId}`
        .then(() => ok('public.users row deleted'))
        .catch((e: any) => bad(`public.users delete failed: ${e.message}`));

      await admin.auth.admin
        .deleteUser(authUserId)
        .then(({ error }) =>
          error ? bad(`AUTH USER LEFT BEHIND, delete manually: ${authUserId} (${error.message})`) : ok('auth user deleted')
        )
        .catch((e: any) => bad(`AUTH USER LEFT BEHIND, delete manually: ${authUserId} (${e.message})`));
    }
    await sql`select count(*)::int n from public.users where email like 'wa-spike-%'`
      .then((r: any) => console.log(`  leftover spike rows: ${r[0].n}`))
      .catch(() => {});
    await sql.end().catch(() => {});
  }
  return { failures };
}

main()
  .then(({ failures }) => {
    console.log(failures ? `\n${failures} problem(s).\n` : '\nSpike passed: portable link→session works.\n');
    process.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error('spike crashed:', err);
    process.exit(1);
  });
