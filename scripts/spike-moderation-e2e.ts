/**
 * SPIKE — the whole automated-approval pipeline on one real listing, with the
 * live provider and real photos: queue → text checks → image checks →
 * compress + watermark → publish. Enables the flags in the DB for the run and
 * restores them afterwards. Cleans up its fixture.
 */
import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import crypto from 'node:crypto';

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 20 });
const BASE = process.env.SPIKE_BASE_URL ?? 'http://localhost:3000';
let failures = 0;
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => { console.log(`  ✗ ${s}`); failures++; };

const FLAGS = ['enableListingModeration', 'moderateImages', 'moderateTextCoherence', 'enableImageProcessing', 'watermarkListingImages'];

async function main() {
  const suffix = crypto.randomBytes(3).toString('hex');
  let listingId: number | null = null;
  const priorFlags: Record<string, string | null> = {};

  try {
    // real photos already in storage, from the live Kandy listing
    const photos: string[] = (await sql`select photos from listings where id = 3`)[0]?.photos
      ? JSON.parse((await sql`select photos from listings where id = 3`)[0].photos)
      : [];
    if (photos.length < 2) throw new Error('need >=2 real photos from listing 3');

    // fixture listing owned by the ops landlord, queued for moderation
    const landlordId = (await sql`select id from landlords order by id limit 1`)[0].id;
    listingId = (await sql`
      insert into listings (landlord_id, title, description, address, city, district, bedrooms,
                            bathrooms, rent_per_month, property_type, status, photos,
                            photos_manifest, moderation_status)
      values (${landlordId}, ${'3BR House in Kandy ' + suffix},
              ${'Spacious three bedroom house for rent in Kandy with parking, hot water and a garden. Rent 95,000 per month.'},
              ${'44 Spike Lane ' + suffix}, 'Kandy', 'Kandy', 3, 2, 95000, 'house', 'pending',
              ${JSON.stringify(photos.slice(0, 2))},
              ${JSON.stringify(photos.slice(0, 2).map((o) => ({ o, p: null, h: null, v: 'queued', wa: true })))},
              'queued')
      returning id`)[0].id;
    ok(`fixture listing ${listingId} queued with ${photos.slice(0,2).length} real photos`);

    // enable the flags for this run
    for (const f of FLAGS) {
      const row = (await sql`select value from feature_flags where key = ${f}`)[0];
      priorFlags[f] = row ? row.value : null;
      await sql`insert into feature_flags (key, value, updated_at) values (${f}, 'true', now())
                on conflict (key) do update set value='true', updated_at=now()`;
    }
    ok('moderation flags enabled for the run');

    // run the sweeper
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/cron/moderate-listings`, {
      headers: { authorization: 'Bearer dev-secret' },
    });
    const body: any = await res.json();
    console.log(`    cron → ${JSON.stringify(body)} in ${Date.now() - t0}ms`);
    res.ok ? ok('sweeper ran') : bad(`sweeper failed: ${res.status}`);

    const after = (await sql`
      select status, moderation_status, moderation_summary, moderation_language,
             photos, photos_manifest, published_at, expires_at
      from listings where id = ${listingId}`)[0];

    console.log(`    status=${after.status} moderation=${after.moderation_status} lang=${after.moderation_language}`);
    console.log(`    summary: ${after.moderation_summary}`);

    after.moderation_status === 'passed' ? ok('checks passed') : bad(`expected passed, got ${after.moderation_status}`);
    after.status === 'active' ? ok('listing published') : bad(`expected active, got ${after.status}`);
    after.published_at ? ok('publishedAt stamped') : bad('publishedAt missing');
    after.expires_at ? ok('expiresAt stamped') : bad('expiresAt missing');

    const manifest = JSON.parse(after.photos_manifest ?? '[]');
    const published = JSON.parse(after.photos ?? '[]');
    manifest.every((e: any) => e.v === 'pass') ? ok('all real photos passed the image checks') : bad(`verdicts: ${manifest.map((e:any)=>e.v).join(',')}`);
    manifest.every((e: any) => e.h) ? ok('content hashes recorded (cache will make re-checks free)') : bad('missing content hashes');
    published.length === manifest.length ? ok(`${published.length} photo(s) published`) : bad(`published ${published.length} of ${manifest.length}`);
    published.every((u: string) => u.includes('/public/')) ? ok('published URLs are the derived (watermarked) versions') : bad(`not derived: ${published[0]}`);
    published.every((u: string) => u.endsWith('.webp')) ? ok('derived images are WebP') : bad('not webp');

    // the derived file must actually be fetchable and watermarked/compressed
    const head = await fetch(published[0]);
    head.ok ? ok(`derived image served (${head.headers.get('content-type')}, ${head.headers.get('content-length')} bytes)`) : bad(`derived image not served: ${head.status}`);

    // ledger + cache rows
    const led = (await sql`select outcome, images_checked, images_dropped, input_tokens, output_tokens, model from listing_moderations where listing_id = ${listingId} order by id desc limit 1`)[0];
    led ? ok(`ledger row: ${led.outcome}, ${led.images_checked} checked, ${led.images_dropped} dropped, ${led.input_tokens}+${led.output_tokens} tokens, ${led.model}`) : bad('no ledger row');
    const cache = (await sql`select count(*)::int n from image_moderation_cache`)[0].n;
    cache > 0 ? ok(`${cache} image verdict(s) cached`) : bad('cache empty');

    // Re-run with the manifest untouched: already-passed photos must be skipped
    // ENTIRELY (not even a cache lookup) — that is what makes an edit cheap.
    await sql`update listings set moderation_status='queued', moderation_attempts=0 where id = ${listingId}`;
    const t1 = Date.now();
    await fetch(`${BASE}/api/cron/moderate-listings`, { headers: { authorization: 'Bearer dev-secret' } });
    const led2 = (await sql`select images_checked, input_tokens from listing_moderations where listing_id = ${listingId} order by id desc limit 1`)[0];
    led2?.images_checked === 0
      ? ok(`edit re-check skipped all settled photos (${led2.input_tokens} tokens, text only) in ${Date.now() - t1}ms`)
      : bad(`re-check re-examined ${led2?.images_checked} photo(s) unnecessarily`);

    // Now prove the CONTENT CACHE itself: re-queue the same photos (what an ops
    // "restore photo" or a PROMPT_VERSION bump does) — the verdicts must come
    // from the cache rather than the provider.
    const reQueued = JSON.parse(
      (await sql`select photos_manifest from listings where id = ${listingId}`)[0].photos_manifest
    ).map((e: any) => ({ ...e, v: 'queued' }));
    await sql`update listings set photos_manifest=${JSON.stringify(reQueued)},
              moderation_status='queued', moderation_attempts=0 where id = ${listingId}`;
    const t2 = Date.now();
    await fetch(`${BASE}/api/cron/moderate-listings`, { headers: { authorization: 'Bearer dev-secret' } });
    const led3 = (await sql`select images_checked, images_cached from listing_moderations where listing_id = ${listingId} order by id desc limit 1`)[0];
    led3?.images_cached > 0 && led3.images_cached === led3.images_checked
      ? ok(`re-queued photos served from the content cache (${led3.images_cached}/${led3.images_checked}) in ${Date.now() - t2}ms`)
      : bad(`cache not used on re-queue: ${JSON.stringify(led3)}`);
  } catch (e: any) {
    bad(`crashed: ${e.message}`);
  } finally {
    for (const [f, v] of Object.entries(priorFlags)) {
      if (v === null) await sql`delete from feature_flags where key = ${f}`.catch(() => {});
      else await sql`update feature_flags set value=${v} where key=${f}`.catch(() => {});
    }
    ok('flags restored');
    if (listingId) {
      await sql`delete from listing_moderations where listing_id = ${listingId}`.catch(() => {});
      await sql`delete from audit_logs where entity_type='listing' and entity_id=${listingId}`.catch(() => {});
      await sql`delete from listings where id = ${listingId}`.catch((e: any) => bad(`cleanup: ${e.message}`));
      ok('fixture removed');
    }
    await sql.end().catch(() => {});
  }
  console.log(failures ? `\n${failures} problem(s)\n` : '\nFull moderation pipeline verified\n');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
