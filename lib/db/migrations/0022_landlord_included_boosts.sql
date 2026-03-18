-- Included Boosts for Starter (1), Pro (3), Agency (6) plans per month
ALTER TABLE "landlords"
  ADD COLUMN IF NOT EXISTS "boosts_used_this_month" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "boosts_month_reset_at" timestamp;
