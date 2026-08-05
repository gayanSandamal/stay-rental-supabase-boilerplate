/**
 * Repair listings whose photo manifest does not cover every published photo,
 * and queue them for the automated checks.
 *
 *   pnpm moderation:backfill                 # dry run over every listing
 *   pnpm moderation:backfill --listing 7     # dry run, one listing
 *   pnpm moderation:backfill --commit        # actually write
 *
 * WHY: the moderation engine rewrites `listings.photos` from the manifest. A
 * listing with 8 photos and 1 manifest entry would therefore lose 7 the moment
 * it was checked. Migration 0034 handles rows with NO manifest; this handles the
 * harder merge case, because deciding which URLs are ours needs the same
 * isOwnedUrl / p-vs-o matching the app uses.
 *
 * SAFETY: the UPDATE statement never mentions `photos`, and every row is
 * refused unless the manifest it would write derives byte-identically to the
 * photo list already stored. Photo loss is impossible by construction.
 */

import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { listings } from '../lib/db/schema';
import {
  adoptOrphanPhotos,
  derivePhotos,
  parseManifest,
  parsePhotos,
  serializeManifest,
} from '../lib/images/manifest';

const commit = process.argv.includes('--commit');
const listingArg = process.argv.indexOf('--listing');
const onlyId = listingArg > -1 ? Number(process.argv[listingArg + 1]) : null;

async function main() {
  if (onlyId !== null && !Number.isFinite(onlyId)) {
    console.error('--listing needs a numeric id');
    process.exit(1);
  }

  const rows = await db
    .select({
      id: listings.id,
      status: listings.status,
      moderationStatus: listings.moderationStatus,
      photos: listings.photos,
      photosManifest: listings.photosManifest,
    })
    .from(listings)
    .where(onlyId !== null ? eq(listings.id, onlyId) : isNotNull(listings.photos));

  console.log(`\nPhoto manifest backfill — ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`  ${rows.length} listing(s) in scope\n`);

  let repaired = 0;
  let skipped = 0;
  let refused = 0;

  for (const row of rows) {
    const photos = parsePhotos(row.photos);
    const manifest = parseManifest(row.photosManifest);
    const { entries, adopted } = adoptOrphanPhotos(manifest, photos);

    if (adopted === 0) {
      skipped++;
      continue;
    }

    const derived = derivePhotos(entries);
    // The precondition that makes this safe: what we would publish must equal
    // what is published now, in the same order.
    const identical =
      derived.length === photos.length && derived.every((u, i) => u === photos[i]);

    console.log(
      `#${row.id} (${row.status}/${row.moderationStatus})  photos: ${photos.length} → ${derived.length}  manifest: ${manifest.length} → ${entries.length}  adopted: ${adopted}`
    );
    for (const e of entries) {
      const tail = String(e.o).split('/').pop();
      console.log(`    v=${String(e.v).padEnd(8)} p=${e.p ? 'set' : 'null'}  ${tail}`);
    }

    if (!identical) {
      console.log(`    ✗ REFUSED — derived photo list differs from the stored one, leaving untouched`);
      refused++;
      continue;
    }

    if (commit) {
      // Note: `photos` is deliberately absent from this SET.
      await db
        .update(listings)
        .set({
          photosManifest: serializeManifest(entries),
          moderationStatus: 'queued',
          moderationAttempts: 0,
        })
        .where(eq(listings.id, row.id));
      console.log('    ✓ manifest written, queued for checks');
    } else {
      console.log('    ✓ would write manifest and queue (dry run)');
    }
    repaired++;
  }

  console.log(
    `\n${commit ? 'Repaired' : 'Would repair'}: ${repaired} · already covered: ${skipped} · refused: ${refused}\n`
  );
  if (!commit && repaired > 0) console.log('Re-run with --commit to apply.\n');
  process.exit(refused > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
