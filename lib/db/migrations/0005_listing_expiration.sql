-- Add 'expired' to listing_status enum
ALTER TYPE "listing_status" ADD VALUE IF NOT EXISTS 'expired';

-- Add published_at and expires_at columns to listings table
ALTER TABLE "listings" 
  ADD COLUMN IF NOT EXISTS "published_at" timestamp,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "listings_published_at_idx" ON "listings"("published_at");
CREATE INDEX IF NOT EXISTS "listings_expires_at_idx" ON "listings"("expires_at");

-- Update existing active listings to have published_at set to their created_at
-- and expires_at set to 7 days after published_at
UPDATE "listings"
SET 
  "published_at" = "created_at",
  "expires_at" = "created_at" + INTERVAL '7 days'
WHERE "status" = 'active' AND "published_at" IS NULL;

