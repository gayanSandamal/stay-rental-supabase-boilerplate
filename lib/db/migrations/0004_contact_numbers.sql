-- Create user_contact_numbers table
CREATE TABLE IF NOT EXISTS "user_contact_numbers" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "business_account_id" integer REFERENCES "business_accounts"("id") ON DELETE CASCADE,
  "phone_number" varchar(20) NOT NULL,
  "is_whatsapp" boolean DEFAULT false NOT NULL,
  "label" varchar(50),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_contact_numbers_user_or_business_check" CHECK (
    ("user_id" IS NOT NULL AND "business_account_id" IS NULL) OR 
    ("user_id" IS NULL AND "business_account_id" IS NOT NULL)
  )
);

-- Create listing_contact_numbers junction table
CREATE TABLE IF NOT EXISTS "listing_contact_numbers" (
  "id" serial PRIMARY KEY NOT NULL,
  "listing_id" integer NOT NULL REFERENCES "listings"("id") ON DELETE CASCADE,
  "contact_number_id" integer NOT NULL REFERENCES "user_contact_numbers"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "listing_contact_numbers_unique" UNIQUE("listing_id", "contact_number_id")
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "user_contact_numbers_user_id_idx" ON "user_contact_numbers"("user_id");
CREATE INDEX IF NOT EXISTS "user_contact_numbers_business_account_id_idx" ON "user_contact_numbers"("business_account_id");
CREATE INDEX IF NOT EXISTS "listing_contact_numbers_listing_id_idx" ON "listing_contact_numbers"("listing_id");
CREATE INDEX IF NOT EXISTS "listing_contact_numbers_contact_number_id_idx" ON "listing_contact_numbers"("contact_number_id");

