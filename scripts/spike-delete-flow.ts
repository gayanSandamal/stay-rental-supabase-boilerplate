/**
 * SPIKE — drives the WhatsApp delete conversation end to end against a running
 * dev server, with real HMAC-signed Cloud API payloads:
 *   "delete" → numbered menu → "1" → "DELETE" → archived
 * Plus the guards: CANCEL, a wrong confirmation word, and redelivery.
 * Creates a throwaway landlord + listing and removes both.
 */
import dotenv from 'dotenv';
dotenv.config();

import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.SPIKE_BASE_URL ?? 'http://localhost:3000';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? 'e2e-app-secret';
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 20 });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let failures = 0;
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => { console.log(`  ✗ ${s}`); failures++; };

const suffix = crypto.randomBytes(4).toString('hex');
const FROM = '94770' + String(Date.now()).slice(-6);
const email = `wa-spike-${suffix}@wa.easyrent.lk`;

const sign = (b: string) => 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(b).digest('hex');
const send = async (text: string, id?: string) => {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: 'Delete Tester' }, wa_id: FROM }],
      messages: [{ from: FROM, id: id ?? `wamid.${crypto.randomBytes(6).toString('hex')}`,
                   type: 'text', timestamp: String(Math.floor(Date.now()/1000)), text: { body: text } }],
    } }] }],
  });
  const r = await fetch(`${BASE}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
    body,
  });
  return r.status;
};

const state = async () => (await sql`
  select state, payload from intake_conversations where from_number = ${FROM}`)[0] ?? null;
const listingStatus = async (id: number) => (await sql`
  select status, archived_at from listings where id = ${id}`)[0] ?? null;

async function main() {
  let authUserId: string | null = null;
  let userId: number | null = null;
  let listingId: number | null = null;
  let landlordId: number | null = null;

  try {
    // --- fixture: a landlord who owns one live listing --------------------
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    authUserId = created.data.user!.id;
    userId = (await sql`select id from users where auth_user_id = ${authUserId}`)[0]?.id;
    await sql`update users set role='landlord', wa_phone=${'+' + FROM}, name='Delete Tester' where id = ${userId}`;
    landlordId = (await sql`insert into landlords (user_id) values (${userId}) returning id`)[0].id;
    listingId = (await sql`
      insert into listings (landlord_id, created_by, title, address, city, district, bedrooms,
                            rent_per_month, property_type, status, published_at)
      values (${landlordId}, ${userId}, ${'Spike Delete Test ' + suffix}, '1 Spike Road', 'Nugegoda',
              'Colombo', 2, 50000, 'house', 'active', now())
      returning id`)[0].id;
    ok(`fixture ready (listing ${listingId}, landlord user ${userId})`);

    // --- 1. a real submission must NOT be read as a command ---------------
    await send('please remove the old furniture, 3 bedroom house at 9 Test Road, Nugegoda 60000 per month');
    (await state())?.state === 'delete_pick'
      ? bad('a listing submission was misread as a delete command')
      : ok('listing content did not trigger the delete flow');

    // --- 2. "delete" opens the numbered menu ------------------------------
    await send('delete');
    const s2 = await state();
    s2?.state === 'delete_pick' ? ok('menu offered (state=delete_pick)') : bad(`expected delete_pick, got ${s2?.state}`);
    const ids = JSON.parse(s2?.payload ?? '{}').ids ?? [];
    ids.includes(listingId) ? ok(`menu contains the listing (${ids.length} option(s))`) : bad(`menu missing listing: ${JSON.stringify(ids)}`);

    // --- 3. a wrong confirmation word cancels, never deletes ---------------
    await send(String(ids.indexOf(listingId) + 1));
    (await state())?.state === 'delete_confirm' ? ok('pick accepted → confirm step') : bad('pick not accepted');
    await send('yes');
    const afterWrong = await listingStatus(listingId!);
    afterWrong?.status === 'active' ? ok('"yes" did NOT delete (ambiguity cancels)') : bad(`"yes" changed status to ${afterWrong?.status}`);
    (await state())?.state === 'idle' ? ok('state cleared after cancel') : bad('state not cleared');

    // --- 4. CANCEL at the pick step ---------------------------------------
    await send('delete');
    await send('cancel');
    (await state())?.state === 'idle' ? ok('CANCEL clears the flow') : bad('cancel did not clear');
    (await listingStatus(listingId!))?.status === 'active' ? ok('still active after cancel') : bad('listing changed on cancel');

    // --- 5. the happy path -------------------------------------------------
    await send('delete');
    const s5 = JSON.parse((await state())?.payload ?? '{}');
    await send(String((s5.ids ?? []).indexOf(listingId) + 1));
    const confirmId = `wamid.confirm.${suffix}`;
    await send('DELETE', confirmId);
    const gone = await listingStatus(listingId!);
    gone?.status === 'archived' ? ok('listing archived') : bad(`expected archived, got ${gone?.status}`);
    gone?.archived_at ? ok('archived_at stamped (purge cron will finish in 30 days)') : bad('archived_at not set');
    (await state())?.state === 'idle' ? ok('state cleared after delete') : bad('state left dirty');

    // --- 6. redelivery of the same DELETE must not archive again -----------
    await sql`update listings set status='active', archived_at=null where id = ${listingId}`;
    await send('DELETE', confirmId);
    (await listingStatus(listingId!))?.status === 'active'
      ? ok('redelivered DELETE ignored (dedup held)')
      : bad('redelivery archived a second time');

    // --- 7. no listings → helpful reply, no crash -------------------------
    await sql`update listings set status='archived' where id = ${listingId}`;
    const st = await send('delete');
    st === 200 ? ok('delete with nothing live returns 200') : bad(`status ${st}`);
    (await state())?.state === 'idle' ? ok('no pending state when there is nothing to delete') : bad('unexpected pending state');
  } catch (e: any) {
    bad(`crashed: ${e.message}`);
  } finally {
    if (listingId) {
      await sql`delete from listing_contact_numbers where listing_id = ${listingId}`.catch(() => {});
      await sql`delete from listings where id = ${listingId}`.catch((e: any) => bad(`listing delete: ${e.message}`));
    }
    await sql`delete from intake_conversations where from_number = ${FROM}`.catch(() => {});
    await sql`delete from whatsapp_intakes where from_number = ${FROM}`.catch(() => {});
    if (userId) {
      await sql`delete from audit_logs where user_id = ${userId}`.catch(() => {});
      await sql`delete from landlord_access_tokens where user_id = ${userId}`.catch(() => {});
      await sql`delete from user_contact_numbers where user_id = ${userId}`.catch(() => {});
      await sql`delete from landlords where user_id = ${userId}`.catch(() => {});
      await sql`delete from users where id = ${userId}`.catch((e: any) => bad(`user delete: ${e.message}`));
    }
    if (authUserId) {
      const d = await admin.auth.admin.deleteUser(authUserId);
      d.error ? bad(`AUTH USER LEFT: ${authUserId}`) : ok('cleaned up');
    }
    const left = await sql`select count(*)::int n from users where email like 'wa-spike-%'`.catch(() => [{ n: -1 }]);
    console.log(`  leftover spike rows: ${left[0].n}`);
    await sql.end().catch(() => {});
  }
  console.log(failures ? `\n${failures} problem(s)\n` : '\nDelete flow verified\n');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
