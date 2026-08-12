-- Durable "your listing is live" announcements.
--
-- notifyModerationOutcome ran once, at the very end of a time-bounded sweeper
-- run, wrapped in a catch that logs and moves on. When the run was killed or
-- the send threw, the listing went live and the owner was never told — with
-- nothing to reconcile it afterwards. Observed on listing #14 (2026-08-12): the
-- two audit rows immediately preceding the notify call were written, then
-- neither the ops notification nor the WhatsApp message ever appeared.
--
-- This column is the record of delivery. A published listing with NULL here is
-- one the sweeper still owes an announcement.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'landlord_notified_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN landlord_notified_at timestamp;

    -- Backfill every already-published listing as announced. Their owners were
    -- told under the old code path (or the listing is long dead), and leaving
    -- them NULL would have the reconciler re-announce the entire back catalogue
    -- the moment it ships.
    --
    -- This sits INSIDE the "column did not exist" branch on purpose:
    -- run-all-migrations.ts replays every numbered file on every invocation, so
    -- an unguarded backfill would stamp genuinely-unannounced listings as
    -- notified on the next deploy and silence the very messages this column
    -- exists to guarantee.
    UPDATE listings
    SET landlord_notified_at = COALESCE(published_at, created_at)
    WHERE published_at IS NOT NULL;
  END IF;
END
$$;

-- The reconciler's lookup: published, checks passed, nobody told.
CREATE INDEX IF NOT EXISTS listings_awaiting_announcement_idx
  ON listings (published_at)
  WHERE landlord_notified_at IS NULL;
