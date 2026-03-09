-- Drop old tables (in reverse dependency order)
DROP TABLE IF EXISTS "activity_logs" CASCADE;
DROP TABLE IF EXISTS "invitations" CASCADE;
DROP TABLE IF EXISTS "team_members" CASCADE;
DROP TABLE IF EXISTS "teams" CASCADE;

-- Create new enum types
CREATE TYPE "user_role" AS ENUM('tenant', 'landlord', 'ops', 'admin');
CREATE TYPE "listing_status" AS ENUM('pending', 'active', 'rented', 'archived');
CREATE TYPE "lead_status" AS ENUM('new', 'contacted', 'view_scheduled', 'no_show', 'interested', 'closed_won', 'closed_lost');

-- Alter users table
ALTER TABLE "users" 
  DROP COLUMN IF EXISTS "role";
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" "user_role" DEFAULT 'tenant' NOT NULL;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone" varchar(20);

-- Create landlords table
CREATE TABLE IF NOT EXISTS "landlords" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"nic" varchar(20),
	"ownership_doc_url" text,
	"kyc_verified" boolean DEFAULT false NOT NULL,
	"kyc_verified_at" timestamp,
	"kyc_verified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landlords_user_id_unique" UNIQUE("user_id")
);

-- Create listings table
CREATE TABLE IF NOT EXISTS "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"landlord_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" "listing_status" DEFAULT 'pending' NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) DEFAULT 'Colombo' NOT NULL,
	"district" varchar(100),
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"property_type" varchar(50),
	"bedrooms" integer NOT NULL,
	"bathrooms" integer,
	"area_sqft" integer,
	"rent_per_month" numeric(12, 2) NOT NULL,
	"deposit_months" integer DEFAULT 3,
	"utilities_included" boolean DEFAULT false,
	"service_charge" numeric(12, 2),
	"power_backup" varchar(50),
	"water_source" varchar(50),
	"water_tank_size" integer,
	"has_fiber" boolean DEFAULT false,
	"fiber_isps" text,
	"ac_units" integer,
	"fans" integer,
	"ventilation" varchar(50),
	"is_gated" boolean DEFAULT false,
	"has_guard" boolean DEFAULT false,
	"has_cctv" boolean DEFAULT false,
	"has_burglar_bars" boolean DEFAULT false,
	"parking" boolean DEFAULT false,
	"parking_spaces" integer,
	"pets_allowed" boolean DEFAULT false,
	"notice_period_days" integer DEFAULT 30,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by" integer,
	"visited" boolean DEFAULT false NOT NULL,
	"visited_at" timestamp,
	"visited_by" integer,
	"photos" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_pinged_at" timestamp
);

-- Create leads table
CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"tenant_name" varchar(100) NOT NULL,
	"tenant_email" varchar(255) NOT NULL,
	"tenant_phone" varchar(20) NOT NULL,
	"preferred_date" timestamp,
	"preferred_time" varchar(50),
	"notes" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create viewings table
CREATE TABLE IF NOT EXISTS "viewings" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"confirmed_by_landlord" boolean DEFAULT false,
	"confirmed_by_tenant" boolean DEFAULT false,
	"notes" text,
	"outcome" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create saved_searches table
CREATE TABLE IF NOT EXISTS "saved_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"search_params" text NOT NULL,
	"email_alerts" boolean DEFAULT true,
	"whatsapp_alerts" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "landlords" ADD CONSTRAINT "landlords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "landlords" ADD CONSTRAINT "landlords_kyc_verified_by_users_id_fk" FOREIGN KEY ("kyc_verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_visited_by_users_id_fk" FOREIGN KEY ("visited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

