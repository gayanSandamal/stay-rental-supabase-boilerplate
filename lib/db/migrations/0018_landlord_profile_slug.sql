-- Landlord profile slug and public ID for sharable portfolio URLs
-- Premium+: custom slug (e.g. prime-lands). Free: UUID-style URL.

ALTER TABLE "landlords"
  ADD COLUMN IF NOT EXISTS "profile_slug" varchar(50) UNIQUE,
  ADD COLUMN IF NOT EXISTS "public_id" varchar(36) UNIQUE;

-- Backfill public_id for existing landlords
UPDATE "landlords"
SET "public_id" = gen_random_uuid()::text
WHERE "public_id" IS NULL;

-- Make public_id NOT NULL after backfill
ALTER TABLE "landlords"
  ALTER COLUMN "public_id" SET NOT NULL,
  ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid()::text;
