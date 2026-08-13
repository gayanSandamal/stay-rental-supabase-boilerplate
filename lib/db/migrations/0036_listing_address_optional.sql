-- A recognised town is location enough to publish.
--
-- Landlords routinely give only a town ("Pannipitiya", "Gampaha") and will not
-- put an exact street address in a public ad; WhatsApp location pins are
-- unreliable too. With address NOT NULL those submissions could never become
-- listings — the intake asked for a street address forever and the sender gave
-- up. computeMissingFields now waives the address only when the city resolved
-- to a gazetteer town, so a listing is never left with no reliable location.
--
-- Dropping NOT NULL is idempotent in Postgres: re-running it on a column that
-- already allows nulls is a no-op, which matters because run-all-migrations.ts
-- replays every numbered file on every invocation. No data is touched.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'address'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE listings ALTER COLUMN address DROP NOT NULL;
  END IF;
END
$$;
