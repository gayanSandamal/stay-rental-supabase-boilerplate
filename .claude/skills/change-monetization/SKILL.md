---
name: change-monetization
description: >
  Safely change Easy Rent's revenue model — visibility products
  (Boost/Featured/Urgent/bundles), landlord plan tiers, included Boosts, pricing,
  durations, or the search ranking order. Use whenever a task touches
  lib/landlord-plans.ts, the visibility API routes, getActiveListings ranking, or
  pricing UI. Encodes the business invariants that look like bugs but are intended.
---

# Change monetization safely

Model = **"Free listing + paid visibility"** (`Monetization Plan & Strategy - Reimagined Free Listing Paid Visibility.md`). Before editing, confirm which invariant you're touching.

## Invariants — do NOT break unless explicitly told to change the model

1. **Listings free & unlimited on every tier.** `LISTING_LIMITS` (`lib/landlord-plans.ts`) is `999999` everywhere by design. Don't add caps.
2. **Manual payment.** Stripe is NOT live billing. Landlords pay offline; **admin/ops activate** products. Every visibility route stays admin/ops-only (403 + "Contact support after payment" for others).
3. **Ranking is the product.** `getActiveListings` (`lib/db/queries.ts`) default order: **Featured → Boost → Urgent → plan tier → verified → completeness → newest**.

## Current pricing (LKR)
Boost 250/7d · Featured 500/7d (one per landlord) · Urgent 150/7d · Bundles: Quick Results 350, Priority Exposure 650, Starter 1,000 · Plans: Starter 900, Pro 2,500, Agency 5,000 per month.

## Common tasks

**Change a price or duration**
- Duration: the `*_DURATION_DAYS` const in the route (`app/api/listings/[id]/boost|feature|urgent/route.ts`).
- Price: it's display-only (manual payment), shown in `components/pricing-section.tsx` / plan forms / docs. Update all copies + the plan doc.

**Add a new visibility product**
1. Add a time-window column `xUntil timestamp` on `listings` (schema + migration via `add-db-migration`).
2. Add an `audit_action` enum value `listing_x_activated` (+ migration).
3. Create `app/api/listings/[id]/x/route.ts` copying the Featured route: admin/ops gate → validate id → set `xUntil = now + N days` → `logListingAction('listing_x_activated', ...)`.
4. Add it to ranking in `getActiveListings` as a `CASE WHEN ${listings.xUntil} > NOW() THEN 1 ELSE 0 END DESC` term, in the intended priority position.
5. Add the activation button (mirror `components/boost-listing-button.tsx`) and surface a badge on the card/detail.

**Change plan tiers / included Boosts / ranking weight**
- Edit `LISTING_LIMITS` (keep unlimited), `INCLUDED_BOOSTS_PER_MONTH`, `PLAN_TIER_WEIGHTS` in `lib/landlord-plans.ts`. Included-Boost consumption logic lives in `getIncludedBoostsRemaining()` + the boost route (resets at calendar-month boundary via `boostsUsedThisMonth`/`boostsMonthResetAt`).

**Reorder ranking**
- Edit only the `orderByArgs` default branch in `getActiveListings`. Explain the revenue effect of any reorder.

## Done checklist
- [ ] Free + unlimited listings preserved
- [ ] Visibility routes still admin/ops-only manual activation
- [ ] Time-windowed `*Until` columns used so `> NOW()` ranking works
- [ ] Activation audited; new enum value migrated
- [ ] Pricing reflected in route constants + UI + plan doc
