-- Saved searches: track when last alert was sent
ALTER TABLE "saved_searches"
  ADD COLUMN IF NOT EXISTS "last_alert_at" timestamp;
