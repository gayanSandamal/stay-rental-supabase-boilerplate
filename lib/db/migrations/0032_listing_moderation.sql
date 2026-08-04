-- Automated listing approval engine + image processing pipeline.
-- No DO $$ blocks here (see 0031): CREATE TYPE is idempotent via the runner,
-- which skips "already exists" / "duplicate" errors.

CREATE TYPE listing_moderation_status AS ENUM (
  'queued', 'running', 'passed', 'held', 'error', 'skipped'
);

-- Default 'skipped', NOT 'queued': queueing every existing row would make the
-- sweeper reprocess the whole catalogue the moment this deploys. New listings
-- set 'queued' explicitly in code.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_status listing_moderation_status NOT NULL DEFAULT 'skipped';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_summary text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_language varchar(12);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderated_at timestamp;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS moderation_lease_until timestamp;
-- Source of truth for photos: JSON array of {o,p,h,v,r,sev,wa,pv}. listings.photos
-- stays a plain array of PUBLIC (derived) URLs so all existing readers keep working.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS photos_manifest text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS archived_at timestamp;

-- Only rows the sweeper cares about; keeps the scan tiny as the table grows.
CREATE INDEX IF NOT EXISTS listings_moderation_queue_idx
  ON listings (moderation_status, created_at)
  WHERE moderation_status IN ('queued', 'running');

-- Purge sweep for archived listings (30-day retention).
CREATE INDEX IF NOT EXISTS listings_archived_at_idx ON listings (archived_at)
  WHERE archived_at IS NOT NULL;

-- One row per moderation attempt: the ops audit trail and the cost ledger.
CREATE TABLE IF NOT EXISTS listing_moderations (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 1,
  outcome listing_moderation_status NOT NULL,
  language varchar(12),
  verdict text,
  reasons text,
  images_checked integer NOT NULL DEFAULT 0,
  images_dropped integer NOT NULL DEFAULT 0,
  images_cached integer NOT NULL DEFAULT 0,
  model varchar(64),
  prompt_version integer NOT NULL DEFAULT 1,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_moderations_listing_idx ON listing_moderations (listing_id);
CREATE INDEX IF NOT EXISTS listing_moderations_outcome_idx ON listing_moderations (outcome, created_at DESC);

ALTER TABLE listing_moderations ENABLE ROW LEVEL SECURITY;

-- Content-addressed image verdict cache. Image checks judge the image alone (no
-- listing context), so a verdict is reusable across listings and across edits —
-- this is what makes re-approval on edit nearly free. human_override records an
-- ops "restore this photo" decision so it survives every future re-run.
CREATE TABLE IF NOT EXISTS image_moderation_cache (
  content_hash varchar(64) NOT NULL,
  prompt_version integer NOT NULL DEFAULT 1,
  verdict varchar(16) NOT NULL,
  severity varchar(16),
  reasons text,
  raw text,
  model varchar(64),
  human_override boolean NOT NULL DEFAULT false,
  overridden_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (content_hash, prompt_version)
);

ALTER TABLE image_moderation_cache ENABLE ROW LEVEL SECURITY;

-- Deleting a listing currently 500s for every WhatsApp-originated row: the FK
-- from whatsapp_intakes.listing_id was created with no ON DELETE action.
ALTER TABLE whatsapp_intakes DROP CONSTRAINT IF EXISTS whatsapp_intakes_listing_id_fkey;
ALTER TABLE whatsapp_intakes DROP CONSTRAINT IF EXISTS whatsapp_intakes_listing_id_listings_id_fk;
ALTER TABLE whatsapp_intakes
  ADD CONSTRAINT whatsapp_intakes_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_moderation_passed';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_moderation_held';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_moderation_overridden';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_photos_dropped';
