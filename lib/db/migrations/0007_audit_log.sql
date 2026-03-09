-- Audit log action enum
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'listing_created',
    'listing_updated',
    'listing_approved',
    'listing_rejected',
    'listing_archived',
    'listing_expired',
    'listing_deleted',
    'lead_created',
    'lead_status_changed',
    'viewing_scheduled',
    'viewing_outcome',
    'user_created',
    'user_updated',
    'business_account_created',
    'business_account_updated',
    'member_added',
    'member_removed',
    'contact_verified',
    'kyc_verified',
    'property_visited',
    'data_exported'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Audit log table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" SERIAL PRIMARY KEY,
  "action" audit_action NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id" INTEGER,
  "user_id" INTEGER REFERENCES "users"("id"),
  "metadata" TEXT,
  "ip_address" VARCHAR(45),
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
