---
name: add-db-migration
description: >
  Add a database migration to Easy Rent correctly across its DUAL migration
  system. Use whenever you change lib/db/schema.ts or need to add/alter a table,
  column, enum value, index, trigger, or backfill. Prevents the #1 footgun:
  forgetting to register the SQL file so it never runs against Supabase.
---

# Add a database migration

Easy Rent has **two migration systems**. The one that actually runs against Supabase is the **hand-numbered SQL runner**, not `drizzle-kit generate`. Follow every step.

## Steps

1. **Update the Drizzle schema** — edit `lib/db/schema.ts`. Add/alter the table, column, enum, or relation. Keep the `$inferSelect`/`$inferInsert` type exports current. Use existing conventions: snake_case DB names, `timestamp(...)`, `.notNull().default(...)`, `decimal(...)` for LKR money, `references(() => table.id)`.

2. **Find the next migration number** — list `lib/db/migrations/00NN_*.sql`, take the highest (currently `0024`), increment. Name descriptively:
   ```
   lib/db/migrations/0025_add_<thing>.sql
   ```

3. **Write idempotent SQL.** The runner skips errors containing `already exists`, `duplicate`, or `multiple primary keys`, but throws on everything else. Prefer:
   ```sql
   ALTER TABLE listings ADD COLUMN IF NOT EXISTS floor_area integer;
   CREATE TABLE IF NOT EXISTS ...;
   CREATE INDEX IF NOT EXISTS idx_... ON ...;
   ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_renewed';
   ```
   For functions/triggers, use a `DO $$ ... $$;` block — the runner's splitter (`splitStatements` in `run-all-migrations.ts`) understands `$$` bodies. Keep each enum `ADD VALUE` as its own statement (Postgres can't use a new enum value in the same transaction that adds it).

4. **Register the file** in the `MIGRATIONS` array in `lib/db/run-all-migrations.ts`. **This is the step that is most often forgotten — without it the migration never runs.**
   ```ts
   const MIGRATIONS = [
     // ...
     '0024_audit_visibility_actions.sql',
     '0025_add_<thing>.sql',   // <-- add here
   ];
   ```

5. **Apply & verify**:
   ```bash
   pnpm db:migrate-all:local   # local Docker DB
   # or, against the configured DATABASE_URL:
   pnpm db:migrate-all
   ```
   Re-run once to confirm it's idempotent (should print "Skipped (already exists)"). Production `DATABASE_URL` must use the Supabase **transaction pooler (port 6543)**.

6. **Propagate** — update affected queries in `lib/db/queries.ts` and seed data (`lib/db/seed*.ts`) so sample data exercises the new field.

## Checklist before done
- [ ] `schema.ts` updated (table + types)
- [ ] New numbered `.sql` file is idempotent
- [ ] File added to `MIGRATIONS` array
- [ ] Ran `db:migrate-all(:local)` and it succeeded + is idempotent on re-run
- [ ] No hard deletes of live data (this app uses soft deletes)
