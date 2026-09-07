-- 0056 — indexes on the columns area landing pages filter by.
--
-- /rentals/<area> calls getActiveListings({ city }) or ({ district }), which
-- compile to `city = $1` and `district LIKE '%…%'`. Neither column had an index:
-- every area page was a sequential scan of `listings`, on a pool that is
-- `max: 1` and strictly sequential in production. That is fine at today's
-- inventory and gets linearly worse with the growth these pages exist to cause.
--
-- REPLAY SAFETY: `db:migrate-all` re-runs every numbered file on every
-- invocation and there is no applied-migrations ledger, so this must be safe to
-- execute against a populated production database forever. `CREATE INDEX IF NOT
-- EXISTS` is idempotent, creates nothing on a second run and destroys nothing.
--
-- Deliberately NO `DO $$ … $$;` block: splitStatements() in
-- lib/db/run-all-migrations.ts only clears its dollar-block flag on a line that
-- is exactly `$$` or `$$;`, so `END $$;` collapses the remainder of the file
-- into one statement and a later `already exists` aborts the rest silently.
-- Plain IF NOT EXISTS DDL splits correctly.
--
-- NOT `CONCURRENTLY`: the runner executes statements inside an implicit
-- transaction and CREATE INDEX CONCURRENTLY cannot run in one. These tables are
-- small enough that the brief write lock is not a concern; revisit if
-- `listings` ever grows to where it is.

CREATE INDEX IF NOT EXISTS "listings_city_idx" ON "listings" ("city");

CREATE INDEX IF NOT EXISTS "listings_district_idx" ON "listings" ("district");

-- The area pages, the sitemap and search_location_suggestions all ask the same
-- question first: which listings are live? A composite over the two status
-- columns plus the location serves that predicate directly.
CREATE INDEX IF NOT EXISTS "listings_status_expires_city_idx"
  ON "listings" ("status", "expires_at", "city");
