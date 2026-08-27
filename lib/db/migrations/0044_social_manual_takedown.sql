-- Which social posts are STILL LIVE after a takedown was requested.
--
-- `status = 'pulled'` means "taken down OR marked for manual takedown" — the
-- enum comment says so itself. That conflation is the bug: a listing the
-- landlord deleted, whose Instagram post is still visible to everyone, shows
-- up in Back Office → Social looking exactly like one that was really removed.
-- The only thing separating them was English prose in `error`, and the two
-- writers even phrase it differently ('REMOVE BY HAND — this platform has no
-- delete API' from the button, '… — REMOVE BY HAND (no delete API)' from the
-- automatic pull-down), so nothing could reliably query it.
--
-- These columns make it a fact instead of a sentence, and give ops somewhere
-- to record that they finished the job:
--   needs_manual_takedown = true  → still on the platform, a human must act
--   manual_takedown_at    = when a human confirmed they deleted it
--
-- Replay-safe: three IF NOT EXISTS column adds, one partial index, and one
-- backfill that can never re-open a closed item (see the guard below).
-- run-all-migrations.ts replays this file on every invocation, forever.

ALTER TABLE listing_social_posts
  ADD COLUMN IF NOT EXISTS needs_manual_takedown boolean NOT NULL DEFAULT false;

ALTER TABLE listing_social_posts
  ADD COLUMN IF NOT EXISTS manual_takedown_at timestamp;

ALTER TABLE listing_social_posts
  ADD COLUMN IF NOT EXISTS manual_takedown_by integer REFERENCES users(id);

-- Backfill the existing back catalogue from the prose we used to write, so the
-- posts already stranded on Instagram surface immediately rather than only new
-- ones. Both historical phrasings share the substring 'REMOVE BY HAND'.
--
-- The `manual_takedown_at IS NULL` guard is what makes this safe to replay
-- forever: once ops confirms a removal the row is closed, and a later run of
-- this migration must never resurrect it into the worklist. `needs_manual_
-- takedown = false` keeps it from rewriting rows it has already set.
UPDATE listing_social_posts
   SET needs_manual_takedown = true
 WHERE status = 'pulled'
   AND error LIKE '%REMOVE BY HAND%'
   AND needs_manual_takedown = false
   AND manual_takedown_at IS NULL;

-- Drives the worklist. Partial, because the interesting set is always the
-- handful still outstanding, never the whole table.
CREATE INDEX IF NOT EXISTS listing_social_posts_awaiting_takedown_idx
  ON listing_social_posts (pulled_at)
  WHERE needs_manual_takedown = true AND manual_takedown_at IS NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_social_takedown_confirmed';
