-- Add auth_user_id to link public.users with Supabase auth.users
-- When running locally (no auth schema), add column without FK constraint
-- password_hash becomes nullable for new Supabase Auth users

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) UNIQUE;
  ELSE
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
