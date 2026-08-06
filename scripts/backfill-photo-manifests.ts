/**
 * Bring existing listings under manifest management.
 *
 * The case migration 0034 deliberately leaves alone: a manifest that EXISTS but
 * under-covers `photos` (listing #7 was 8 photos / 1 entry). Merging those
 * safely needs the app's own isOwnedUrl and `p`-vs-`o` matching, so it is done
 * here through the very same helpers the engine uses — this script adds no
 * manifest logic of its own.
 *
 * SAFETY: the UPDATE never mentions `photos`. Photo loss is impossible by
 * construction, not by care. On top of that, every row must pass a precondition
 * that `derivePhotos(entries)` reproduces the CURRENT `photos` exactly, in
 * order, or it is skipped and reported.
 *
 *   pnpm moderation:backfill                 # dry run over everything
 *   pnpm moderation:backfill --listing 9     # dry run, one listing
 *   pnpm moderation:backfill --commit        # actually write
 */
import dotenv from 'dotenv';
dotenv.config();

import { and, eq, isNotNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import {
  adoptOrphanPhotos,
  derivePhotos,
  parseManifest,
  parsePhotos,
  serializeManifest,
} from '@/lib/images/manifest';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const only = args.includes('--listing') ? Number(args[args.indexOf('--listing') + 1]) : null;

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main() {
  const rows = await db.query.listings.findMany({
    where: only
      ? eq(listings.id, only)
      : and(isNotNull(listings.photos), inArray(listings.status, ['active', 'pending'])),
    columns: { id: true, title: true, status: true, photos: true, photosManifest: true },
  });

  console.log(`${commit ? 'COMMIT' : 'DRY RUN'} — ${rows.length} listing(s) considered\n`);
  let changed = 0;
  let skipped = 0;

  for (const row of rows) {
    const photos = parsePhotos(row.photos);
    const before = parseManifest(row.photosManifest);
    const { entries, adopted } = adoptOrphanPhotos(before, photos);

    if (!adopted) continue;

    const derived = derivePhotos(entries);

    // HARD PRECONDITION. If the manifest we are about to store would not
    // reproduce today's public gallery byte for byte, we do not understand this
    // row and must not touch it.
    if (!sameOrder(derived, photos)) {
      skipped++;
      console.log(`  ✗ #${row.id} "${row.title}" — PRECONDITION FAILED, skipped`);
      console.log(`      photos  (${photos.length}): ${photos.map(short).join(', ')}`);
      console.log(`      derived (${derived.length}): ${derived.map(short).join(', ')}`);
      continue;
    }

    changed++;
    console.log(
      `  ✓ #${row.id} "${row.title}" [${row.status}] — photos: ${photos.length} → ${photos.length}, ` +
        `manifest: ${before.length} → ${entries.length} (+${adopted} adopted), precondition PASS`
    );

    if (commit) {
      // NOTE: `photos` is deliberately absent from this SET.
      await db
        .update(listings)
        .set({ photosManifest: serializeManifest(entries), updatedAt: new Date() })
        .where(eq(listings.id, row.id));
    }
  }

  console.log(
    `\n${changed} listing(s) ${commit ? 'updated' : 'would be updated'}` +
      (skipped ? `, ${skipped} skipped on the precondition` : '')
  );
  if (!commit && changed) console.log('Re-run with --commit to apply.');
  process.exit(0);
}

const short = (u: string) => u.slice(u.lastIndexOf('/') + 1).slice(0, 28);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
