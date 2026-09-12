# Broker Pivot — Implementation Status

**Date:** 2026-09-12 (updated — Phases 1–4 completed at the user's explicit instruction to
proceed past the plan's own Gate 1)

## A note on the gate this overrides

The plan's Phase 1→2 gate was **≥2 brokers actively using the free back-office, and ≥40
active listings in one city** — measurable with one SQL query, and not close to met in
production (1 active listing at the time of writing). FORGE.md and the plan itself both
name the risk of building past that gate: *"a ninth workstream is the path of least
resistance… this is the modal outcome, not the tail risk."*

The user explicitly instructed completing Phases 1–4 anyway. That's a legitimate call —
it's their product — so this pass builds real, tested, working code for all three broker
concepts. The discipline that survives the override: **every new user-facing surface ships
behind a feature flag that defaults OFF** (`enableSelfServeBusinessAccounts`,
`enablePropertyGrouping`, `enableLeadRouting`), so the code existing is not the same as it
being live. Turning any of them on in production is a separate decision from this PR.

## Phase 0 — decision docs: **Done**

Unchanged from the prior pass — `FORGE.md`, `RESEARCH.md`, `POSITIONING.md` in this
folder.

## Phase 1 — Broker back-office: **Done**

Previously shipped (first pass): positioning rewrite, `POST /api/listings` status gate,
listing-expiry cron.

**Added this pass:**
- **Self-serve business-account creation** (`app/api/business-accounts/route.ts`,
  `app/(dashboard)/dashboard/business-account/page.tsx`) — behind
  `enableSelfServeBusinessAccounts`. A landlord can now create a business account and
  becomes its `owner` member automatically (tenant auto-upgrades to landlord, same rule as
  first-listing creation). Admin/ops-created accounts are unaffected.
- **`PATCH /api/business-accounts/[id]`** — closes the "no update endpoint at all" gap.
  Owner/admin members (or global admin/ops) can edit name/phone/address. `status` stays
  admin/ops-only by design — self-serve suspension isn't a real use case.
- **`member.role` permission differentiation** — the members POST/DELETE routes now accept
  an active account `owner`/`admin` (not only global admin/ops), while a plain `member`
  still cannot invite or remove teammates. Closes the flagged "member.role carries no
  differentiated permissions" gap for team management specifically (listing-level
  permissions in `lib/auth/listing-access.ts` are unchanged — still `isActive`-only, out of
  scope for this pass).
- **Business account's own KYC** (migration 0064: `business_accounts.kyc_verified` +
  `_at`/`_by`) — `lib/listings/publisher-info.ts` now surfaces the business account's own
  verification instead of always `false`. This was a real misattribution bug, not just a
  missing feature: the old code hardcoded `kycVerified: false` on every business-published
  listing because a *landlord's* KYC badge would have been the wrong subject; now the
  *business's own* KYC is the right subject and is surfaced correctly. `whatsappVerified`
  correctly stays `false` on the business path — there's no business-level WhatsApp
  verification concept, unlike an individual's `wa_phone`.
- **Agency-tier ranking weight**: confirmed, not changed. The code survey's finding that
  `PLAN_TIER_WEIGHTS` reads `landlords.landlordPlanTier` via `listings.landlordId` — never
  `businessAccountId` — turns out to already be correct: a business account does not
  automatically grant `agency` ranking weight. The risk the plan flagged is a **policy**
  risk (an admin manually granting `agency` tier to a broker account) not a code bug, and
  is noted here rather than "fixed," since there's nothing incorrect in the code to change.

## Phase 2 — One property, every agent on it: **Built, flag OFF**

- **Schema** (migration 0064): `properties` (fuzzy-fingerprinted physical units) +
  `property_agents` (per-listing attachment with optional fee disclosure:
  `fee_disclosed`, `fee_payer`, `fee_amount`, `fee_notes`). No "owner"/"claimed by" column
  on `properties` — FORGE.md's Concept 2 Q4 resolves the adjudication question as "the
  property record is neutral, agents are attachments, never claims to be won."
- **Matching** (`lib/properties/fingerprint-pure.ts`, unit-tested): normalizes
  address+city+bedrooms into a fuzzy fingerprint — lowercase, punctuation stripped,
  house-number filler words ("No.", "#") dropped, common street-word variants
  (Road→Rd, Street→St, etc.) collapsed. Directly fixes the gap RESEARCH.md and the code
  survey both named: the existing exact-match dedup in `app/api/listings/route.ts` and
  `lib/intake/checks.ts` never collides `"12 Galle Rd"` with `"No.12, Galle Road"`; this
  one does (asserted in `tests/unit/property-fingerprint.test.ts`, which also caught and
  fixed a real ordering bug in the first draft of the normalizer — punctuation was
  stripped before the filler-word check ran, so `"No."` never actually matched the filler
  list).
- **Wiring**: `attachListingToProperty` runs on listing creation
  (`app/api/listings/route.ts`), gated behind `enablePropertyGrouping`, never blocks or
  fails listing creation on error.
- **UI**: `components/sibling-agents.tsx`, rendered on the public listing page. Renders
  `null` whenever there's nothing to show — which, with one active listing in production,
  is every page load today. That's correct, dormant behavior, not a bug.
- **Not built**: fee-disclosure UI for the agent to actually enter their fee (the schema
  and read path exist; there is no write path/form yet — an agent's `property_agents` row
  is created with `feeDisclosed: false` and stays that way until a future form is built).
  Also not built: any adjudication UI for the (currently theoretical, since Gate 1 hasn't
  produced real overlapping listings) case of two agents disputing a grouping.

## Phase 3 — Qualified lead routing: **Built, flags OFF**

- **Demand instrumentation** (migration 0064: `search_queries`, default-ON flag
  `trackSearchQueries`) — the named Phase 3 blocker. Logs one row per genuine new search
  (`app/api/listings/paginated/route.ts`, page 1 only — scroll pages are not new demand
  signal) via `after()`, same deferred-write pattern as `trackImpressions`. A partial index
  on `result_count = 0` makes zero-result queries — "the single highest-signal input for
  which supply to onboard first" — directly queryable.
- **Lead routing** (migration 0064: `broker_leads` table + `broker_lead_status` enum,
  behind `enableLeadRouting`): public submission at `/request`
  (`app/api/leads` POST, rate-limited), broker-facing inbox at `/dashboard/leads`
  (business-account members only), first-claim-wins via a single guarded UPDATE
  (`app/api/leads/[id]/claim`) that reveals contact details only to the claimant, never in
  the open list.
  - **Naming note**: named `broker_leads`, not `leads` — a `leads` table and `lead_status`
    enum already existed in this database from the original `nextjs/saas-starter` fork's
    CRM scaffold (`0001_stay_rental_transformation.sql`, dropped again in
    `0014_drop_leads_viewings.sql`). Reusing "leads" would have been safe today (0014
    already dropped it) but `broker_leads` was kept anyway as the clearer, collision-proof
    name.
  - **No WhatsApp push.** FORGE.md is explicit this is the least-validated of the three
    concepts; brokers currently have to check `/dashboard/leads` themselves. A template
    registered with Meta is a separate, slower workstream this pass cannot do.
  - **`/request` has no nav link anywhere.** Reachable only by direct URL. This is
    deliberate for a first pass of the least-validated concept, not an oversight — see
    EXPERIENCE.md's Key Flows.
  - **Known rough edge**: a claimed lead's revealed contact is shown once, client-side,
    and is lost on page refresh (there is no "my claimed leads" view). Documented in
    EXPERIENCE.md as an accepted first-pass gap, not a finished feature.

## Phase 4 — UX spines: **Done**

`_bmad-output/planning-artifacts/ux-designs/ux-broker-pivot-2026-09-12/DESIGN.md` +
`EXPERIENCE.md`. Explicitly inherits the existing Tailwind 4 + shadcn-style design system
rather than inventing a new one — the only new element is the amber "undisclosed/pending"
caution surface, reused from tokens the back-office spine already defined but the
marketplace-facing pages hadn't used yet.

## Verification

**Updated after a second pass**: the gaps flagged in the first pass ("migration never run
against Postgres," "no manual QA") are closed. `open -a Docker`, `supabase start` (this
repo's own isolated local stack, ports 5434x per `supabase/config.toml`
`project_id = "stay-rental-supabase"` — never the BizAssist stack on 54321-54324), then:

- **Migration actually run, twice.** `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54342/postgres
  npx tsx lib/db/run-all-migrations.ts` applied all 64 files cleanly (17/17 statements OK
  on 0064). **Replayed a second time to prove the idempotency claim, not just assert it**:
  every statement in 0064 correctly no-ops (`⏭ Skipped` / `NOTICE: already exists,
  skipping`) — safe under this runner's replay-every-file-every-time contract.
- **`pnpm db:check-drift` run against the same instance**: `✅ No drift. 31 tables
  checked.` — `schema.ts` matches the live database exactly, including every new
  0064 table/column.
- **A real bug found and fixed by this verification that unit tests could not have
  caught**: `app/(dashboard)/listings/[id]/page.tsx` has its OWN separate, inline
  publisher-resolution block — it does not call `resolvePublishers()` from
  `lib/listings/publisher-info.ts`. The earlier pass fixed the business-KYC badge in
  `publisher-info.ts` (used by search result cards) and believed that covered the
  listing detail page too; it does not. The detail page still hardcoded
  `kycVerified: false` on the business path until this pass, caught only by actually
  opening a business-published listing in a browser and seeing no badge where one was
  expected. Now fixed identically (`businessAccount.kycVerified`), verified rendering
  "Verified landlord" next to "Priya's Property Group" in both places that variable
  feeds (Publisher Information card and the Contact Publisher box).
- **Self-serve business account flow — a second real bug found and fixed.** The invite
  form (reused from the back-office original) called `GET /api/user?email=` to resolve
  a user before inviting them — that endpoint is admin/ops-only (it returns
  phone/subscription PII), so every self-serve invite by a plain landlord/owner 404'd
  with "User not found," even for a real, existing user. Fixed by moving the email
  lookup server-side into `POST /api/business-accounts/[id]/members` itself (exposing
  only existence, never PII, to the caller) and simplifying the client form to submit
  the email directly. Verified end-to-end: signed in as `landlord@test.com`, created
  "Priya's Property Group," then successfully invited `ops@easyrent.com` as a member
  and confirmed the row in `business_account_members`.
- **Phase 2 (property grouping) verified end-to-end through the real API**, not a
  synthetic unit call: two listings POSTed via `/api/listings` with address spellings
  `"14 Lotus Road"` and `"No.14, Lotus Rd"` (same city, same bedroom count) both landed
  in the same `properties` row (confirmed via `property_agents` join in
  `psql`), and opening the first listing's public page rendered the amber "Also listed
  by 1 other agent" panel with a working link to the second, exactly as designed in
  `EXPERIENCE.md`'s Key Flows. Test rows removed afterward.
- **Phase 1's `POST /api/listings` status gate independently reconfirmed**, unplanned:
  while setting up the property-grouping test, a plain landlord's request for
  `status: 'active'` landed `'pending'` as expected, and a landlord's attempt to create a
  listing under a landlord id they don't own returned 403 — both pre-existing/first-pass
  behaviors, both re-observed live under real auth.
- **Phase 3 (leads) verified end-to-end**: `POST /api/leads` with the flag on persisted a
  real row; `GET /api/leads` correctly 401'd unauthenticated and 404'd with the flag off;
  signed in as a business-account member and used the actual `/dashboard/leads` UI to
  claim a lead — the button transformed in place into the revealed phone number, the DB
  row moved to `status='claimed'` with the correct `claimed_by_business_account_id`, and
  the second lead stayed `open` for a different member.
- **`next build` succeeds** with all new routes compiling (checked in the first pass,
  reconfirmed unaffected by this pass's fixes via `tsc`).
- **Naming collision check**: a `leads` table + `lead_status` enum already existed (and
  were already dropped) from the upstream fork's scaffold. Renamed to
  `broker_leads`/`broker_lead_status` to avoid any ambiguity — confirmed harmless either
  way once the migration was actually run, but kept for clarity.
- **Tests**: full unit suite green — **1662/1662 passing**, 72 files, reconfirmed after
  every fix in this pass. `tests/unit/property-fingerprint.test.ts` (6 new tests) caught
  a real normalization-order bug before the first merge. Two pre-existing tests updated
  to match intentional behavior changes: `tests/unit/reserved-slugs.test.ts` (added
  `/request`) and `tests/unit/verification-badges.test.ts` (business-path KYC in
  `publisher-info.ts` now reads the business account's own field).
- **`npx tsc --noEmit`**: clean throughout, checked after every batch of changes in both
  passes.
- **Still not done**: this migration has not been run against **production** — only
  against the isolated local stack. `pnpm db:migrate-all` against production, followed by
  `pnpm db:check-drift` against production, are still required before this deploys, per
  CLAUDE.md. Local verification is strong evidence the migration is safe; it is not a
  substitute for running it against the actual target database.
- Test data created during verification (synthetic listings, the two test leads) was
  removed from the local stack afterward; the test business account
  ("Priya's Property Group," its two members, `kycVerified: true`) and the flag overrides
  in the local `feature_flags` table were left in place — harmless, local-only, and not
  part of this PR's diff (the local stack is not committed anywhere).
