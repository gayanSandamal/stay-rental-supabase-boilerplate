-- Channel-agnostic intake core: tag each intake with its source channel.
-- The table name stays whatsapp_intakes (owner decision — no rename/backfill);
-- the column makes rows channel-aware so a future Telegram/iMessage adapter
-- can never collide sessions with a numerically-equal WhatsApp sender id.
-- Plain text, not an enum: adding a channel must not need a migration.
ALTER TABLE whatsapp_intakes
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';
