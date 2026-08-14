/**
 * Load the Sri Lankan place catalogue into `locations`.
 *
 * MERGES rather than replaces. The CSV is not a superset of the hand-tuned
 * gazetteer: 35 of its 173 towns are absent from the file — Horana, Mount
 * Lavinia, Battaramulla, Ja-Ela, Katunayake, Mirissa and every Colombo ward
 * among them — and some it spells differently ("Weliweriya" for Weliveriya,
 * "Dehiwala-Mount Lavinia" for Mount Lavinia). Seeding the CSV alone would
 * silently drop typo correction for those towns, so curated rows are written
 * first and win any collision.
 *
 * Idempotent: every row is upserted on (name_lower, district), so re-running
 * after the CSV is updated adds and refreshes without duplicating.
 *
 *   pnpm locations:seed              # dry run — counts only
 *   pnpm locations:seed --commit     # write
 */
import dotenv from 'dotenv';
// Only `.env`. Deliberately NOT layering `.env.local` on top the way the
// read-only probe scripts do: it points DATABASE_URL at a local stack belonging
// to a different project, and this script writes 16k rows. Whichever database
// `.env` names is the one that gets them.
dotenv.config();

import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { locations } from '@/lib/db/schema';
import { CITIES, DISTRICTS } from '@/lib/intake/parser/gazetteer';

const commit = process.argv.includes('--commit');
const CSV_PATH = process.argv.includes('--csv')
  ? process.argv[process.argv.indexOf('--csv') + 1]
  : 'sri-lanka-places-full.csv';

/** The source spells one district differently from the rest of the app. */
const DISTRICT_ALIASES: Record<string, string> = {
  moneragala: 'Monaragala',
};

const VALID_DISTRICTS = new Set(DISTRICTS.map((d) => d.toLowerCase()));

function canonicalDistrict(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const aliased = DISTRICT_ALIASES[key];
  if (aliased) return aliased;
  if (!VALID_DISTRICTS.has(key)) return null;
  return DISTRICTS.find((d) => d.toLowerCase() === key) ?? null;
}

interface Row {
  name: string;
  nameLower: string;
  district: string;
  province: string | null;
  latitude: string | null;
  longitude: string | null;
  population: number | null;
  source: 'curated' | 'csv';
}

/** Minimal CSV reader: the file is machine-generated and has no quoted commas. */
function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ''])) as Record<string, string>;
  });
}

function build(): { rows: Row[]; skipped: number } {
  const byKey = new Map<string, Row>();

  // Curated first so a CSV row can never take their slot. These carry the
  // spellings the matcher and existing listings already use.
  for (const city of CITIES) {
    const key = `${city.name.toLowerCase()}|${city.district}`;
    byKey.set(key, {
      name: city.name,
      nameLower: city.name.toLowerCase(),
      district: city.district,
      province: null,
      latitude: null,
      longitude: null,
      population: null,
      source: 'curated',
    });
  }

  let skipped = 0;
  const csv = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  for (const r of csv) {
    const name = (r.city ?? '').trim();
    const district = canonicalDistrict(r.district ?? '');
    // 270 rows in the source have no name or no district, and a place we cannot
    // put in a district is useless to both the picker and the matcher.
    if (!name || !district) {
      skipped++;
      continue;
    }
    const key = `${name.toLowerCase()}|${district}`;
    const existing = byKey.get(key);
    if (existing?.source === 'curated') {
      // Keep the curated row but adopt the coordinates and population the CSV
      // has and it lacks — nothing is lost either way.
      existing.latitude ??= r.lat || null;
      existing.longitude ??= r.lng || null;
      existing.population ??= r.population ? Number(r.population) : null;
      existing.province ??= r.admin_name || null;
      continue;
    }
    const population = r.population ? Number(r.population) : null;
    // The same name recurs across districts (1,610 of them); within ONE district
    // a repeat is a duplicate, so keep whichever row claims more people.
    if (existing && (existing.population ?? -1) >= (population ?? -1)) continue;
    byKey.set(key, {
      name,
      nameLower: name.toLowerCase(),
      district,
      province: r.admin_name || null,
      latitude: r.lat || null,
      longitude: r.lng || null,
      population: Number.isFinite(population) ? population : null,
      source: 'csv',
    });
  }

  return { rows: [...byKey.values()], skipped };
}

async function main() {
  const { rows, skipped } = build();
  const curated = rows.filter((r) => r.source === 'curated').length;

  console.log(`\n${commit ? 'SEEDING' : 'DRY RUN — no writes'}`);
  console.log(`  source file      : ${CSV_PATH}`);
  console.log(`  rows to upsert   : ${rows.length}`);
  console.log(`  ├─ curated       : ${curated}`);
  console.log(`  └─ from csv      : ${rows.length - curated}`);
  console.log(`  skipped (no name/unknown district): ${skipped}\n`);

  if (!commit) {
    console.log('Re-run with --commit to write.\n');
    process.exit(0);
  }

  // Chunked: a single 17k-row insert exceeds the parameter limit.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await db
      .insert(locations)
      .values(batch)
      .onConflictDoUpdate({
        target: [locations.nameLower, locations.district],
        set: {
          name: sql`excluded.name`,
          province: sql`coalesce(excluded.province, ${locations.province})`,
          latitude: sql`coalesce(excluded.latitude, ${locations.latitude})`,
          longitude: sql`coalesce(excluded.longitude, ${locations.longitude})`,
          population: sql`coalesce(excluded.population, ${locations.population})`,
          updatedAt: sql`now()`,
        },
      });
    written += batch.length;
    if (written % 5000 < CHUNK) console.log(`  … ${written}/${rows.length}`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locations);
  console.log(`\n✅ locations now holds ${count} rows.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
