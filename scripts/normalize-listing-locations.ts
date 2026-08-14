/**
 * Canonicalise city/district on existing listings.
 *
 * The city column is matched with `eq` by the search filter, so any spelling
 * that is not the gazetteer's exact one is permanently unfindable. New writes
 * are normalised at the API and in the intake parser; this brings the rows that
 * predate that into line.
 *
 * Known town  → the gazetteer's spelling, district derived from it.
 * Unknown town → left as it is, apart from tidying, and its district resolved
 *                where one was given. Rejecting small towns is not this
 *                script's call to make (see lib/moderation/location.ts).
 *
 * `updated_at` is deliberately untouched: this is a data repair, not an edit by
 * the landlord, and listing order should not shuffle because of it.
 *
 *   pnpm listings:normalize-locations            # dry run
 *   pnpm listings:normalize-locations --commit   # write
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { normalizeLocation } from '@/lib/intake/parser/gazetteer';

const commit = process.argv.includes('--commit');

async function main() {
  const rows = await db.query.listings.findMany({
    columns: { id: true, title: true, status: true, city: true, district: true },
  });

  console.log(`\n${commit ? 'NORMALISING' : 'DRY RUN — no writes'} · ${rows.length} listing(s)\n`);

  let changed = 0;
  let unknown = 0;

  for (const row of rows) {
    const next = normalizeLocation(row.city, row.district);
    // An empty result would blank a NOT NULL column — skip rather than damage.
    if (!next.city) {
      console.log(`  #${row.id} ⤳ skipped (no city on the row)`);
      continue;
    }
    if (!next.known) unknown++;
    const cityChanged = next.city !== row.city;
    const districtChanged = (next.district ?? null) !== (row.district ?? null);
    if (!cityChanged && !districtChanged) continue;

    changed++;
    const label = next.known ? '' : ' [not in gazetteer]';
    console.log(
      `  #${row.id} ${JSON.stringify(row.city)}/${JSON.stringify(row.district)} → ` +
        `${JSON.stringify(next.city)}/${JSON.stringify(next.district)}${label}`
    );
    if (commit) {
      await db
        .update(listings)
        .set({ city: next.city, district: next.district })
        .where(eq(listings.id, row.id));
    }
  }

  console.log(
    `\n${commit ? 'updated' : 'would update'}: ${changed} · rows whose town is not in the gazetteer: ${unknown}\n`
  );
  if (!commit && changed > 0) console.log('Re-run with --commit to write.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('normalise failed:', err);
  process.exit(1);
});
