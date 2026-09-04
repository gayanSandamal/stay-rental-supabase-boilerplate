-- 0053 — an honest audit action for linking a social account.
--
-- The TikTok OAuth callback logged its connection as `feature_flag_updated`,
-- which is not what happened. Connecting Easy Rent's own TikTok account is a
-- consequential admin action — it decides which account the platform posts
-- landlords' properties to — and the audit trail has to name it.
--
-- No DO block on purpose: `splitStatements()` in run-all-migrations.ts
-- mis-parses `END $$;`, and every statement here is replay-safe as plain DDL.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'social_account_connected';
