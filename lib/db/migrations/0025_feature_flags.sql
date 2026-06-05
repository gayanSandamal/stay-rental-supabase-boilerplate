-- Runtime feature flag overrides. Defaults live in lib/feature-flags.ts;
-- a row here overrides a flag at runtime (managed from the back office).
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_by integer REFERENCES users(id),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Audit action for back-office feature flag changes.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'feature_flag_updated';
