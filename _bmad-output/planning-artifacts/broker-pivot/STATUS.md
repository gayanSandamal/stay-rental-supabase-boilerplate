# Broker Pivot — Implementation Status

**Date:** 2026-09-12

## Phase 0 — Decision artifacts: **Done**

- `FORGE.md` — all three concepts pressure-tested; Concept 1 (free broker back-office)
  cleared for build, Concept 2 (one property/every agent) confirmed correct-but-premature,
  Concept 3 (lead routing) confirmed blocked on demand data. Gate 0→1 answered: broker
  value on day one is free portfolio tooling, not traffic.
- `RESEARCH.md` — SL broker fee norms (~1 month, landlord-paid), the Rent Act's commission
  prohibition and its limited scope, ikman's fee threshold (LKR 10,000/mo), LPW's agent
  ecosystem scale. Flagged gap: no primary broker interviews (user's explicit choice) and
  no duplicate-listing teardown run yet — both needed before Phase 2 design.
- `POSITIONING.md` — the "no commission" vs "no middleman" split, file-by-file rewrite
  table, and why "no surprise fees" as a headline must wait for Concept 2's fee disclosure
  to actually exist.

## Phase 1 — Broker back-office: **Positioning + two safety fixes shipped; self-serve UI deferred**

**Shipped this pass:**

1. **Positioning rewrite applied** — 8 files, "no middleman/no agents" language removed
   per `POSITIONING.md`'s table; "no commission" claims left untouched. Verified zero
   remaining `no middleman|no agents` strings in shipping `app/`/`components/` code.
   `tests/unit/import-template.test.ts` (the pinned-copy test) still passes; full unit
   suite (1656 tests, 71 files) passes.
2. **`POST /api/listings` status gap closed** (`app/api/listings/route.ts`) — a
   non-admin/ops caller (landlord or broker) can no longer set `status` on creation; it's
   forced to `'pending'` regardless of what the request body sends. Previously any
   self-service caller could POST `{"status":"active"}` and publish unreviewed. This was a
   pre-existing hole the plan flagged as urgent specifically *because* broker volume makes
   it worth exploiting at scale.
3. **Listing expiry cron wired** — `app/api/cron/expire-listings/route.ts` created and
   registered in `vercel.json` (every 15 min, `CRON_SECRET`-gated, matching every other
   cron route's contract). `checkAndMarkExpiredListings()`
   (`lib/db/check-expired-listings.ts`) existed and worked but had **no caller anywhere**
   — expiry was enforced only at read time. A broker's 20-40 listings would otherwise
   silently vanish from search with no `'expired'` status ever written and no visibility
   into it.

**Deliberately not done this pass — needs a product decision first, not just code:**

- **Self-serve business-account UI.** Provisioning is still 100% back-office. Building a
  landlord/broker-facing "create a business account" flow is real UI + API work
  (`app/api/business-accounts/**` currently has no update/suspend endpoint at all) and
  should follow, not precede, Gate 1 validation that brokers actually want this.
- **Agency-tier / business-account decoupling.** `PLAN_TIER_WEIGHTS` ranks every listing a
  landlord owns at weight 3 if they're on the `agency` tier — granting that tier to a
  broker onboarding through the free back-office would bury every individual landlord's
  listing permanently. This needs a ranking-model decision (a separate, lower weight for
  "broker via business account, not paying for agency" vs. "paying agency tier"), not a
  quick patch — flagged in the plan, not resolved here.
- **`member.role` permission differentiation** and **trust-badge suppression on business
  accounts** (`publisher-info.ts:133-139` currently hides both badges for any business
  account) — both correctness issues, neither urgent until real business accounts exist.
- **`landlords.kycVerified` write path** ("verified broker") — no code writes it anywhere;
  building the verification flow itself is out of scope for a positioning/safety pass.

## Phase 2 — One property, every agent: **Not started, correctly gated**

Gate 1 (≥2 brokers, ≥40 active listings in one city) is nowhere close to met (production:
1 active listing). No schema/dedup work done, per the plan.

## Phase 3 — Qualified lead routing: **Not started, correctly gated**

No search-query logging exists; this phase's prerequisite (demand instrumentation) hasn't
been touched. Correctly last per the plan.

## Phase 4 — UX spines: **Not started**

Holding until Phase 1's self-serve/ranking decisions above are actually made — designing
`DESIGN.md`/`EXPERIENCE.md` against a self-serve broker flow that doesn't exist yet would
be speculative. Revisit once the two deferred Phase 1 decisions are resolved.

## What to do next

1. Deploy this pass (positioning + POST status fix + expiry cron) — low-risk, no schema
   changes, all tests green.
2. Decide the two deferred Phase 1 items above (self-serve business accounts, agency-tier
   ranking for brokers) — these are product calls, not further research.
3. Only then: build self-serve provisioning, re-check Gate 1, and move to Phase 2 design
   once real overlapping broker inventory exists to design against.
