-- Enable Row Level Security on all application tables.
-- All server-side data access goes through Drizzle ORM via DATABASE_URL
-- (postgres superuser), which bypasses RLS. The anon key is public
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), so without RLS any caller can read/write
-- tables directly via the Supabase REST API. Enabling RLS with no permissive
-- policies closes that gap while leaving Drizzle + supabaseAdmin (service_role)
-- completely unaffected.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landlords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contact_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_contact_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
