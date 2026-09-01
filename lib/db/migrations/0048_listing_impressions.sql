-- Search impressions: how many times a listing was SERVED on a results page.
--
-- Impressions plus opens give a click-through rate, and that ratio is what
-- turns every other nudge from vague into diagnostic:
--
--   low impressions              → location, price band or filter problem
--   high impressions, few opens  → photo, title or price problem
--   many opens, no contacts      → description or trust problem
--
-- It is also the only way to show what paid visibility actually bought: not
-- "you got a Boost" but "your listing went from 40 impressions to 300", which
-- is the number that makes a Boost renewable.
--
-- A DAILY ROLLUP, not an event log. Twenty results per search on the busiest
-- query in the product would mean twenty inserts on the critical path of a
-- `max: 1` connection pool. Counts are accumulated in memory and flushed as one
-- upsert per batch — see lib/analytics/impressions.ts.
--
-- The composite PRIMARY KEY is what makes the flush idempotent-ish and cheap:
-- ON CONFLICT … DO UPDATE SET count = count + excluded.count, so a flush adds to
-- the day rather than replacing it, and two instances flushing the same day
-- sum instead of clobbering.
--
-- Replay-safe: CREATE TABLE IF NOT EXISTS, no backfill, no UPDATE.
-- No DO $$ block (see 0040).

CREATE TABLE IF NOT EXISTS listing_impressions (
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, day)
);

-- The read shape: one listing, a window of days. The primary key already
-- covers it, but the analytics page also sums across a whole portfolio for a
-- period, which starts from the day.
CREATE INDEX IF NOT EXISTS listing_impressions_day_idx
  ON listing_impressions (day);

-- Matches 0026: every table in this schema carries RLS.
ALTER TABLE listing_impressions ENABLE ROW LEVEL SECURITY;
