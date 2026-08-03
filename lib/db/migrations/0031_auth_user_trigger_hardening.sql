-- Harden the 0020 auth-user trigger so it can never fail the auth.users insert.
--
-- Two failure modes it currently has:
--  (a) an auth user with no email (phone-only) inserts NULL into
--      public.users.email, which is NOT NULL → the whole signup fails;
--  (b) an email that already exists on another public.users row raises
--      unique_violation → signup fails with "Database error saving new user".
--      (b) is a LIVE bug today for anyone whose email exists as a legacy row.
--
-- It deliberately does NOT attach auth_user_id to a pre-existing row by email
-- match: that would be account takeover by signing up with someone else's
-- address. Callers reconcile by auth_user_id instead.
--
-- MUST stay a single DO block with nothing after it: the migration runner's
-- splitStatements() opens a dollar block on `DO $$` and only closes it on a
-- line that is exactly `$$;`, which neither `$fn$;` nor `END $$;` matches.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
    DECLARE
      v_email varchar(255);
    BEGIN
      v_email := COALESCE(
        NULLIF(NEW.email, ''),
        'auth-' || NEW.id::text || '@placeholder.easyrent.lk'
      );
      BEGIN
        INSERT INTO public.users (auth_user_id, email, role, subscription_tier)
        VALUES (NEW.id, v_email, 'tenant', 'free')
        ON CONFLICT (auth_user_id) DO NOTHING;
      EXCEPTION WHEN unique_violation THEN
        RAISE WARNING 'handle_new_auth_user: email % already present, skipped', v_email;
      END;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
  END IF;
END $$;
