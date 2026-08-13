-- Sri Lankan places: the location catalogue behind the listing picker, the
-- WhatsApp town matcher and (via lat/lng) radius search.
--
-- The rows are NOT inserted here. 17k inserts in a numbered migration would be
-- replayed on every single `db:migrate-all` run — this file only creates the
-- table, and `pnpm locations:seed` loads the data idempotently.
--
-- `name_lower` is stored rather than computed at query time so the prefix index
-- is usable: the matcher and the picker both search case-insensitively, and
-- lower(name) in a WHERE clause would otherwise force a sequential scan of
-- every row.

CREATE TABLE IF NOT EXISTS locations (
  id serial PRIMARY KEY,
  name varchar(120) NOT NULL,
  name_lower varchar(120) NOT NULL,
  district varchar(50) NOT NULL,
  province varchar(50),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  -- Ranks the picker: "Kotta" should surface Kottawa before a hamlet.
  population integer,
  -- 'curated' entries (aliases, Colombo wards, Sinhala/Tamil forms) are the
  -- hand-tuned list that predates the import and must survive re-seeding;
  -- 'csv' is the bulk gazetteer.
  source varchar(16) NOT NULL DEFAULT 'csv',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- One row per place per district: the source data repeats 1,610 names across
-- districts, and this is what makes the seed re-runnable instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_district_idx
  ON locations (name_lower, district);

-- Prefix search for the type-ahead picker (varchar_pattern_ops makes LIKE 'x%'
-- index-usable regardless of the database's collation).
CREATE INDEX IF NOT EXISTS locations_name_prefix_idx
  ON locations (name_lower varchar_pattern_ops);

CREATE INDEX IF NOT EXISTS locations_district_idx ON locations (district);
-- Ordering the picker by size, biggest first.
CREATE INDEX IF NOT EXISTS locations_population_idx ON locations (population DESC NULLS LAST);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
