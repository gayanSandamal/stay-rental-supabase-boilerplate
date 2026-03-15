-- Landlord plan tier for monetization (free, basic, premium, agency)
ALTER TABLE "landlords"
  ADD COLUMN IF NOT EXISTS "landlord_plan_tier" varchar(20) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "landlord_plan_expires_at" timestamp;
