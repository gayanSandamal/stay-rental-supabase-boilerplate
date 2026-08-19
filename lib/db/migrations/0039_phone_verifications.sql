-- Prove-you-hold-this-number challenges for contact numbers added through the
-- WEBSITE (60-second form, full form, account settings). Numbers that arrive
-- through the WhatsApp intake pipeline are already verified at insert time by
-- lib/intake/process.ts — this table exists for every other path, which until
-- now had no way to ever become verified.
--
-- Design mirrors landlord_access_tokens (0030) and password_reset_tokens
-- (0008): hash-only storage, hard expiry, no plaintext credential at rest.
--
-- The code is NOT the proof. It is a correlation token — possession is proven
-- by the sender number on the inbound WhatsApp message, which Meta verified
-- before it ever reached us. expected_phone is compared against that sender,
-- so a code that leaks to a third party still cannot verify anything.
--
-- Replay-safe: every statement is IF NOT EXISTS and nothing touches existing
-- rows. run-all-migrations.ts replays this file on every invocation forever.
-- NB: no DO $$ blocks — the runner's splitter only closes a dollar block on a
-- line that is exactly `$$;` (see the note at the top of 0030).

CREATE TABLE IF NOT EXISTS phone_verifications (
  id serial PRIMARY KEY,
  -- One live challenge per number: minting again supersedes the old row rather
  -- than leaving a pile of simultaneously-valid codes.
  contact_number_id integer NOT NULL UNIQUE
    REFERENCES user_contact_numbers(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  -- E.164 snapshot taken at mint time. Denormalized deliberately: if the
  -- landlord edits the contact number afterwards the challenge must NOT follow
  -- it to the new digits — the stale row just stops matching.
  expected_phone varchar(20) NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  expires_at timestamp NOT NULL,
  -- Wrong-sender attempts. Bounds the "leaked code + guess the number" game.
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

-- The webhook's hot path: look up a challenge by the code in the message.
CREATE INDEX IF NOT EXISTS phone_verifications_code_idx
  ON phone_verifications (code_hash);
-- Cron housekeeping sweeps by expiry.
CREATE INDEX IF NOT EXISTS phone_verifications_expires_idx
  ON phone_verifications (expires_at);

-- Matches 0026: every table in this schema carries RLS. All access is through
-- the service role in server code; no client ever queries this table directly.
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
