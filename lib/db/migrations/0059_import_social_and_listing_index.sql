-- Two small additions for the Facebook importer.
--
-- share_on_social: whether the operator ticked "also post this to Easy Rent's
-- own social channels" on the review screen. It lives on the import rather than
-- being inferred at publish because the review screen saves drafts — the choice
-- has to survive between opening the screen and pressing Publish.
--
-- Consent recorded from here is `socialConsentSource = 'ops'`, which is the
-- honest label: the property's owner has not been asked. That is a deliberate
-- product decision, and naming it 'ops' rather than 'web' is what keeps it
-- auditable afterwards.
--
-- post_imports_listing_idx: the back office needs "which of these listings came
-- from an import?" for every row on the moderation and listings screens. There
-- is no origin column on `listings`, so that answer is a reverse lookup on
-- post_imports.listing_id — which had no index at all, making it a sequential
-- scan on every page render. Partial, because a draft or discarded import has
-- no listing and those rows are dead weight in the scan.
--
-- Replay-safe: an IF NOT EXISTS column add and an IF NOT EXISTS index, neither
-- touching existing data. No DO block (see the splitStatements note in CLAUDE.md).

ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS share_on_social boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS post_imports_listing_idx
  ON post_imports (listing_id) WHERE listing_id IS NOT NULL;
