-- A per-day visitor hash on listing views, so "views" can be told apart from
-- "people".
--
-- Today two views are indistinguishable from one person twice, and a landlord
-- refreshing their own listing inflates their own numbers. That is credibility
-- work, not vanity work: the moment a landlord notices their own refreshes
-- counted, every other number on the page becomes suspect — including the
-- accurate ones.
--
-- The hash is sha256(ip + user-agent + VIEW_HASH_SALT + yyyy-mm-dd). The DATE
-- component is what makes it both privacy-preserving and useful: the hash
-- rotates every day, so nothing tracks a person across days, and "unique
-- viewers this week" means "unique per day, summed" rather than a cross-day
-- identity we never asked permission to build.
--
-- NULLABLE, because every row written before this deploy has no hash and never
-- will. Readers must treat a window containing NULLs as "unique viewers not
-- available for this period" rather than counting the non-NULL rows — silently
-- reporting a lower number for historical weeks looks like a traffic collapse.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, no
-- backfill, no UPDATE. No DO $$ block (see 0040).

ALTER TABLE listing_views
  ADD COLUMN IF NOT EXISTS visitor_hash varchar(64);

-- Drives "unique viewers in period" without scanning the whole history.
-- Column order matches the predicate: listing, then window, then the distinct.
CREATE INDEX IF NOT EXISTS listing_views_visitor_idx
  ON listing_views (listing_id, viewed_at, visitor_hash);
