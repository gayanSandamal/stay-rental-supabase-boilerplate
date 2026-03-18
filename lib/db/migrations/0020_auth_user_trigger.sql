-- Trigger: when auth.users gets a new row, insert into public.users
-- Only runs when auth schema exists (Supabase). Skipped for local PostgreSQL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    -- SECURITY DEFINER allows the function to run with owner privileges (bypasses RLS)
    CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
    BEGIN
      INSERT INTO public.users (auth_user_id, email, role, subscription_tier)
      VALUES (NEW.id, NEW.email, 'tenant', 'free')
      ON CONFLICT (auth_user_id) DO NOTHING;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
  END IF;
END $$;
