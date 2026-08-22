-- Social auto-publish: post a published listing to Easy Rent's OWN brand
-- accounts (Facebook Page, Instagram, TikTok) once the landlord agrees, and
-- hand ops a paste-ready draft for the Facebook Group.
--
-- Facebook Groups have no API path at all: Meta removed the Groups API and the
-- publish_to_groups permission on 2024-04-22. That platform is therefore stored
-- with status 'skipped' and posted by a human — the row exists to carry the
-- caption and to record that we did offer it.
--
-- Shape: ONE ROW PER (listing, platform). Each network has its own lifecycle,
-- its own remote post id, its own retry budget and its own failure mode, and
-- concurrent sweeper workers claiming a shared JSON column on `listings` would
-- lose updates. The unique index below IS the enqueue idempotency guarantee —
-- a replayed webhook or a second consent can never double-post.
--
-- Replay-safe: every statement is IF NOT EXISTS or natively idempotent, and
-- nothing touches existing rows. run-all-migrations.ts replays this file on
-- every invocation forever, against a populated production database.
--
-- Deliberately NO backfill. Every new column is nullable and NULL means "never
-- asked", which is the correct reading for the back catalogue. A backfill here
-- would either re-prompt every landlord who ever published, or permanently mark
-- them as asked when they never were.
--
-- NB: no DO $$ blocks — the runner's splitter only closes a dollar block on a
-- line that is exactly `$$;` (see the note at the top of 0030).

-- Per-platform job state. CREATE TYPE is not IF NOT EXISTS-able in older PG;
-- the runner skips the "already exists" error on replay.
CREATE TYPE social_post_status AS ENUM (
  'queued',
  'running',
  'posted',
  'failed',
  'skipped',
  'pulled'
);

CREATE TABLE IF NOT EXISTS listing_social_posts (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  -- facebook_page | instagram | tiktok | facebook_group. Text rather than an
  -- enum, matching the `channel` convention on whatsapp_intakes: adding a
  -- network should not need a migration.
  platform text NOT NULL,
  status social_post_status NOT NULL DEFAULT 'queued',
  -- The handle needed to delete the post again. Only Facebook Page supports
  -- deletion via API; for Instagram and TikTok a takedown is a task for a
  -- human, which is why the permalink is stored next to it.
  remote_post_id text,
  remote_permalink text,
  -- Exactly what we sent. Audit trail, and the paste source for facebook_group.
  caption text,
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamp,
  error text,
  posted_at timestamp,
  pulled_at timestamp,
  pulled_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- The idempotency constraint. enqueueSocialPosts() relies on this for
-- ON CONFLICT DO NOTHING, so a double consent is a no-op rather than a
-- duplicate post.
CREATE UNIQUE INDEX IF NOT EXISTS listing_social_posts_listing_platform_idx
  ON listing_social_posts (listing_id, platform);

-- The sweeper's claim query: queued rows, plus running rows whose lease expired.
CREATE INDEX IF NOT EXISTS listing_social_posts_queue_idx
  ON listing_social_posts (status, created_at)
  WHERE status IN ('queued', 'running');

-- Matches 0026: every table in this schema carries RLS. All access is through
-- the service role in server code; no client ever queries this table directly.
ALTER TABLE listing_social_posts ENABLE ROW LEVEL SECURITY;

-- Consent is asked PER LISTING (a landlord may want one property shared and not
-- the next), so these are listing facts, not a landlord-level preference.
--
-- social_prompted_at is the delivery record for the ask, mirroring
-- landlord_notified_at from 0035: a published listing with NULL here is one the
-- sweeper still owes a prompt. Distinguishing "never asked" from "asked and
-- declined" is why the decline gets its own column rather than a boolean.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS social_prompted_at timestamp;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS social_consent_at timestamp;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS social_consent_source varchar(20);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS social_declined_at timestamp;

-- The prompt reconciler's lookup: published, nobody asked.
CREATE INDEX IF NOT EXISTS listings_awaiting_social_prompt_idx
  ON listings (published_at)
  WHERE social_prompted_at IS NULL;

-- OAuth credentials for platforms whose tokens ROTATE. Only TikTok needs this:
-- its access token expires in ~24h and its refresh token is replaced on every
-- use, so the live pair cannot live in an env var the running app can't rewrite.
-- Meta Page tokens are long-lived and stay in the environment.
--
-- Service-role access only. RLS is on with no policies, so nothing reaches this
-- table except server code holding the service key.
CREATE TABLE IF NOT EXISTS social_accounts (
  id serial PRIMARY KEY,
  -- One connected account per platform.
  platform text NOT NULL UNIQUE,
  -- The platform's own identifier for the account (TikTok: open_id).
  external_account_id text,
  display_name text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamp,
  refresh_expires_at timestamp,
  scope text,
  connected_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

-- New audit actions. One statement each: Postgres cannot use a newly added enum
-- value in the same transaction that adds it.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_social_consent_granted';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_social_published';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_social_pulled';
