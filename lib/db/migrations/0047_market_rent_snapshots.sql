-- A weekly snapshot of the market: average rent per (city, bedrooms).
--
-- The live rent comparison is a SNAPSHOT, so it can only ever say where a
-- landlord sits today. Storing a weekly one lets us say the thing a snapshot
-- never can — "3BR homes in Nugegoda are up 8% since June, and your rent hasn't
-- moved" — which is the most actionable pricing message available and is
-- impossible to compute from live data alone.
--
-- THIS TABLE'S COST IS ALMOST ENTIRELY WAITING. It has to start being written
-- long before it can be read, which is why the writer ships ahead of anything
-- that consumes it: eight weeks of history cannot be backfilled later.
--
-- sample_size is not bookkeeping. It is what lets a later reader discard a
-- snapshot taken while the market was too thin to mean anything — the same
-- judgement MIN_COMPARABLES_FOR_RENT makes about live data.
--
-- Replay-safe: CREATE TABLE IF NOT EXISTS with no backfill and no UPDATE. The
-- UNIQUE constraint is what makes the weekly job idempotent — a re-run on the
-- same day updates its own row instead of adding a second reading.
--
-- No DO $$ block (see 0040).

CREATE TABLE IF NOT EXISTS market_rent_snapshots (
  id serial PRIMARY KEY,
  city varchar(100) NOT NULL,
  bedrooms integer NOT NULL,
  avg_rent integer NOT NULL,
  median_rent integer,
  sample_size integer NOT NULL,
  captured_on date NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (city, bedrooms, captured_on)
);

-- The read shape: one market, walking backwards in time.
CREATE INDEX IF NOT EXISTS market_rent_snapshots_market_idx
  ON market_rent_snapshots (city, bedrooms, captured_on DESC);

-- Matches 0026: every table in this schema carries RLS.
ALTER TABLE market_rent_snapshots ENABLE ROW LEVEL SECURITY;
