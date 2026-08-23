-- Reply to a landlord in the language they wrote in.
--
-- A landlord sent a complete property ad in Sinhala (intake #28) and was told
-- "To publish we still need: the monthly rent" — in English. The parser reads
-- Sinhala; only the outbound half was monolingual. These columns remember which
-- language to answer in.
--
-- WHY STORED AND NOT DETECTED PER MESSAGE: a landlord writes a long Sinhala ad,
-- then replies "50000". That reply, read on its own, has no Sinhala in it at
-- all — so per-message detection would switch them back to English halfway
-- through their own submission. The conversation's language is decided once and
-- only overridden when a later message is itself conclusively another script.
--
-- Replay-safe: two IF NOT EXISTS column adds, nothing touches an existing row.
-- run-all-migrations.ts replays this file on every invocation, forever, against
-- a populated production database.
--
-- Deliberately NO backfill. NULL means "not known yet", which is the truth for
-- every existing row, and the resolver treats NULL as English.

ALTER TABLE whatsapp_intakes ADD COLUMN IF NOT EXISTS reply_language varchar(8);

-- On the user too, so a landlord who comes back with a second listing is
-- answered in their language from the first message rather than after it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language varchar(8);
