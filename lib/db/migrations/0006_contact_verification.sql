-- Add verification fields to user_contact_numbers
ALTER TABLE "user_contact_numbers" 
  ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "verified_by" integer REFERENCES "users"("id");

-- Add tracking fields to listing_contact_numbers
ALTER TABLE "listing_contact_numbers"
  ADD COLUMN IF NOT EXISTS "is_new" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "was_changed" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "linked_at" timestamp DEFAULT now() NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS "user_contact_numbers_verified_idx" ON "user_contact_numbers"("verified");
CREATE INDEX IF NOT EXISTS "listing_contact_numbers_is_new_idx" ON "listing_contact_numbers"("is_new");
CREATE INDEX IF NOT EXISTS "listing_contact_numbers_was_changed_idx" ON "listing_contact_numbers"("was_changed");

