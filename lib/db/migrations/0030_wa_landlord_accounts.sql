-- WhatsApp landlord accounts: verified phone identity, passwordless access
-- links, and per-sender conversation state for the delete flow.
-- NB: no DO $$ blocks in this file — the migration runner's splitter only
-- closes a dollar block on a line that is exactly `$$;` (see 0031).

-- 1. Verified WhatsApp identity. Deliberately NOT users.phone: that column is
-- user-typed and unverified, so matching on it would let anyone claim another
-- person's listings. wa_phone is written only by the intake pipeline, after
-- Meta has proven possession of the number. E.164, e.g. +94771234567.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_phone varchar(20);

-- One LIVE account per verified number. Partial, so a soft-deleted account
-- (deleted_at set, email mangled) never blocks that number signing up again.
CREATE UNIQUE INDEX IF NOT EXISTS users_wa_phone_live_key
  ON users (wa_phone) WHERE wa_phone IS NOT NULL AND deleted_at IS NULL;

-- 2. Passwordless "sign me in and take me there" links sent over WhatsApp.
-- Mirrors password_reset_tokens (0008) — hash-only storage, expiry — but
-- REUSABLE, because the link lives in a chat thread the landlord reopens weeks
-- later. Rotation happens by minting a new row per outbound message; old rows
-- stay valid until they expire.
CREATE TABLE IF NOT EXISTS landlord_access_tokens (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  listing_id integer REFERENCES listings(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  expires_at timestamp NOT NULL,
  last_used_at timestamp,
  use_count integer NOT NULL DEFAULT 0,
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landlord_access_tokens_user_idx ON landlord_access_tokens (user_id);
CREATE INDEX IF NOT EXISTS landlord_access_tokens_expires_idx ON landlord_access_tokens (expires_at);

ALTER TABLE landlord_access_tokens ENABLE ROW LEVEL SECURITY;

-- 3. One conversation-state row per (channel, sender): the delete-confirmation
-- state machine plus a ledger of already-handled command message ids, so Meta
-- redelivery can never archive a listing twice. Deliberately NOT columns on
-- whatsapp_intakes — that table means "one property submission".
CREATE TABLE IF NOT EXISTS intake_conversations (
  id serial PRIMARY KEY,
  channel text NOT NULL DEFAULT 'whatsapp',
  from_number text NOT NULL,
  state text NOT NULL DEFAULT 'idle',
  payload text,
  expires_at timestamp,
  handled_message_ids text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT intake_conversations_sender_key UNIQUE (channel, from_number)
);

ALTER TABLE intake_conversations ENABLE ROW LEVEL SECURITY;

-- 4. Audit actions for the new consequential flows.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'wa_account_created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'auth_link_issued';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'auth_link_redeemed';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_purged';
