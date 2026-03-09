-- Create business account status enum
CREATE TYPE "business_account_status" AS ENUM('active', 'suspended', 'inactive');

-- Create business_accounts table
CREATE TABLE IF NOT EXISTS "business_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "email" varchar(255) NOT NULL,
  "phone" varchar(20),
  "address" text,
  "status" "business_account_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_by" integer REFERENCES "users"("id")
);

-- Create business_account_members table
CREATE TABLE IF NOT EXISTS "business_account_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_account_id" integer NOT NULL REFERENCES "business_accounts"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(50) DEFAULT 'member' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "business_account_members_user_id_unique" UNIQUE("user_id")
);

-- Add new fields to listings table
ALTER TABLE "listings" 
  ADD COLUMN IF NOT EXISTS "created_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "business_account_id" integer REFERENCES "business_accounts"("id");

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "business_accounts_created_by_idx" ON "business_accounts"("created_by");
CREATE INDEX IF NOT EXISTS "business_account_members_business_account_id_idx" ON "business_account_members"("business_account_id");
CREATE INDEX IF NOT EXISTS "business_account_members_user_id_idx" ON "business_account_members"("user_id");
CREATE INDEX IF NOT EXISTS "listings_created_by_idx" ON "listings"("created_by");
CREATE INDEX IF NOT EXISTS "listings_business_account_id_idx" ON "listings"("business_account_id");
