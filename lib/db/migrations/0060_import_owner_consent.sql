-- 0060 — owner consent for Facebook post imports.
--
-- The importer becomes OPT-IN. Nothing about an owner's property is published
-- until they say yes over WhatsApp, and silence is a no. Before this, an
-- operator's review published the listing and the owner was told afterwards
-- with a "reply REMOVE" escape hatch.
--
-- consent_granted_at is the authorisation. Every publish path checks it, so a
-- null here means no listing row may exist for this import.
--
-- REPLAY SAFETY: this file is re-run on every `pnpm db:migrate-all` invocation,
-- forever, against a populated production database. Every statement is
-- IF NOT EXISTS, nothing is dropped, and there is deliberately no DO block —
-- splitStatements() mis-parses `END $$;` and would swallow everything below it.

ALTER TYPE post_import_status ADD VALUE IF NOT EXISTS 'awaiting_consent';
ALTER TYPE post_import_status ADD VALUE IF NOT EXISTS 'declined';

ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS consent_requested_at timestamp;
ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS consent_granted_at timestamp;
ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS consent_declined_at timestamp;
ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS consent_token_hash varchar(64);
ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS consent_outcome varchar(16);

-- The preview link resolves by hash on every open, so this lookup is on the
-- request path. Partial: only rows with a live consent token are ever matched.
CREATE INDEX IF NOT EXISTS post_imports_consent_token_hash_idx
  ON post_imports (consent_token_hash)
  WHERE consent_token_hash IS NOT NULL;

-- Backfill: rows published under the old opt-out model were published without
-- being asked. Recording that as consent would be a lie, and it is the one
-- thing this column must never say. They keep NULL, which correctly reads as
-- "never asked" — the publish gate only guards NEW listings, so nothing that is
-- already live is disturbed.
