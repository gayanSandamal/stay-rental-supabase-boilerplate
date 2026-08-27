# Easy Rent — Monetization Review & Revised Plan

**Date:** 2026-08-27
**Question asked:** *"Is a token/credit mechanism a good way for Easy Rent to earn money without retroactively charging for features given away free? If not, what's better?"*
**Status of this document:** Supersedes the sequencing in `Monetization Plan & Strategy - Reimagined Free Listing Paid Visibility.md`. That document's product model (free listings + paid visibility) stands; its **timeline, break-even arithmetic and revenue projections do not.**

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What was verified](#2-what-was-verified)
3. [Verdict on the token proposal](#3-verdict-on-the-token-proposal)
4. [The gate problem](#4-the-gate-problem)
5. [The 45-day experiment](#5-the-45-day-experiment)
6. [Revenue lines, ordered](#6-revenue-lines-ordered)
7. [Cost model — what is missing](#7-cost-model--what-is-missing)
8. [Defects found](#8-defects-found)
9. [Implementation](#9-implementation)
10. [Verification](#10-verification)
11. [How this fails](#11-how-this-fails)
12. [Explicitly not doing](#12-explicitly-not-doing)
13. [Corrections made during this review](#13-corrections-made-during-this-review)
14. [Sources](#14-sources)

---

## 1. Executive summary

**Do not build a token system.** Not because the instinct is bad — roughly a third of it is right — but because the problem it solves does not exist yet, and the part that would cause harm (the free grant) recreates the exact problem you were trying to avoid.

**The premise behind the question is false, which is good news.** You believed you had given social sharing away free. You have not: `enableSocialAutoPublish: false`, every entry point returns early, and **zero landlords have ever received the consent prompt.** Likewise `enablePricingSection: false` — **no price has ever been displayed on easyrent.lk.** You are pre-revenue with a clean slate, which is the best possible position.

**The real finding is not about monetization at all.** Eight major systems are built and switched off. 122 commits in August 2026 alone — a Sinhala/Tamil gazetteer, an LLM moderation stack, social publishing to three platforms with rate-limit handling and takedown reconciliation — and **26 listings.** The bottleneck is not engineering capacity. It is that finished work is not reaching users. Any plan whose main content is "build more" treats the wrong constraint.

**The plan, in one paragraph:** Install analytics (one day). Fix three live security holes (one day). Then spend 45 days finding out whether a Sri Lankan landlord will pay LKR 250 — using code that already exists and is switched off. Everything else is gated on that answer.

---

## 2. What was verified

Every claim below was checked against the code, not inferred.

### 2.1 Commercial state

| Question | Answer |
|---|---|
| Live in production? | **Yes** — easyrent.lk on Vercel + Cloudflare since ~June 2026 |
| Monetization live? | **No** — `enablePricingSection: false`; all pricing UI and upgrade CTAs hidden |
| Payments wired? | **No** — Stripe is in `package.json` but never imported outside `lib/db/setup.ts` |
| Revenue to date? | **No evidence of any.** Nothing in the system can even record it |
| Traffic? | **Unmeasured** — zero analytics installed (no GA, gtag, Plausible, PostHog, `@vercel/analytics`) |
| Listings? | **~26 ever created**, inferred from sequential IDs in the repo's own post-mortems |
| Social publishing? | **Never run.** `enableSocialAutoPublish: false` |

### 2.2 Financial records

There is **no wallet, ledger, balance, order, invoice, transaction or payment table anywhere** in `lib/db/schema.ts`. Today an activation leaves an audit row with no amount, no method and no reference. You cannot answer *"how much revenue did we book last month"* or *"did this landlord actually pay."*

### 2.3 What is genuinely free today

**Load-bearing and deliberate** — charging later would be retroactive:
- Unlimited active listings on every tier (`LISTING_LIMITS` = 999999, an intentional product invariant)
- Public contact numbers with zero gating — no login, no reveal endpoint, no rate limit
- WhatsApp concierge intake end-to-end, including real per-message Meta costs
- Free phone verification → the "Verified" chip on numbers
- 3 saved searches + unlimited email alerts for tenants
- 6 photos per listing

**Built but never shipped** — safe to price at launch, because nobody has ever had it:
- Social auto-publish
- Boost / Featured / Urgent / bundles (already ops-only manual activation)
- Analytics, bulk renew, custom profile slug (already tier-gated, invisible while pricing is off)

**Free by accident** — see [§8](#8-defects-found).

### 2.4 Competitive position

| Platform | Rental listings | Free tier | Paid |
|---|---|---|---|
| **LankaPropertyWeb** | 8,240+ (3,230+ Colombo apartments) | Free, 90-day ads | Agent packages, paid agent verification |
| **ikman.lk** | 3,611+ houses, 2,648+ apartments | **Free only** for houses/land/commercial under LKR 10,000/mo rent, apartments under LKR 20,000/mo | Listing fee above those thresholds (~LKR 200 promotional); Boost Ads from **LKR 150** |
| **Easy Rent** | ~26 | Free, unlimited, all tiers | Nothing sold yet |

**Two implications nobody has written down:**

1. **ikman charges landlords to list rentals above LKR 10,000/month.** So willingness-to-pay for property listings already exists in this market, and free unlimited listings is a **genuine competitive wedge**, not just generosity. The positioning is not "cheaper boosts" — it is *"free to list the properties ikman charges you to list."*
2. **ikman's Boost starts at LKR 150; the planned Easy Rent Boost is LKR 250** — a 67% premium over the dominant player for a fraction of the audience. No strategy document mentions this.

---

## 3. Verdict on the token proposal

### 3.1 What is wrong with it

**1. The free grant is the fatal part, and it recreates the problem it was meant to solve.**
The first Boost anyone buys is bought with money you gave them, so you learn **nothing** about willingness to pay — destroying the single signal you most need at 26 listings. Worse, it anchors the market price of a Boost at zero, so the first real charge *is* taking something away. *"I can't charge for what was free, so I'll give tokens"* becomes self-refuting the moment the tokens are granted.

**2. "200 tokens to share on social" prices the wrong action.**
Posting a listing to *Easy Rent's own* Facebook / Instagram / TikTok is **Easy Rent's marketing**, not a favour to the landlord. Every post is a free advertisement for easyrent.lk that drives traffic back and grows the audience that makes the marketplace worth anything. Charging for it means fewer posts → smaller audience → weaker marketplace. Neither ikman nor LankaPropertyWeb has an equivalent; it is a differentiator, not a SKU.

**3. Wrong unit for the buyer.**
A one-house landlord transacts once every 1–3 years. A wallet is a **stock**; their need is a **flow of one**. A balance that sits idle and then expires makes them feel cheated. Every wallet benefit accrues to brokers — 5–10% of accounts. This is exactly why Bayut's credit system works: it sells to *agents buying packages*, high-frequency multi-SKU professionals, not to individual landlords.

**4. Stored balances are a liability** — refund obligations, possible e-money treatment, and a support burden, for a solo founder.

### 3.2 What is right — the steelman

- **Prepaid "reload" culture is real and native.** Dialog/Mobitel top-ups, eZ Cash, mCash, FriMi. "Load value, spend it down" is arguably *more* familiar in Sri Lanka than card subscriptions. A cognitive-load objection does not survive this.
- **Fee amortisation is a real argument.** PayHere is 2.69–3.30% *plus*, on most Sri Lankan gateways, a fixed per-transaction component. On a **LKR 150 Urgent badge that floor can push the effective rate past 10%.** Bundling ten Boosts into one LKR 2,500 top-up cuts transaction count 10×. For LKR 150–250 microtransactions, prepayment is close to necessary.
- **Cash flow and breakage.** LKR 5,000 today from ten landlords beats LKR 250 ten times over four months when burning LKR 48,000/month. Prepaid breakage commonly runs 5–15%.

### 3.3 The honest conclusion

**This is not a rejection of the idea. It is a rejection of the *grant* and the *invented unit*, keeping the *prepayment*.**

| Reject | Keep — later, brokers only |
|---|---|
| An invented currency ("2,000 tokens") | A prepaid balance **priced in LKR, denominated in the product**: *"LKR 2,500 credit = 12 Boosts"* |
| A signup grant of free tokens | A **discount** on the top-up (12 Boosts at LKR 208 each instead of 250) |
| Tokens earnable through actions | Earned Boosts as an explicit, bounded reward — never a currency |

A discount preserves the price anchor. A gift destroys it.

This generalises a primitive that already exists — `INCLUDED_BOOSTS_PER_MONTH` in `lib/landlord-plans.ts` plus `landlords.boostsUsedThisMonth`. Roughly a week of work. **But not until [§5](#5-the-45-day-experiment) returns a positive answer.**

---

## 4. The gate problem

### 4.1 "Hold until 300 active listings" is effectively "never"

- 26 listings over ~3 months ≈ **8.7/month**. `(300 − 26) / 8.7 ≈ 31 months`.
- Listings expire at 30 days. At ~50% renewal, steady-state *active* ≈ 2× monthly creations, so **300 active requires ~150 new listings/month — 17× current rate.**
- It carries no date, no kill criterion, and no revenue in any of its steps. Combined with a founder whose revealed preference is building, it becomes a principled reason to never face a customer.

### 4.2 Selling visibility without scarcity is selling nothing

Boost works because search results are a scarce, contested resource. **With 26 listings, a search for "Colombo 2BR" returns everything on page one. There is no position to buy.** Paying LKR 250 to rank above 25 listings that are all already visible has zero utility, and a landlord works that out in four seconds.

Visibility products need **inventory density within a query** — realistically 30–50 listings competing on the same city + bedrooms + price band.

### 4.3 The two gates that replace it

> **Gate A — selling Boost:** Boost goes on sale **in a city** when that city has **40+ active listings**.
> Measurable today with one SQL query. Honest. Scales per-market. Lets Colombo monetize while the rest of the country stays free.

> **Gate B — building billing:** No PayHere checkout, no orders table, no credits until **10 manual paid activations from 10 distinct landlords**.
> Before that, manual bank transfer + a back-office click is strictly better: zero fees, zero build, and a forced human conversation with every paying customer — which at this stage *is* the product research.

---

## 5. The 45-day experiment

**Everything below already exists and is switched off. It ships no new code, which is precisely why it is the right test.**

| Day | Action |
|---|---|
| **1** | **Install analytics.** Nobody knows whether easyrent.lk gets 10 visitors a month or 10,000. Every number in every strategy document is arithmetic on an unknown. This is the only genuine blocker. |
| **1–5** | **Fix the three live security holes** ([§8.1](#81-live-security-holes)). One of them lets any landlord award themselves your Verified badge. |
| **2–45** | **Sell 10 Boosts by phone.** Flip `enablePricingSection`. Call all 26 existing landlords plus the next 30: *"LKR 250 puts your listing at the top of Colombo search for 7 days — bank transfer, and I'll activate it."* The boost endpoint exists, is admin/ops-only, and manual activation after bank transfer is already the documented flow in `CLAUDE.md`. |
| **Ongoing** | **Turn on what is already built and off** — moderation, image processing, social auto-publish. Unshipped work is worth zero and is already paid for. |

**Hard deadline: first LKR from a landlord by day 45, whatever the listing count.**

### What the result means

| Outcome | Read | Next |
|---|---|---|
| **≥10 of 56 pay** | Willingness to pay is real | Build the roadmap. Gate Boost per-city at 40+ listings. Price at LKR 150 to match ikman. |
| **1–9 pay** | Product works; price or moment is wrong | Iterate on price and pitch — still without code |
| **0 pay** | The free-listing/paid-visibility thesis is dead at this scale | Learned in 45 days for the cost of phone calls, instead of in 31 months |

---

## 6. Revenue lines, ordered

### 6.1 Landlord paid visibility — first, and the only one testable now

Already built, already manual, already correct. [§5](#5-the-45-day-experiment) is the test.

**Price at LKR 150, not 250.** Match ikman rather than charging a 67% premium for a fraction of the audience. Lead with the wedge that actually differentiates: *free to list the properties ikman charges you to list*, a concrete, checkable ~LKR 200 saving aimed at exactly the landlords worth having.

### 6.2 Broker supply deals — sell labour, not traffic

A Colombo broker will not pay LKR 5,000/month to reach 26 listings; the rational allocation is ~33 ikman Boosts at LKR 150 in front of the largest audience in the country.

Sell **labour, priced per listing** instead: *"Send us your 40 properties on WhatsApp, we list all of them, LKR 100 each."* LKR 4,000 from one broker, a one-time ask rather than a subscription commitment, justified by **your work** rather than **your traffic** — so the "you have no audience" objection does not apply. It runs on the concierge pipeline that is already built and switched off, and it converts a broker into a supply partner whose inventory makes the site worth visiting.

> ⚠️ **Break-even correction.** "4 agencies × LKR 5,000 = LKR 20,000 covers the ~18k infra cost" silently deletes the LKR 30,000 salary from the stated LKR 48,000 base. Real break-even is `48,000 / 5,000 = 9.6`; at PayHere 3.30% each account nets LKR 4,835 — so **10 accounts, not 4.** A 150% understatement.

### 6.3 Verification — split the word, sell the remote part

**Physical visits lose money.** A Nugegoda round trip is ~4 hours plus LKR 500–1,500 transport ≈ **LKR 1,750 direct cost**. At LKR 1,500 you lose on every visit. At LKR 2,500 you make LKR 750, and maximum throughput of ~40 visits/month consumes **100% of your only employee** for LKR 30,000 of gross margin — net contribution zero. A Jaffna visit is a two-day trip for LKR 2,500.

There is also **liability**: taking money for "verified" makes it contractual rather than casual. A verified property that turns out to be subletting fraud gives you a duty of care, no professional indemnity cover, and destroys the one asset the whole product is built on.

**Sell the remote, automated, defensible version — ~80% of it exists:**

| Claim | Status |
|---|---|
| "Contact verified" | `enablePhoneVerification` already **ON** |
| "Photos checked" | Moderation pipeline exists, flag off |
| "Documents seen" | Landlord uploads deed/bill/ID, ops reviews remotely. 5 minutes, no travel, no scale ceiling. `landlords.kycVerified` / `kycVerifiedAt` / `kycVerifiedBy` already exist and nothing writes them |

If paid visits ever happen, price at **true cost — LKR 7,500 in Colombo**, quoted per district, bookable only where you have someone. If nobody pays LKR 7,500, nobody wanted it.

The badge must state exactly what was and was not checked: *"We confirmed the phone number and reviewed an ownership document. We have not visited this property."* **Your codebase already holds this standard** — it refuses to show `posted` for a dry run and refuses to claim an Instagram takedown it cannot perform. The strategy should not fall below the code.

### 6.4 Third-party referrals — demoted, and capped at zero code

**The arithmetic at current scale:** 9 listings/month × 20% want a mover × 30% convert × LKR 1,500/lead = **LKR 810/month.** Across every listing the platform has *ever* had: **LKR 2,340.** That does not pay the domain renewal. Reaching LKR 20,000/month needs ~450 new listings/month — 50× current.

Structurally weaker than assumed, too:
- SLT/Dialog channel-partner programmes need a registered entity, an agreement and volume commitments, paying 30–90 days after activation.
- Movers and cleaners are informal and cash-based with no referral-tracking infrastructure. The realistic model is a flat LKR 2,000–5,000/month from one local vendor, negotiated in person.
- **Tenant insurance is regulated** — a referral fee may make you an unregistered insurance intermediary under IRCSL rules. That is legal exposure, not a revenue line.

And it is the most seductive kind of distraction: revenue work requiring zero product decisions and zero customer rejection. A founder avoiding *"will a landlord give me LKR 250?"* can spend six months in meetings with Dialog and call it monetization.

> **Rule: no schema, no tracking table, no partner portal, no code of any kind.** One WhatsApp group, two movers, cash. LKR 10,000 in a month or it does not exist.

### 6.5 The missing half — there is no demand-side plan at all

Both strategy documents are 100% supply-side. **Not one line about acquiring renters** — no renter CAC, no channel, no SEO plan beyond a passing mention of area pages.

But a rental marketplace's value to a landlord **is tenants**. You can hit 300 listings and have zero business, because 300 listings with no renters produce zero inquiries, zero renewals, and zero willingness to pay for visibility.

The `create-area-landing-page` skill exists in `.claude/skills/` and the area pages have never been built — `LAUNCH_READINESS.md` item #8 calls them *"the #1 SEO acquisition lever per the marketing strategy."* The `zero_result_search` event ([§9.2](#92-analytics--day-1-the-only-real-blocker)) tells you exactly which city to go get supply in.

### 6.6 Australia — remove it from planning documents

Australia is an REA Group / Domain duopoly where rental supply arrives almost entirely from licensed agents via feed integrations from property-management software.

- **The supply mechanic does not exist as a behaviour there.** "Landlord WhatsApps 6 photos" is not how Australian rental supply is created.
- **Every differentiator is worthless.** Power backup, water source, fiber, deposit-in-months, notice period — in Australia electricity is reliable, water is mains, NBN is universal, and bond is legally standardised at 4 weeks and lodged with a state authority. That is not an adaptation cost; that is the product.
- **Regulation is per-state** across 8 jurisdictions, with agent licensing, rent-bidding bans and prescribed disclosures.
- **The payment rail does not port** — PayHere is SL-only, and Stripe will not onboard an SL merchant.
- REA charges agents **AUD 599–799/month** with increases reported up to 80%; the ACCC is probing them, and CoStar-backed Domain is counter-attacking with free professional photography, floor plans, Matterport and drone imagery. Entering bootstrapped, against two well-capitalised incumbents in an active price war, is not credible.

**The specific harm:** justifying agency accounts because "it ports to Australia" is a bad reason to pick a product, and the kind that survives contact with reality far too long. If broker deals are right, they are right because Colombo brokers pay.

**Credible version of the same ambition:** *"the rental-first platform for markets where the resilience of the house is part of the decision"* — Bangladesh, Pakistan, Nepal, the Philippines, Indonesia. Same power/water/generator/fiber problem, same informal-landlord supply behaviour, same WhatsApp channel, no duopoly. Roadmap slide only, until Sri Lanka does LKR 200,000/month.

---

## 7. Cost model — what is missing

### 7.1 WhatsApp templates — the largest unmodelled line in the business

Two separate things:

**Inbound auto-replies are ~free today.** The intake pipeline is user-triggered and answers inside the 24-hour service window. ⚠️ **From 1 October 2026 service messages become billable per message**, and utility templates lose in-window free status. Meta publishes Sri Lanka rates by **1 September 2026**. So this stops being free in weeks — but it was never the big number.

**The big number is outbound templates.** Expiry reminders, renewal nudges, and boost upsells — the strategy document explicitly instructs ops to *"contact landlords and suggest Boost / Featured upgrades"* — **all require templates, which are billed per message**, and a boost upsell is unambiguously *marketing*, the most expensive category.

| Scale | Templates/month | At ~LKR 15 each |
|---|---|---|
| 1,500 active listings × 4 touches | 6,000 | **LKR 90,000/month** |
| 3,000 active listings × 4 touches | 12,000 | **LKR 180,000/month** |

Against a stated cost base of **LKR 48,000/month** and a six-month revenue target of **LKR 181,500**. **The business becomes less solvent the better it does**, and none of it appears in any document.

**Mitigations:**
1. Pull Meta's Sri Lanka rate card when published (1 Sep) and put a real line in the cost model.
2. **Route every non-urgent landlord message to email first** — Resend is already wired in `lib/email.ts` at roughly LKR 0.03/message versus LKR 15.
3. **Never send a marketing template.** Make the boost upsell a reply inside an open service window, or an in-app notification — the `notifications` table exists. Both free.
4. Hard monthly template-spend cap behind a kill switch; the feature-flag infrastructure already supports it.
5. Route acquisition through **Click-to-WhatsApp ads / Facebook Page CTA buttons** — those still open a **72-hour free entry-point window**. Current entry points are plain `wa.me` links (`lib/site-config.ts:31`), which do **not** qualify.

### 7.2 Costs that are fine

**Moderation LLM is genuinely negligible** — ~USD 0.002–0.005 per listing, under LKR 5,000/month even at 3,000 listings, because images are downscaled to a 1280px long edge before the vision call. Good engineering; no action needed.

### 7.3 Costs that are a curve, not a constant

**Supabase storage.** 3,000 listings × 6 photos × ~1.5MB = **27GB/month of monotonically growing storage**, plus derived WebP, plus egress on every social fetch and page view. Pro includes 100GB/250GB. You cross it inside a year. The LKR 15,750 figure is a snapshot at 26 listings.

**PayHere floor fees** on LKR 150 products — potentially 10%+ effective.

### 7.4 The break-even in the existing plan is arithmetically impossible

*"192 Boosts/month × LKR 250 = LKR 48,000."*

192 boosts × 7 days = 1,344 boost-days ÷ 30 = **45 listings boosted simultaneously, at all times.** Against 26 total listings that is impossible even at 100% penetration. Even at 300 active listings it implies **15% of all inventory permanently boosted** — several times typical promoted-listing penetration on classifieds. And it is gross of PayHere: net LKR 46,416.

### 7.5 The plans cannot sell themselves

| Plan | Price | Included boosts | Face value | Multiple |
|---|---:|---:|---:|---:|
| Starter | 900 | 1 | 250 | **3.6×** |
| Pro | 2,500 | 3 | 750 | **3.3×** |
| Agency | 5,000 | 6 | 1,500 | **3.3×** |

Because `LISTING_LIMITS` is 999999 on every tier by design, the plans have no listing-cap benefit to sell — only boosts, priced at 3.3–3.6× face value. No rational landlord upgrades. Yet **LKR 81,500 of the LKR 181,500 month-6 projection — 45% — comes from these plans.** It is the least achievable line in the model.

Either give the plans a real non-boost benefit (bulk upload, agency profile page, lead export, response SLA — `bulk-renew` being Agency-gated is a decent start) or delete the plans and sell à la carte.

---

## 8. Defects found

All verified directly against the code.

### 8.1 Live security holes

1. **Self-awarded trust badge.** `app/api/listings/[id]/route.ts:115` applies `verified` from the request body with **no admin/ops check**. The permission block at lines 75–90 only restricts `status`; `verified` and `visited` fall straight through for any **owner**. A landlord can `PATCH {"verified": true}` on their own listing and receive the trust badge, `verifiedOnly` filter inclusion and the ranking boost — stamped `verifiedBy: user.id`, self-attested.
2. **Free permanent renter Premium.** `app/(login)/actions.ts:213` sets `subscriptionTier: plan === 'premium' ? 'premium' : 'free'` where `plan` is an unvalidated `z.string().optional()`. `/sign-up?plan=premium` grants Premium with no payment and no `subscriptionExpiresAt`, so `isUserPremium` returns true forever. The pricing CTA links straight at it.
3. **Platform-wide stats leak.** `app/(dashboard)/dashboard/page.tsx:22` renders `getOpsDashboardStats()` — every signed-in landlord sees total marketplace supply, i.e. exactly how small the platform is.

### 8.2 Monetization correctness

4. **The `pro` tier is locked out of the analytics it is sold.** `app/(dashboard)/dashboard/analytics/page.tsx:20` gates on `tier !== 'premium' && tier !== 'agency'` — but `premium` is the *legacy* alias and the live LKR 2,500 tier is `pro`. Meanwhile `components/pricing-section.tsx:61` sells Pro on "Listing performance." You would be charging LKR 2,500 for a redirect. A refund request on day one of monetization.
5. **Expired plans keep their ranking boost.** The plan-tier term in `lib/db/queries.ts:289-303` is a correlated subquery that ignores `landlords.landlordPlanExpiresAt` — so a lapsed Agency outranks a paying Pro forever. It also duplicates `PLAN_TIER_WEIGHTS` as inline SQL, and runs per-row even though the query already joins `landlords` and selects both columns.
6. **Ranking order contradicts the docs.** Code: Featured → Boost → **plan tier** → Urgent. `CLAUDE.md` and `.claude/skills/change-monetization/SKILL.md:19`: Featured → Boost → **Urgent** → plan tier. Currently a no-op (zero paid plans, zero Urgent badges in production), which makes now the free moment to resolve it — **deliberately, in one direction, with docs and code made to agree.**
7. **The starter bundle overwrites the plan expiry** instead of extending it. A landlord with 25 days remaining who buys the bundle **loses 25 days**. It also bypasses `getIncludedBoostsRemaining()` entirely, so month one silently yields two Boosts for the price of one.
8. **TOCTOU race in boost allowance.** `boost/route.ts:56-73` reads `getIncludedBoostsRemaining()`, then does a read-modify-write. Two concurrent activations both read `remaining = 1` and both consume it. Fix with a single conditional `UPDATE … WHERE boosts_used_this_month < allowance RETURNING`.

### 8.3 Missing, dead, or untrue

9. **Renewal does not exist for free landlords** — only `bulk-renew`, hard-gated to `agency`. But `checkAndMarkExpiredListings()` in `lib/db/check-expired-listings.ts` is **already fully written** (including the social pull-down) and its own comment says nothing calls it. `sendListingExpiringReminder` (`lib/email.ts:230`) is also written and never called. **This is wiring, not authoring.** No expiry cron exists among the six in `vercel.json`, and the `listing_expired` audit action has never been emitted.
   ⚠️ The reminder must **not** email WhatsApp landlords — their synthetic `@wa.easyrent.lk` address goes nowhere and would pollute your Resend bounce rate.
10. **Landlords cannot mark a property rented.** `rented` appears only in the ops-only approval form; the PATCH route permits non-ops status changes only for `rejected→pending` and `→archived`; there is no `RENTED` WhatsApp command. So rented properties stay live until they expire — wasting tenant calls, undermining the trust positioning, and making fill rate unmeasurable. The landlord's moment of success is never captured, so there is no testimonial trigger and no evidence base for ever selling a Boost.
11. **`listings.featured` is write-only** — written by two routes, read by nothing, never reset on expiry.
12. **No indexes** on `boostedUntil` / `featuredUntil` / `urgentUntil`, which the default ranking sorts on. Note: `WHERE boosted_until > NOW()` is invalid in an index predicate (`NOW()` is not `IMMUTABLE`) — use `IS NOT NULL`.
13. **Overclaiming copy:**
    - `components/how-it-works.tsx:24` — "Sign in to see verified contact numbers." They are fully public.
    - `components/site-footer.tsx:81` — "Every listing is verified and every contact number checked before it goes live." Untrue while `autoPublishWhatsAppIntakes` is on and `enableListingModeration` is off.
    - `components/founding-landlord-cta.tsx` — "Many properties we visit in person." No property visits happen.
    - `components/site-footer.tsx:89` — advertises "Refer a friend — both get LKR 500 off" with **no referral system in code**. Currently hidden behind `pricingEnabled`, so **delete it now** while nobody has seen it.

    These are a trust risk **and** a direct threat to the future paid Verified product.

### 8.4 Migration hazards

14. **`0044_social_manual_takedown.sql` is untracked in git.** Commit it and confirm it has been applied to production before adding anything numbered higher.
15. **Migration `0023` contains two unguarded `UPDATE`s** that replay on every `db:migrate-all` run. They are derivations rather than destruction, so they are currently safe — but do not model new migrations on that file.
16. **`splitStatements()` in `run-all-migrations.ts`** sets `inDollarBlock` on `/DO\s+\$\$/` and only clears it on a line matching `^\s*\$\$;?\s*$`. The established convention `END $$;` does **not** match, so a DO block swallows everything to EOF. Existing files survive only because their DO block is last. **One DO block per file, and it must be last.**

---

## 9. Implementation

### 9.1 Security fixes — ship first, alone, no migration (~1 day)

| # | Fix | File |
|---|---|---|
| 1 | Return 403 if a non-ops caller sends `verified` / `visited` / `verifiedAt` / `visitedAt`, then wrap the apply blocks in `isAdminOrOps` | `app/api/listings/[id]/route.ts:115-140` |
| 2 | Delete the tier assignment; new users are always `subscriptionTier: 'free'` | `app/(login)/actions.ts:213,229` |
| 3 | Branch on role — keep `getOpsDashboardStats()` for ops/admin, add `getLandlordDashboardStats(userId)` for everyone else | `app/(dashboard)/dashboard/page.tsx:22` |

Fix 2 matters concretely: `isUserPremium` gates exclusive-listing creation, exclusive-listing visibility, unlimited saved searches and 24h early access. Also repoint `components/pricing-section.tsx:36` away from `/sign-up?plan=premium`.

**Two backfill audits before deploying:**

```sql
-- Anyone who self-awarded a Verified badge
SELECT id, verified_by, verified_at FROM listings
 WHERE verified = true
   AND (verified_by IS NULL
        OR verified_by NOT IN (SELECT id FROM users WHERE role IN ('ops','admin')));

-- Anyone holding free permanent Premium
SELECT id, email, created_at FROM users
 WHERE subscription_tier = 'premium' AND subscription_expires_at IS NULL;
```

Extend `e2e/security.spec.ts` with both cases.

### 9.2 Analytics — day 1, the only real blocker (~1 day)

**Start with an internal metrics page, no vendor.** `app/(dashboard)/back-office/metrics/page.tsx`, `requireBackOfficeAccess()`, `force-dynamic`, reading a new `getPlatformMetrics()` in `lib/db/queries.ts`. ~4 hours, exact numbers, no privacy surface, no ad-blocker problem:

- **Active listings per city** — this is Gate A
- New listings/week, web vs WhatsApp intake
- Views per active listing/week, median and p90 — the Boost evidence
- Expiring in 7 days; % expired without renewal
- Intake funnel: received → needs_info → published → abandoned
- Social: consent granted / declined / posted

Then optionally **PostHog Cloud free tier** (1M events/month, `posthog-node` for server-side capture, survives ad blockers — chosen over Vercel Web Analytics, which needs Pro for custom events, and Plausible, which has no real funnel analysis).

Wrap it in `lib/analytics.ts` following the existing `lib/email.ts` dry-run convention: no-ops with `[analytics:dry-run]` when unset, never throws, gated behind a new `enableProductAnalytics` flag defaulting to `false`. `distinctId` is `user:<id>` or a session UUID — **never the email**.

**Highest-value events:**

| Event | Why |
|---|---|
| **`contact_revealed`** | A click on the phone or WhatsApp link. **The single most important event** — the closest thing to a lead, and the number that makes "a Boost is worth LKR 250" provable. Contact links are plain `<a href="tel:…">` on a server component; the wrapper must fire-and-forget then navigate, never `preventDefault` and wait, or taps break on mobile. |
| **`zero_result_search`** | Tells you exactly which city to go get supply in — feeds the `create-area-landing-page` skill directly |
| `listing_created` / `listing_published` | Source attribution (web / quick-list / WhatsApp) |
| `listing_expired` / `listing_renewed` | Is churn eating the inventory? |
| `visibility_activated` | Actual revenue, and how much of it is comped |
| `social_consent_granted` / `_declined` | Is the free social offer actually wanted? |

### 9.3 Founding Landlord — redesign before promising anything

⚠️ **Currently live and unbounded.** `components/founding-landlord-cta.tsx` is on the homepage right now saying *"Founding landlords list unlimited properties free — no fees, no commissions, ever"* — **no cap, no counter, no per-landlord record.** Every day it stays up adds unrecorded liability.

**The "first 500 landlords" design has a hole.** The people who respond first to a new free platform are those for whom listing is a job, not an event. At 5% brokers = 25 accounts × LKR 5,000/mo × 12 = **LKR 1,500,000/year foregone in perpetuity** — and those are exactly the customers the revenue model depends on. The earliest heavy users *are* the heaviest users.

**Better designs, in preference order:**

1. **Don't promise it.** Nothing is being taken away — listings are free for everyone anyway. Nobody signs up *because* you promised a currently-free thing stays free.
2. **Per-listing and bounded:** *"your first 3 listings are free forever."* A 200-property agency gets 3 free and pays for 197; the one-house individual is unaffected forever. Keeps ~100% of the emotional promise and ~0% of the leakage.
3. **Never grandfather ranking.** Free *listing* is survivable; free *placement* is not, because placement is the only thing you sell. State it explicitly: the promise covers inclusion, never position.

Also: do not announce "500 spots" with 26 landlords. You built `showFoundingStageCopy` precisely because you know not to claim scale you lack.

**If the 500-landlord version is kept**, the durable implementation is two columns on `landlords` — `foundingNumber` (integer) and `foundingLandlordAt` (timestamp) — assigned by a **BEFORE INSERT trigger on a sequence**, not application code. There are four landlord-insert sites (`dashboard/listings/new/page.tsx:51`, `lib/intake/landlord-identity.ts:198`, `lib/intake/ops-identity.ts:44`, seeds); patching four call sites guarantees one gets missed. `nextval()` is atomic, so the 500th-signup race resolves correctly, whereas `SELECT count(*)` in app code would not. The trigger must skip `users.role IN ('ops','admin')` so the Operations account does not burn slot #1. Enforcement always reads `foundingLandlordAt IS NOT NULL`, never `foundingNumber <= 500`, so changing the cap can never retroactively revoke anyone.

⚠️ The migration's `setval` must be `GREATEST(last_value, …)`. The naive `setval(seq, MAX(founding_number))` **rewinds the sequence on replay**, and the next signup then hits the unique index and fails to create a landlord row — breaking listing creation entirely.

### 9.4 Social auto-publish — reword the promise, then switch on

**"Free forever" as literally worded cannot be kept:**

- **Instagram** enforces a documented `content_publishing_limit` of ~50 posts/24h. At 3,000 listings/month that is 100/day — **2× over the ceiling.** The worker correctly refuses, so a landlord promised free social sharing silently gets nothing.
- **TikTok** unaudited apps post `SELF_ONLY` (private) — **zero distribution today.**
- **Facebook Groups**, where Sri Lankan rental demand actually lives, cannot be automated at all (Meta removed the Groups API on 2024-04-22). At 3,000 listings/month that is ~50 hours/month of copy-paste.
- **Account risk:** your own accounts posting 100 third-party property ads/day is textbook inauthentic behaviour. Losing the Page loses the distribution you promised forever to 500 people.

**Promise the selection, never the channel:**

> *"We feature selected listings on Easy Rent's social channels at no charge. Selection is ours."*

Truthful, already what the code does at quota, removes the liability entirely, preserves 100% of the marketing value, and creates a free scarcity good — *"we picked yours"* — which is the exact emotion you later sell as Featured. **Drop TikTok from any public promise until the app is audited.**

Flip `enableSocialAutoPublish` in Back Office → Settings (the DB override, not the source default — one-click rollback).

✅ **Good news:** `reconcileMissedSocialPrompts` (`lib/social/consent.ts:178`) is bounded to `limit = 5, withinHours = 24`, so **flipping it on will not blast consent prompts at the ~26 historical listings.** Safe by construction.

Add `tests/unit/social-free-forever.test.ts` asserting that `lib/social/consent.ts` and `lib/social/publish.ts` import neither `getLandlordPlanTier` nor `lib/pricing.ts` — the only durable way to stop a future "gate social behind Pro" landing quietly.

### 9.5 Free basics worth shipping regardless

- **"Mark as Rented"** — owner-permitted `active → rented`, a button on the landlord listing page, a `RENTED` WhatsApp command beside the existing `LINK` / `DELETE` / `HELP`, and a "Did it rent?" prompt near expiry. Highest-value data point the business is not collecting (defect 10).
- **Free renewal for all tiers** + wire up the dead `sendListingExpiringReminder` + an expiry cron + emit `listing_expired`. Mostly wiring, not authoring (defect 9).
- **View counts free for every landlord.** Currently premium/agency-gated. View data is the *evidence* that makes a Boost worth buying later — hiding it from free landlords removes the reason to ever upgrade. Keep comparative benchmarks paid; make raw counts free. `getListingPerformanceData` already computes a percentile ranking that is currently invisible to 100% of landlords.
  ⚠️ Label it **"page views," not "unique visitors"** — view tracking is IP-rate-limited with no per-listing dedup, so a landlord refreshing their own page inflates the number. Do not ship an inflated metric to the person you will later ask to pay based on it.
- **Fix the overclaiming copy** (defect 13).

### 9.6 Deferred until Gate B (10 paid activations)

Design now, build later:

- **`lib/pricing.ts` single source of truth.** Prices are display strings in ~8 component files, and durations are declared **twice** (`BOOST_DURATION_DAYS` in both `boost/route.ts:9` and `bundle/route.ts:8`), so a price and its duration can already drift. Must stay a pure catalog: **no `canPurchase()`**, or the manual-activation invariant dies quietly.
- **An `orders` table.** Today an activation records no amount at all. Design it so a manual bank transfer today and a PayHere notify later write the same row, with a `needsReconciliation` flag making missing data a visible worklist rather than a silent absence — the same reasoning as `needs_manual_takedown` in migration 0044.
- **Boost Credits.** **No ledger table needed** — a balance column plus `orders` rows for both grants and consumptions reconstructs the balance without building a generic wallet.
- **Self-serve PayHere checkout** — not until manual activation is the bottleneck (~20 activations/week).

### 9.7 Migration discipline (applies to everything in 9.6)

Every numbered SQL file **replays on every `pnpm db:migrate-all` run** — there is no applied-migrations ledger. Each must be forever-safe against a populated production database: no `DROP COLUMN`, no `TRUNCATE`, no unguarded `UPDATE`/`DELETE`; guard conversions behind `information_schema` checks inside a `DO $$ … $$;` block. Every new file must be **registered in the `MIGRATIONS` array** in `lib/db/run-all-migrations.ts` or it never runs.

**Run `pnpm db:migrate-all` against production BEFORE the deploy lands.** Drizzle names every column explicitly, so a column in `schema.ts` that is missing from the database takes down *every read of that table*, feature flag or not. This is the 2026-08-22 outage.

---

## 10. Verification

### Security (§9.1)
- As a landlord, `PATCH /api/listings/<own-id>` with `{"verified":true,"visited":true}` → 403; confirm in the **database** that `verified` is unchanged, not just the response.
- As ops, the same PATCH still works and stamps `verifiedBy`.
- `/sign-up?plan=premium` → the new `users` row has `subscription_tier = 'free'`.
- Two different landlord accounts see **different** dashboard numbers.
- Run the `e2e/` Playwright specs and `pnpm build` before deploying.

### Analytics (§9.2)
- Load a listing page, click the phone button and the WhatsApp button → both `contact_revealed` events appear with the listing id attached.
- Create a listing via the web form and via WhatsApp → both appear with distinct `source` values.
- The back-office metrics page shows active listings **per city** — Gate A.

### Social (§9.4)
- **No credentials:** publish a listing → rows carry `dryrun-*` post ids, the back office shows a **dry run** badge and **no takedown button**.
- **With credentials on a test Page:** consent via WhatsApp `YES` → post appears with a Graph-sourced permalink; caption contains **no phone number**; images render at 1080×1350.
- Delete the listing → `pullDownForListing` runs; Instagram/TikTok rows set `needsManualTakedown` and the UI says so rather than claiming deletion.
- Reply something unrecognised to a pending `confirm_social` prompt → it falls through to `detectCommand`, so `DELETE` is not swallowed for 24h.

### Free basics (§9.5)
- Set a listing's `expiresAt` to 3 days out locally, run the expiry cron by hand → the reminder is sent (or logged to console without `RESEND_API_KEY`), and `listing_expired` is emitted at the right time.
- Renew as a **free** landlord → `expiresAt` extends and the listing reappears in `getActiveListings`.
- Mark a listing rented from the landlord dashboard **and** via the WhatsApp `RENTED` command.

### Migrations (whenever §9.6 is built)
- Run `pnpm db:migrate-all` **twice** against a populated local database → no error, no data change. This replay check matters more than the first run.
- Apply against production **before** the deploy lands.

### End-to-end
Run locally against this repo's own Supabase stack (**not** the unrelated stack on ports 54321-24), seed with `pnpm db:seed-local`, and walk the landlord journey: WhatsApp intake → listing live → social consent → view counts → expiry reminder → free renewal → mark rented.

---

## 11. How this fails

**1. The 45-day test never runs, and building resumes.**
Eight finished systems are already switched off; a ninth workstream is the path of least resistance. The test's entire value is that **it cannot be converted into more building.** This is the modal outcome, not the tail risk.

**2. Willingness to pay is never tested, so every number stays fictional.**
Four revenue lines built on an untested assumption that anyone in Sri Lanka will pay Easy Rent anything — when the test costs 26 phone calls and zero code.

**3. Costs outrun revenue as it scales.**
WhatsApp templates alone plausibly reach LKR 90,000/month at 1,500 listings and LKR 180,000/month at 3,000 — against a LKR 48,000 base and a LKR 181,500 six-month target. Add storage growth, PayHere floor fees on LKR 150 products, and a social promise that becomes physically impossible at Instagram's ceiling.

### The single change that most improves the odds

Install analytics on day 1, then flip `enablePricingSection` and phone 56 landlords with one sentence. Every piece already exists and is turned off: the boost endpoint, the admin-only manual activation flow, the pricing flag, the payment mechanism documented in `CLAUDE.md`. **It requires zero engineering, which is precisely why it is the right test.**

---

## 12. Explicitly not doing

- No token currency, no wallet, no ledger, and **no free token grant**.
- No change to `LISTING_LIMITS` — listings stay free and unlimited on every tier.
- No PayHere integration until 10 manual paid activations have happened.
- No orders table, credits, or checkout until the same gate.
- No paid property visits at LKR 1,500–2,500 (loses money on every visit).
- No referral integration code of any kind.
- Australia removed from planning documents.

---

## 13. Corrections made during this review

Recorded because several were mine, made earlier in the same analysis:

| Claim | Correction |
|---|---|
| "LankaQR is fee-free under LKR 5,000, so prepayment amortises nothing" | Too strong. Holds for QR and bank rails, **not** for the card payments PayHere mostly handles, where a fixed per-transaction floor can push a LKR 150 product past 10% effective. Prepayment has a better case than first stated. |
| "4 agencies × LKR 5,000 covers the ~LKR 18k infra cost" | Wrong arithmetic — it deleted the LKR 30,000 salary from the stated LKR 48,000 base. Real break-even is **~10 accounts**, not 4. |
| Third-party referrals listed as the first revenue line | Backwards. At current scale they earn ~LKR 810/month, and they are the most seductive way to avoid asking a landlord for LKR 250. Demoted, and capped at zero code. |
| "The WhatsApp cost cliff is in-window service messages on 1 Oct 2026" | True but not the big number. **Outbound marketing templates are** — plausibly LKR 90,000/month at 1,500 listings, roughly double the entire cost base. |
| "Hold until 300 active listings" | ~31 months away at current rates, and requires 17× the current creation rate to sustain. Replaced with per-city density (Gate A) and 10 paid activations (Gate B). |
| Founding Landlord = first 500 landlords, free forever | The first 500 skew toward brokers; ~25 of them at LKR 5,000/mo is ~LKR 1.5M/year given away permanently to exactly the customers the model depends on. Prefer per-listing and bounded. |
| Social sharing "free forever" | Cannot be literally kept — Instagram caps at ~50 posts/24h and TikTok posts privately while unaudited. Promise the **selection**, not the channel. |

---

## 14. Sources

**Sri Lankan market**
- [ikman — listing fee reductions and free-listing thresholds](https://blog.ikman.lk/en/ikman-provides-attractive-incentives-for-sellers-with-a-reduction-in-listing-fees-across-multiple-categories/)
- [ikman — sell or rent your property](https://ikman.lk/en/sell-property)
- [LankaPropertyWeb — membership benefits](https://www.lankapropertyweb.com/membership-benefits/)
- [LankaPropertyWeb — rentals inventory](https://www.lankapropertyweb.com/rentals/index.php)

**Payments**
- [Best payment gateways in Sri Lanka, 2026 comparison](https://br.lk/blog/payment-gateway-sri-lanka/)
- [PayHere vs international gateways](https://br.lk/blog/payhere-vs-international-payment-gateways/)
- [Digital payments & fintech in Sri Lanka — LankaQR, wallets, fees](https://hashtagcoders.lk/blogs/fintech-digital-payments-sri-lanka-2026)

**WhatsApp / Meta costs**
- [WhatsApp service message pricing changes, 2026](https://www.wati.io/en/blog/whatsapp-service-message-pricing/)
- [WhatsApp service messages and the 24-hour window](https://www.ycloud.com/blog/whatsapp-service-messages-24-hour-window-pricing)
- [WhatsApp Business API pricing 2026](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)

**Comparable monetization models**
- [SpareRoom — Early Bird explained](https://www.spareroom.co.uk/content/info-advice/early-bird-explained/)
- [Bayut — what credits are and how to manage them](https://help.bayut.sa/hc/en-us/articles/18342196693138-What-are-credits-on-Bayut-and-how-to-manage-them)
- [Prepaid credit pricing guide](https://www.chargebee.com/pricing-labs/prepaid-credit-pricing-guide/)
- [Challenges of credits-based pricing for B2B SaaS](https://www.forbes.com/councils/forbestechcouncil/2025/05/29/3-key-challenges-of-credits-based-pricing-for-b2b-saas-part-1/)

**Marketplace strategy**
- [Supply or demand? Cracking the chicken-and-egg challenge](https://www.cobbleweb.co.uk/supply-or-demand-cracking-the-chicken-and-egg-challenge-in-marketplace-startups/)
- [The chicken-and-egg problem in marketplaces](https://www.sharetribe.com/marketplace-glossary/chicken-and-egg-problem/)
- [Grandfathering in B2B SaaS](https://parseur.com/blog/grandfathering-b2b-saas)
- [Freemium conversion rate benchmarks 2026](https://www.artisangrowthstrategies.com/blog/freemium-conversion-rate-benchmarks)

**Australia**
- [ACCC probes REA Group on pricing](https://www.abc.net.au/news/2025-06-10/accc-probes-property-giant-rea-group-on-price-gouging-consumers/105381838)
- [Domain vs REA price war](https://www.apreview.com.au/costar-backed-domain-is-capping-price-rises-to-challenge-rea-group-heres-what-it-means-for-agents-vendors-and-the-property-market/)

**Ancillary revenue**
- [How property portals generate revenue](https://turnkeyinfotech.com/how-property-portals-generate-revenue/)
- [Ancillary revenue in real estate](https://moved.com/2026/03/26/ancillary-revenue-in-real-estate/)
