-- 0061 — record HOW consent for a Facebook post import was obtained.
--
-- 0060 made the importer opt-in but only ever had one path to consent_granted_at:
-- the owner replying YES to the approved WhatsApp template. This adds a second,
-- ops-only path — the operator got the owner's permission by phone or WhatsApp
-- chat themselves, when WHATSAPP_CONSENT_TEMPLATE is not yet registered (or an
-- operator simply prefers to call) — and consent_source is what tells the two
-- apart afterwards.
--
-- 'whatsapp' = the owner answered the approved template themselves. 'manual' =
-- an operator attested it on the owner's behalf. NULL = published before this
-- column existed, which was ALWAYS the WhatsApp path (the manual path did not
-- exist yet), so publishImport() treats NULL the same as 'whatsapp' rather than
-- guessing — no backfill needed or written.
--
-- REPLAY SAFETY: this file is re-run on every `pnpm db:migrate-all` invocation,
-- forever, against a populated production database. The one statement is
-- IF NOT EXISTS, nothing is dropped, and there is no DO block.

ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS consent_source varchar(20);
