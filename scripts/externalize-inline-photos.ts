/**
 * Move photos stored INLINE (base64 `data:` URLs) into the property-images
 * bucket and point the listing at the hosted copies.
 *
 * Why: see lib/images/photo-urls.ts. Listings 48 (6 of 6 photos) and 42 (3 of
 * 6) carried their photos inline, which made /listings an 8.4 MB page. The
 * search path now hides inline photos, so until this runs those listings show
 * only their hosted photos (none, for 48).
 *
 * What it changes, per listing that has any `data:` photo:
 *   - uploads each distinct inline image to
 *     `public/<listingId>/inline-<sha256[:16]>.<ext>` (content-addressed, upsert,
 *     so a re-run lands on the same objects instead of duplicating them);
 *   - rewrites `photos` and the manifest's `o` / `p` fields with the hosted URL,
 *     keeping order, verdicts and every other manifest field untouched;
 *   - writes only if `photos` and `photos_manifest` are still what it read
 *     (a landlord editing at the same moment wins, and the row is reported).
 *
 * The images are not re-encoded or watermarked — they are the bytes the
 * landlord's browser produced, moved, not processed. Moderation is not re-run.
 *
 *   pnpm images:externalize-inline                 # dry run, every listing
 *   pnpm images:externalize-inline --listing 48    # dry run, one listing
 *   pnpm images:externalize-inline --commit        # upload + rewrite
 *
 * Needs DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for
 * the environment being repaired. Note `.env.local` points at the LOCAL database.
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: false });

import crypto from 'crypto';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { db, client } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { parseManifest, parsePhotos, serializeManifest } from '@/lib/images/manifest';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const only = args.includes('--listing') ? Number(args[args.indexOf('--listing') + 1]) : null;

const DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,/;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function decode(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  const buffer = Buffer.from(dataUrl.slice(m[0].length), 'base64');
  return buffer.length ? { buffer, contentType } : null;
}

async function host(listingId: number, dataUrl: string): Promise<string> {
  const decoded = decode(dataUrl);
  if (!decoded) throw new Error('not a base64 image data URL');
  const hash = crypto.createHash('sha256').update(decoded.buffer).digest('hex').slice(0, 16);
  const path = `public/${listingId}/inline-${hash}.${EXT[decoded.contentType]}`;
  if (!commit) return `(would upload ${Math.round(decoded.buffer.length / 1024)}KB → ${path})`;
  const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(path, decoded.buffer, {
    contentType: decoded.contentType,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function main() {
  const rows = await db
    .select({
      id: listings.id,
      status: listings.status,
      photos: listings.photos,
      photosManifest: listings.photosManifest,
    })
    .from(listings)
    .where(
      and(
        only ? eq(listings.id, only) : sql`true`,
        or(like(listings.photos, '%data:image%'), like(listings.photosManifest, '%data:image%'))
      )
    );

  console.log(`\n${commit ? 'REPAIRING' : 'DRY RUN — nothing uploaded or written'} · ${rows.length} listing(s)\n`);
  let repaired = 0;
  let failed = 0;

  for (const row of rows) {
    const photos = parsePhotos(row.photos);
    const manifest = parseManifest(row.photosManifest);
    const inline = new Set<string>();
    for (const p of photos) if (p.startsWith('data:')) inline.add(p);
    for (const e of manifest) {
      if (e.o?.startsWith('data:')) inline.add(e.o);
      if (e.p?.startsWith('data:')) inline.add(e.p);
    }
    console.log(`#${row.id} [${row.status}] — ${inline.size} inline image(s)`);

    try {
      const hosted = new Map<string, string>();
      for (const dataUrl of inline) {
        const url = await host(row.id, dataUrl);
        hosted.set(dataUrl, url);
        console.log(`   ${commit ? '✓' : '•'} ${url}`);
      }
      const swap = (u: string | null | undefined) => (u && hosted.get(u)) ?? u;
      const nextPhotos = photos.map((p) => swap(p) as string);
      const nextManifest = manifest.map((e) => ({ ...e, o: swap(e.o) as string, p: swap(e.p) ?? e.p }));

      if (!commit) {
        repaired++;
        continue;
      }
      const updated = await db
        .update(listings)
        .set({
          photos: nextPhotos.length ? JSON.stringify(nextPhotos) : null,
          photosManifest: serializeManifest(nextManifest),
        })
        .where(
          and(
            eq(listings.id, row.id),
            row.photos === null ? sql`${listings.photos} is null` : eq(listings.photos, row.photos),
            row.photosManifest === null
              ? sql`${listings.photosManifest} is null`
              : eq(listings.photosManifest, row.photosManifest)
          )
        )
        .returning({ id: listings.id });
      if (updated.length === 0) {
        console.log('   ✗ photos changed while this ran — not written; re-run to pick it up');
        failed++;
      } else {
        repaired++;
      }
    } catch (err) {
      console.log(`   ✗ ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n${commit ? 'repaired' : 'would repair'}: ${repaired} · failed: ${failed}`);
  if (!commit && repaired > 0) console.log('Re-run with --commit to upload and rewrite.\n');
  await client.end();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await client.end().catch(() => {});
  process.exit(1);
});
