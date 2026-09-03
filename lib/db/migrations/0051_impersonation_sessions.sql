-- Admin impersonation: "view the app as this user", for support.
--
-- WHY A TABLE AND NOT A SIGNED COOKIE. A self-contained signed cookie cannot be
-- revoked, cannot have its expiry shortened after the fact, and leaves no record
-- that the session ever existed. Impersonation is the highest-privilege action
-- in the product — one person reading another person's account — so the session
-- must be revocable, server-enforced, and provable after the fact. The row IS
-- the evidence.
--
-- Only the sha256 of the token is stored, matching password_reset_tokens,
-- landlord_access_tokens and phone_verifications: a leaked database dump must
-- not hand anyone a working impersonation session, and an issued token can
-- never be reprinted from the row.
--
-- BOTH IDENTITIES ARE COLUMNS, NOT A COMMENT. actor_user_id is who is really at
-- the keyboard; subject_user_id is whose account they are looking at. Recording
-- only the subject is what turns an audit log into a false statement — "the
-- landlord deleted their listing" when in fact support did.
--
-- Replay-safe: table + indexes are IF NOT EXISTS, enum values are idempotent.
-- No DO block (see the splitStatements note in CLAUDE.md).

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id serial PRIMARY KEY,
  -- The admin. RESTRICT, not CASCADE: deleting an admin must not erase the
  -- record that they impersonated someone.
  actor_user_id integer NOT NULL REFERENCES users(id),
  -- The account being viewed.
  subject_user_id integer NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  -- Server-enforced ceiling. A forgotten tab must stop working on its own; the
  -- Exit button is the happy path, not the only one.
  expires_at timestamp NOT NULL,
  -- Set when the admin exits, or when the session is revoked. A row with
  -- ended_at IS NULL and expires_at in the future is the only live session.
  ended_at timestamp,
  -- Provenance for the audit trail.
  actor_ip varchar(45),
  created_at timestamp NOT NULL DEFAULT now()
);

-- The lookup on every request that carries an impersonation cookie: by hash,
-- still live. Partial, because ended sessions are dead weight in that scan
-- forever and this table only grows.
CREATE INDEX IF NOT EXISTS impersonation_sessions_live_idx
  ON impersonation_sessions (token_hash)
  WHERE ended_at IS NULL;

-- "Who has been impersonating, and who did they look at" — the question this
-- table exists to answer.
CREATE INDEX IF NOT EXISTS impersonation_sessions_actor_idx
  ON impersonation_sessions (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS impersonation_sessions_subject_idx
  ON impersonation_sessions (subject_user_id, created_at DESC);

-- Start and end are both audited. The end matters as much as the start: an
-- unclosed session is the thing you want to notice.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'impersonation_started';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'impersonation_ended';
