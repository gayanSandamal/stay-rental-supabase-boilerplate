-- Full-Text Search (FTS) for listings
-- Uses 'simple' config for Sri Lankan names (Colombo, Kandy, etc.) - no stemming

-- Add tsvector column for FTS (title + address weighted higher, description lower)
ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE("title", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE("address", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE("description", '')), 'B')
  ) STORED;

-- GIN index for fast FTS lookups
CREATE INDEX IF NOT EXISTS "listings_search_vector_idx"
  ON "listings" USING GIN ("search_vector");

-- Materialized view for location suggestions (cities + districts)
-- Small dataset, refreshed periodically - avoids querying millions of listings
DROP MATERIALIZED VIEW IF EXISTS "search_location_suggestions";

CREATE MATERIALIZED VIEW "search_location_suggestions" AS
SELECT 'city' AS kind, "city" AS value, COUNT(*)::int AS listing_count
FROM "listings"
WHERE "status" = 'active'
  AND ("expires_at" IS NULL OR "expires_at" >= NOW())
GROUP BY "city"
UNION ALL
SELECT 'district' AS kind, "district" AS value, COUNT(*)::int AS listing_count
FROM "listings"
WHERE "status" = 'active'
  AND ("expires_at" IS NULL OR "expires_at" >= NOW())
  AND "district" IS NOT NULL
  AND TRIM("district") != ''
GROUP BY "district";

-- Index for fast prefix/contains matching on value (ILIKE)
CREATE UNIQUE INDEX IF NOT EXISTS "search_location_suggestions_kind_value_idx"
  ON "search_location_suggestions" (kind, value);
