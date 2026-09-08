-- Close two tables that PostgREST was serving to the public.
--
-- Supabase grants `anon` and `authenticated` full DML on every table in
-- `public` by default, and relies on ROW LEVEL SECURITY to gate it. RLS is not
-- enabled automatically — a table created by a raw SQL migration has it OFF
-- until something says otherwise, and both of these were created that way.
--
-- Measured against production 2026-09-08: 25 of 27 tables had RLS on. These two
-- did not, and each granted anon SELECT, INSERT, UPDATE, DELETE and TRUNCATE
-- with zero policies. The anon key ships in the client bundle by design, so
-- both tables were readable and writable by anyone who loaded the site.
--
--   impersonation_sessions (0051) — the record of an admin viewing the app as
--     another user. Public write access here is the worse of the two: it is the
--     audit trail for the most sensitive action an operator can take.
--   post_imports (0057) — imported Facebook ads, including owner phone numbers
--     that were never published anywhere on the site.
--
-- WHY NO POLICIES. Enabling RLS with no policy denies anon and authenticated
-- everything, which is exactly right: neither table is reachable from the
-- browser. Both are server-only through Drizzle, and the app connects as
-- `postgres`, which owns them and carries rolbypassrls — so every server path
-- is unaffected. Verified before writing this: no `from('post_imports')` or
-- `from('impersonation_sessions')` anywhere in app/, lib/ or components/.
--
-- Adding a policy later is additive. Leaving RLS off is not.
--
-- Replay-safe: enabling RLS on a table that already has it is a no-op, and
-- there is no DO block (see the splitStatements note in CLAUDE.md).

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_imports ENABLE ROW LEVEL SECURITY;

-- Belt and braces: revoke the blanket grants as well, so the tables stay closed
-- even if RLS is ever switched off again by a future migration or a dashboard
-- click. The `postgres` owner is unaffected by either change.
REVOKE ALL ON public.impersonation_sessions FROM anon, authenticated;
REVOKE ALL ON public.post_imports FROM anon, authenticated;
