-- 0063 — landlord-declared "temporary rental only" flag.
--
-- A plain boolean, same shape as hasFiber/isGated (nullable, default false —
-- NOT NOT NULL, that shape belongs to verified/visited, a different class).
-- It does not change deposit/notice-period validation and carries no duration
-- or end-date of its own — see the architecture spine at
-- _bmad-output/planning-artifacts/architecture/architecture-stay-rental-supabase-2026-09-11/.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_temporary boolean DEFAULT false;
