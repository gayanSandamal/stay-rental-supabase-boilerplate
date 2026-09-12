-- 0064 — broker pivot: business-account KYC, property grouping, demand
-- instrumentation, and lead routing. All new surfaces are gated OFF by
-- default (enablePropertyGrouping, enableLeadRouting,
-- enableSelfServeBusinessAccounts) — this migration only adds the columns
-- and tables the code needs to exist; it activates nothing.
--
-- No DO blocks (see the splitStatements() note in CLAUDE.md — a DO block
-- collapses the rest of the file into one statement on replay). Every
-- statement is plain IF NOT EXISTS DDL.

-- Business account's own KYC, separate from any landlord's — see the
-- schema.ts comment on businessAccounts.kycVerified for why the old
-- always-false badge on business-published listings was attaching to the
-- wrong subject.
ALTER TABLE business_accounts ADD COLUMN IF NOT EXISTS kyc_verified boolean NOT NULL DEFAULT false;
ALTER TABLE business_accounts ADD COLUMN IF NOT EXISTS kyc_verified_at timestamp;
ALTER TABLE business_accounts ADD COLUMN IF NOT EXISTS kyc_verified_by integer REFERENCES users(id);

-- One property, many agent attachments (Phase 2 — gated, Gate 1 not yet met
-- in production at the time this shipped: 1 active listing).
CREATE TABLE IF NOT EXISTS properties (
  id serial PRIMARY KEY,
  fingerprint varchar(64) NOT NULL,
  city varchar(100) NOT NULL,
  district varchar(100),
  bedrooms integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS properties_fingerprint_idx ON properties (fingerprint);

CREATE TABLE IF NOT EXISTS property_agents (
  id serial PRIMARY KEY,
  property_id integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  listing_id integer NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
  fee_disclosed boolean NOT NULL DEFAULT false,
  fee_payer varchar(20),
  fee_amount integer,
  fee_notes text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_agents_property_id_idx ON property_agents (property_id);

-- Demand instrumentation (Phase 3's named blocker).
CREATE TABLE IF NOT EXISTS search_queries (
  id serial PRIMARY KEY,
  query_params text NOT NULL,
  city varchar(100),
  bedrooms integer,
  result_count integer NOT NULL,
  visitor_hash varchar(64),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_queries_created_at_idx ON search_queries (created_at);
CREATE INDEX IF NOT EXISTS search_queries_zero_result_idx ON search_queries (city, bedrooms) WHERE result_count = 0;

-- Broker-lead status enum + broker_leads table (Phase 3 — thinnest evidence
-- base of the three concepts per FORGE.md; ships instrumented, not
-- claimed-working).
--
-- NAMED "broker_leads", NOT "leads" — a "leads" table and a "lead_status"
-- enum already exist from 0001_stay_rental_transformation.sql (leftover CRM
-- scaffold from the upstream saas-starter fork: listing_id/assigned_to
-- columns, referenced by "viewings"). CREATE TABLE IF NOT EXISTS "leads"
-- would have silently no-op'd against that unrelated table and every insert
-- from this feature would have failed at runtime on a missing "city" column.
-- No DO block for the enum (see 0032's note) — CREATE TYPE is idempotent via
-- the runner, which skips "already exists" errors on replay.
CREATE TYPE broker_lead_status AS ENUM ('open', 'claimed', 'closed');

CREATE TABLE IF NOT EXISTS broker_leads (
  id serial PRIMARY KEY,
  city varchar(100) NOT NULL,
  district varchar(100),
  bedrooms integer,
  budget_min integer,
  budget_max integer,
  notes text,
  contact_phone varchar(20) NOT NULL,
  contact_name varchar(100),
  status broker_lead_status NOT NULL DEFAULT 'open',
  claimed_by_business_account_id integer REFERENCES business_accounts(id),
  claimed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broker_leads_status_city_idx ON broker_leads (status, city);

-- RLS: match the posture set for every other application table in 0026 —
-- service-role only, no direct client access. These are all read/written
-- exclusively through API routes using the service-role connection.
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_leads ENABLE ROW LEVEL SECURITY;
