-- Remove leads and viewings (visitors contact landlords directly)
DROP TABLE IF EXISTS "viewings" CASCADE;
DROP TABLE IF EXISTS "leads" CASCADE;
DROP TYPE IF EXISTS "lead_status" CASCADE;
