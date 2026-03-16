-- Add auth_user_id to link public.users with Supabase auth.users
-- password_hash becomes nullable for new Supabase Auth users

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
