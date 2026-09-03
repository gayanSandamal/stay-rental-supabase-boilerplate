-- Banning an account.
--
-- WHY A LOCAL FLAG AND NOT ONLY SUPABASE'S banned_until. Both are set, and they
-- do different jobs. Supabase's ban stops new sign-ins at the auth layer;
-- `banned_at` here is what every server render and API route can check without
-- an extra HTTPS round trip to the auth service on a max: 1 pool. Relying only
-- on Supabase would mean a live session keeps working until its token expires,
-- which is exactly the window a ban exists to close.
--
-- banned_reason is stored because a ban with no recorded reason is impossible
-- to review later, and an unreviewable ban is one nobody dares reverse.
--
-- banned_by does NOT cascade: deleting the admin who issued a ban must not
-- quietly erase who issued it. Same rule as impersonation_sessions.actor_user_id.
--
-- Replay-safe: IF NOT EXISTS adds, idempotent enum values, no DO block, and no
-- statement that touches existing data.

ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by integer REFERENCES users(id);

-- The back-office "Banned" tab, and every getUser() ban check. Partial, because
-- banned accounts are a small minority forever and unbanned rows are dead weight
-- in that scan.
CREATE INDEX IF NOT EXISTS users_banned_idx ON users (banned_at) WHERE banned_at IS NOT NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'user_banned';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'user_unbanned';
-- The hard delete is audited even though the account is gone: the row records
-- that an erasure happened, who performed it, and when. Without it there is no
-- way to prove a deletion request was honoured, and no way to notice an admin
-- quietly removing accounts. It deliberately carries no personal data — only
-- the now-meaningless id.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'user_hard_deleted';
