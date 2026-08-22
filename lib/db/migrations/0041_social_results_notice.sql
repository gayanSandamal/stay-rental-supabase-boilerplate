-- Tell the landlord where their listing was actually posted.
--
-- After consenting over WhatsApp the landlord heard nothing back: they could
-- not open the post, could not share it on, and could not object to a post
-- carrying their own property photos. This column is the delivery record for
-- the message that closes that loop.
--
-- It is a DELIVERY record, not an intent record — exactly like
-- `social_prompted_at` (migration 0040). It is stamped only once a message has
-- actually reached the landlord, so a send that fails (Meta's 24h
-- customer-service window closing, error 131047) leaves it NULL and the
-- reconciler tries again, rather than the notice being lost forever.
--
-- Replay-safe: one IF NOT EXISTS column add plus one partial index. Nothing
-- touches an existing row. run-all-migrations.ts replays this file on every
-- invocation, forever, against a populated production database.
--
-- Deliberately NO backfill. NULL means "not told yet", and for the back
-- catalogue that is the truth. Backfilling a timestamp would silence the
-- reconciler for listings whose owners were never actually messaged; leaving
-- it NULL is safe because the reconciler is bounded to recently-published
-- listings anyway.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS social_results_sent_at timestamp;

-- Drives the reconciler's scan. Partial, because the interesting set is always
-- the handful still awaiting a notice, never the whole table.
CREATE INDEX IF NOT EXISTS listings_awaiting_social_results_idx
  ON listings (published_at)
  WHERE social_results_sent_at IS NULL;
