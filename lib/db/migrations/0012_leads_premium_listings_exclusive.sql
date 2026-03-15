-- Leads: userId and isPremium for priority contact
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "is_premium" boolean NOT NULL DEFAULT false;

-- Listings: exclusive (premium renters only)
ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "exclusive" boolean NOT NULL DEFAULT false;
