-- User subscription tier for premium plan
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "subscription_tier" varchar(20) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "subscription_expires_at" timestamp;
