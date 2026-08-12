/**
 * Re-render published photos through the CURRENT image pipeline.
 *
 * Written for the watermark move (corner → centre, 15% of width), but it is
 * general: any change to processListingImage — placement, size, opacity,
 * compression — needs already-published photos re-rendered, because images are
 * processed exactly once and the manifest records the result.
 *
 * SAFETY: this script never touches the database. `storeDerived` names a
 * derivative after the ORIGINAL's content hash and uploads with upsert, so a
 * re-render of the same original lands on the very same object path. The
 * public URL is unchanged, so `photos` and `photos_manifest` stay correct
 * without being rewritten — only the bytes behind the URL change.
 *
 * That property is also the safety check: before uploading, the path implied by
 * the freshly-computed hash must match the `p` already recorded. If it does not
 * (the stored original changed, or `h` was never recorded), writing would
 * create an orphan object and leave `p` pointing at the old file — so the entry
 * is skipped and reported instead.
 *
 * Rejected entries are left alone: they have no `p`, were never published, and
 * re-rendering them would resurrect a photo moderation deliberately dropped.
 * Moderation is NOT re-run — these images already have verdicts, and a second
 * opinion costs money and could flip them.
 *
 *   pnpm images:rewatermark                 # dry run over everything
 *   pnpm images:rewatermark --listing 12    # dry run, one listing
 *   pnpm images:rewatermark --commit        # actually upload
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { and, eq, isNotNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { parseManifest } from '@/lib/images/manifest';
import { fetchOriginal, hashBytes, storeDerived } from '@/lib/images/store';
import { processListingImage } from '@/lib/images/process';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const only = args.includes('--listing') ? Number(args[args.indexOf('--listing') + 1]) : null;
// Archived listings are not on any public surface, so re-rendering them is
// compute spent on nothing — but a RESTORE brings one back with its old mark,
// so it is offered rather than forbidden. `--listing N` ignores status entirely.
const includeArchived = args.includes('--include-archived');
const STATUSES = includeArchived
  ? (['active', 'pending', 'archived'] as const)
  : (['active', 'pending'] as const);

/** The object path storeDerived would choose for this original. */
function derivedPathFor(listingId: number, contentHash: string): string {
  return `public/${listingId}/${contentHash.slice(0, 12)}-w.webp`;
}

async function main() {
  const rows = await db.query.listings.findMany({
    where: only
      ? eq(listings.id, only)
      : and(isNotNull(listings.photosManifest), inArray(listings.status, [...STATUSES])),
    columns: { id: true, title: true, status: true, photosManifest: true },
  });

  console.log(
    `\n${commit ? 'RE-RENDERING' : 'DRY RUN — no uploads'} · ${rows.length} listing(s)\n`
  );

  let rendered = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const entries = parseManifest(row.photosManifest);
    // Only photos that are actually published carry a derivative to replace.
    const publishable = entries.filter((e) => e.p && e.v !== 'reject');
    if (!publishable.length) continue;

    console.log(`#${row.id} ${row.title ?? ''} [${row.status}] — ${publishable.length} photo(s)`);

    for (const entry of publishable) {
      const original = await fetchOriginal(entry.o);
      if (!original) {
        console.log(`   ✗ original unreachable: ${entry.o.slice(-48)}`);
        failed++;
        continue;
      }

      // The hash decides the object path, so a mismatch means the upload would
      // go somewhere the manifest does not point at.
      const hash = hashBytes(original.buffer);
      const expected = derivedPathFor(row.id, hash);
      if (!entry.p!.endsWith(expected)) {
        console.log(
          `   ⤳ skipped (derived path would move): recorded ${entry.p!.slice(-40)} vs ${expected.slice(-40)}`
        );
        skipped++;
        continue;
      }

      try {
        // `wa` mirrors how the photo was processed the first time: WhatsApp
        // images skip re-compression because Meta already compressed them.
        const processed = await processListingImage(original.buffer, {
          whatsappSourced: entry.wa === true,
        });
        if (!processed.watermarked) {
          console.log(`   ⤳ skipped (too small to watermark): ${entry.p!.slice(-40)}`);
          skipped++;
          continue;
        }
        if (!commit) {
          console.log(
            `   • would re-render ${entry.p!.slice(-40)} (${processed.width}x${processed.height}, ${Math.round(processed.bytes / 1024)}KB)`
          );
          rendered++;
          continue;
        }
        const url = await storeDerived(row.id, hash, processed);
        if (!url) {
          console.log(`   ✗ upload failed: ${entry.p!.slice(-40)}`);
          failed++;
          continue;
        }
        console.log(
          `   ✓ re-rendered ${url.slice(-40)} (${processed.width}x${processed.height}, ${Math.round(processed.bytes / 1024)}KB)`
        );
        rendered++;
      } catch (err) {
        console.log(`   ✗ processing failed: ${(err as Error).message}`);
        failed++;
      }
    }
  }

  console.log(
    `\n${commit ? 're-rendered' : 'would re-render'}: ${rendered} · skipped: ${skipped} · failed: ${failed}`
  );
  if (!commit && rendered > 0) console.log('Re-run with --commit to upload.\n');
  else console.log('');

  // Supabase purges its CDN cache on upsert, but a browser that already fetched
  // a photo holds it for the year the objects are served with. Existing viewers
  // may keep seeing the old mark; new requests get the new one.
  if (commit && rendered > 0) {
    console.log('Note: already-cached browser copies may show the old mark until they expire.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('rewatermark failed:', err);
  process.exit(1);
});
