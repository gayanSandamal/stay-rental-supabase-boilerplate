-- Importing a rental ad from a Facebook group/page post URL.
--
-- WHY A TABLE AND NOT A whatsapp_intakes ROW. Tempting, since the intake queue
-- already turns raw ad text into a listing. But `from_number` is NOT NULL there
-- and IS the identity, the */2 cron would claim any row it found, and the
-- WhatsApp Intakes screen would fill with rows that never came from WhatsApp.
-- An import is also reviewed by a human BEFORE it publishes, which is the
-- opposite of the intake contract. Separate table, shared publish logic.
--
-- WHY source_url IS STORED EVEN WHEN THE FETCH FAILED. Facebook refuses
-- automated reads of group posts and third-party page posts (the Groups API was
-- removed 2024-04-22), so `resolved_via = 'manual'` — operator pasted the text —
-- is the EXPECTED path, not the error path. The URL is provenance either way:
-- it is how a second operator checks the import against the original, and how
-- we notice the same ad being imported twice.
--
-- Replay-safe: one CREATE TYPE (the runner skips "already exists"), IF NOT
-- EXISTS everywhere else, idempotent enum values, and one bounded backfill.
-- No DO block — see the splitStatements note in CLAUDE.md.

CREATE TYPE post_import_status AS ENUM (
  'draft',      -- extracted, awaiting operator review
  'published',  -- a listing was created from it
  'discarded'   -- operator rejected it; kept so the URL is not re-imported blind
);

CREATE TABLE IF NOT EXISTS post_imports (
  id serial PRIMARY KEY,
  -- The pasted URL, normalised. Never fetched without passing the host
  -- allowlist in lib/imports/facebook/url.ts first — this column is operator
  -- input and the server dereferences it.
  source_url text NOT NULL,
  -- facebook_group | facebook_page. Text rather than an enum, matching the
  -- `platform` convention on listing_social_posts: adding a source should not
  -- need a migration.
  source_platform varchar(32) NOT NULL DEFAULT 'facebook_page',
  -- graph | og | manual. How the content actually arrived, so the review screen
  -- can say "Facebook refused, paste it" instead of showing empty fields with
  -- no explanation.
  resolved_via varchar(16) NOT NULL DEFAULT 'manual',
  raw_text text,
  parsed_payload text,          -- JSON ParsedIntake from lib/intake/parser
  photo_urls text,              -- JSON string[] of URLs already in our bucket
  -- The owner's number as the operator confirmed it, E.164. NOT verified —
  -- nobody has proven possession. See users.wa_phone_verified_at below.
  owner_phone varchar(20),
  owner_name text,
  status post_import_status NOT NULL DEFAULT 'draft',
  listing_id integer REFERENCES listings(id) ON DELETE SET NULL,
  imported_by integer REFERENCES users(id),
  notified_at timestamp,
  -- sent | dry_run | failed. dry_run is counted apart from failed on purpose:
  -- "no template registered yet" is unfinished setup, and reporting it as
  -- failure sends ops hunting an outage that does not exist.
  notify_outcome varchar(16),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- "Has this ad been imported already?" on every paste.
CREATE INDEX IF NOT EXISTS post_imports_source_url_idx ON post_imports (source_url);
-- The back-office list: tab filter + newest-first inside it.
CREATE INDEX IF NOT EXISTS post_imports_status_created_idx ON post_imports (status, created_at DESC);

-- WHY wa_phone ALONE IS NO LONGER PROOF.
--
-- Until now every wa_phone was written by the intake pipeline after Meta proved
-- possession, so `wa_phone IS NOT NULL` could stand in for "verified" — and
-- lib/reports/send.ts relies on exactly that to decide who may be sent a
-- performance report about their property. An imported listing's owner phone is
-- typed into a Facebook ad by a stranger. Storing it in wa_phone is still right
-- (it is how their reply is matched back to the account we made for them), but
-- it must not carry the verified meaning, or a report about someone's property
-- reaches whoever that number actually belongs to.
--
-- NULL = we have a number but nobody has proven it. Stamped the moment the
-- owner sends us a WhatsApp message (lib/intake/landlord-identity.ts).
ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_phone_verified_at timestamp;

-- Backfill: every wa_phone that exists TODAY came from a real inbound WhatsApp
-- message, so it is verified and must be stamped — otherwise those landlords
-- silently stop receiving reports the moment the guard above lands.
--
-- THE created_at CUTOFF IS LOAD-BEARING, NOT DECORATION. This file is replayed
-- on every db:migrate-all invocation, forever. Without the bound, the next
-- replay would stamp the UNVERIFIED rows this feature creates and quietly
-- promote scraped numbers to verified ones. The literal date is the authoring
-- date and must never be widened.
UPDATE users
   SET wa_phone_verified_at = coalesce(updated_at, created_at)
 WHERE wa_phone IS NOT NULL
   AND wa_phone_verified_at IS NULL
   AND created_at < '2026-09-07'::timestamp;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'post_import_created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'post_import_published';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'post_import_discarded';
