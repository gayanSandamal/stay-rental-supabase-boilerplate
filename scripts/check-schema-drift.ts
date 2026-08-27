import { getTableConfig } from 'drizzle-orm/pg-core';
import { client } from '../lib/db/drizzle';
import * as schema from '../lib/db/schema';

/**
 * Compare what `lib/db/schema.ts` declares against what the database actually
 * has, and fail if the code expects something that is not there.
 *
 * This is the check that was missing on 2026-08-22, when four columns were
 * added to `listings` and deployed before `db:migrate-all` had run. Drizzle's
 * relational queries name every column explicitly, so a column that exists in
 * `schema.ts` but not in the database does not degrade the new feature — it
 * takes down *every read of that table*. A feature flag does not protect you,
 * because the ORM emits the column list whether the flag is on or not.
 *
 * The same gap hid an untracked `0044_social_manual_takedown.sql`: the columns
 * were declared in `schema.ts` and absent from production, and nothing said so.
 *
 * Run it against production BEFORE a deploy, and after `db:migrate-all`:
 *
 *     pnpm db:check-drift
 *
 * Direction is deliberate. It reports columns the CODE needs and the DATABASE
 * lacks — the direction that causes outages. Extra columns in the database are
 * ignored: dropping them is destructive and the migrations are replay-safe by
 * never dropping anything, so leftovers are expected and harmless.
 */
async function main() {
  const target = process.env.DATABASE_URL ?? '';
  const host = target.replace(/^.*@/, '').replace(/\/.*$/, '') || '(unknown)';
  console.log(`Checking schema.ts against ${host}\n`);

  const expectedTables = new Map<string, Set<string>>();
  for (const value of Object.values(schema as Record<string, unknown>)) {
    let config;
    try {
      config = getTableConfig(value as never);
    } catch {
      continue; // not a pgTable — enums, relations, types
    }
    expectedTables.set(config.name, new Set(config.columns.map((c) => c.name)));
  }

  const columnRows = await client<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
  `;
  const actualTables = new Map<string, Set<string>>();
  for (const row of columnRows) {
    if (!actualTables.has(row.table_name)) actualTables.set(row.table_name, new Set());
    actualTables.get(row.table_name)!.add(row.column_name);
  }

  const problems: string[] = [];

  for (const [table, columns] of [...expectedTables].sort(([a], [b]) => a.localeCompare(b))) {
    const actual = actualTables.get(table);
    if (!actual) {
      problems.push(`TABLE MISSING: ${table} — every read of it will fail`);
      continue;
    }
    const missing = [...columns].filter((c) => !actual.has(c)).sort();
    if (missing.length > 0) {
      problems.push(`${table}: missing ${missing.join(', ')}`);
    }
  }

  // Enum values matter as much as columns: inserting a label the type does not
  // have is a runtime error, and `audit_action` gains values regularly.
  const enumRows = await client<{ typname: string; enumlabel: string }[]>`
    SELECT t.typname, e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
  `;
  const actualEnums = new Map<string, Set<string>>();
  for (const row of enumRows) {
    if (!actualEnums.has(row.typname)) actualEnums.set(row.typname, new Set());
    actualEnums.get(row.typname)!.add(row.enumlabel);
  }

  for (const value of Object.values(schema as Record<string, unknown>)) {
    const candidate = value as { enumName?: string; enumValues?: readonly string[] };
    if (!candidate?.enumName || !Array.isArray(candidate.enumValues)) continue;
    const actual = actualEnums.get(candidate.enumName);
    if (!actual) {
      problems.push(`ENUM MISSING: ${candidate.enumName}`);
      continue;
    }
    const missing = candidate.enumValues.filter((v) => !actual.has(v));
    if (missing.length > 0) {
      problems.push(`enum ${candidate.enumName}: missing ${missing.join(', ')}`);
    }
  }

  if (problems.length === 0) {
    console.log(`✅ No drift. ${expectedTables.size} tables checked.\n`);
    process.exit(0);
  }

  console.error('❌ The code expects things the database does not have:\n');
  for (const p of problems) console.error(`   ✗ ${p}`);
  console.error('\n   Run `pnpm db:migrate-all` against this database BEFORE deploying.');
  console.error('   Deploying first turns every read of these tables into a 500.\n');
  process.exit(1);
}

main().catch((error) => {
  console.error('Drift check failed to run:', error);
  process.exit(1);
});
