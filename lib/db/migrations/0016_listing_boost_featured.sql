-- Boost (pay per listing for 7 days) and featured (Premium/Agency) placement
ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "boosted_until" timestamp,
  ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featured_at" timestamp;
