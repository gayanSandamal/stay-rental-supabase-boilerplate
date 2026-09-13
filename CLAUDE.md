# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

**Easy Rent** — a verified, **mid-to-long-term (1–12+ month) house rental marketplace for Sri Lanka**. It is *not* a short-stay/vacation product. The whole platform is built around three things that matter to the Sri Lankan rental market: **trust/verification**, **rental-specific search** (power backup, water source, fiber, deposits in months, notice periods), and **direct landlord contact via phone/WhatsApp** (no in-app messaging, no booking engine).

Three surfaces in one app:
- **Public marketplace** (anyone): browse/filter listings, view details, contact landlords directly.
- **Landlord dashboard** (`/dashboard/**`): self-service listing management.
- **Internal back-office** (`/back-office/**`): ops/admin tools — business accounts, team members, platform-wide listings, settings.

## Business model — read this, it drives the code

The monetization model is **"Free listing + paid visibility"** (see `Monetization Plan & Strategy - Reimagined Free Listing Paid Visibility.md`). Internalize these rules because they explain a lot of otherwise-surprising code:

- **Listings are free and unlimited on every plan.** `LISTING_LIMITS` in `lib/landlord-plans.ts` is `999999` for all tiers by design — do not "fix" this. Revenue comes from *visibility*, never from capping supply.
- **Revenue = visibility products**, prioritized: Boost (LKR 250/7d) > Featured (LKR 500/7d) > landlord plans (Starter/Pro/Agency) > Urgent badge (LKR 150/7d) > bundles. Renter premium exists but is deprioritized.
- **Payments are MANUAL.** Stripe is a dependency and the setup script supports webhooks, but **it is not wired to live payments.** Landlords pay offline (bank transfer/slip); **admin/ops then activate** Boost/Featured/Urgent/plans through the back-office. Every visibility API route (`/api/listings/[id]/boost|feature|urgent|bundle`) is **admin/ops-only** — a landlord cannot self-activate. When touching monetization, preserve this manual-activation flow unless explicitly asked to build real billing.
- **Landlord plan tiers**: `free`, `starter`, `pro`, `agency` (plus legacy `basic`→starter, `premium`→pro). Paid plans grant *included Boosts/month* (`INCLUDED_BOOSTS_PER_MONTH`) and a search-ranking weight (`PLAN_TIER_WEIGHTS`), not listing caps.

**Public positioning is "totally, 100% free of charge", never "affordable" (2026-09-03).**
`lib/free-copy.ts` owns the phrasing and `isPlatformFullyFree()` — the negation of
`enablePricingSection`, which is OFF by default and has no override row in
production. Affordability invites a price comparison with ikman; free of charge
ends it. Do not reintroduce "affordable", "budget friendly" or "best value" on a
public surface.

The claim is gated, not hardcoded, and that gate is the whole point: turning
`enablePricingSection` on puts an LKR 500 Featured card on the homepage, and
"100% free of charge" must not be rendering above it. Every marketing surface
therefore reads the flag and falls back to the `*_PAID` copy, which still leads
with free listings (they stay free and unlimited on every tier —
`LISTING_LIMITS` is 999999) but never speaks for the whole platform. The
homepage renders `FreePromiseSection` **or** `PricingSection`, never both.
Client components (the hero, `how-it-works`) cannot read the flag, so either
take `fullyFree` as a prop or keep their claim scoped to things that are free on
every tier.

**Search ranking** (the core marketplace mechanic) lives in `getActiveListings` in `lib/db/queries.ts`. Default order: **Featured → Boost → Urgent → plan tier → verified → completeness → newest**. This is intentional and is how paid visibility actually works — changing the `orderBy` here changes the product.

## Roles & access

Global `user_role` enum: `tenant | landlord | ops | admin`.
- `tenant` → default; browses, contacts landlords. Redirected to `/listings`.
- `landlord` → manages own listings via `/dashboard`. **A tenant is auto-upgraded to `landlord` on creating their first listing** (`/api/listings` POST). Redirected to `/dashboard`.
- `ops` → internal team; landlord dashboard + `/back-office` + listing approval/visibility activation.
- `admin` → everything ops has + exports + full management.

Separate, business-account-scoped role string on `business_account_members`: `owner | admin | member`. This is *in addition to* the global role.

Access control patterns:
- Server pages/back-office: `requireBackOfficeAccess()` (`lib/auth/back-office.ts`) — redirects non-ops/admin.
- API routes: fetch `getUser()`, then check `user.role` and return `NextResponse.json({ error }, { status: 401|403 })`.
- `middleware.ts` only gates `/dashboard` (redirects unauthenticated to `/sign-in`); finer authz is per-route.

## Tech stack

Next.js 15 (App Router, canary) · React 19 · TypeScript · Drizzle ORM · **Supabase** (Postgres + Auth + Storage) · Resend (email) · Tailwind 4 + Radix/shadcn-style UI + lucide · Zod · SWR · deployed on **Vercel** (+ Vercel Cron). Package manager is **pnpm**. Dev uses Turbopack.

## Architecture & conventions

- **Server-first.** Data loads in Server Components via `getUser()` + Drizzle queries in `lib/db/queries.ts`. SWR is for client-side refresh; `/api/user` is preloaded as an SWR fallback in the root layout.
- **Auth = Supabase Auth**, not the legacy password system. `getUser()` (`lib/db/queries.ts`) is the bridge: it reads the Supabase auth user, then loads the matching `public.users` row by `auth_user_id` (and filters `deletedAt IS NULL`). It returns `null` if either is missing. `bcryptjs`/`lib/auth/session.ts` are **legacy** — only for old `password_hash` users and the set-password script. A DB trigger (migration `0020`) auto-creates the `public.users` row on signup.
- **Server Actions** use the helpers in `lib/auth/middleware.ts`: `validatedAction(schema, fn)` and `validatedActionWithUser(schema, fn)` — they Zod-parse `FormData` and (for the latter) inject the authenticated `User`. Use these rather than hand-rolling validation.
- **Forms** are config-driven via the form builder in `lib/forms/**` (see `lib/forms/README.md` and `FORM_BUILDER_GUIDE.md`). Listing/filter/business-account forms are defined as configs, not bespoke JSX.
- **Soft deletes**: users carry `deletedAt`; account deletion mutates the email and sets `deletedAt` rather than hard-deleting. Use `scripts/hard-delete-user.ts` only for real removal.
- **Listings expire** 30 days after publish (`expiresAt`, `listingExpirationDays` flag). Expiration reminders + status transitions are handled by jobs/queries, not the UI.
- **Audit logging**: `lib/db/audit-logger.ts` + `audit_logs` table. Visibility activations, approvals, exports, etc. are logged via `logListingAction(...)`. Add an audit entry when you add a consequential admin action (and a matching value to the `audit_action` enum).
- **Feature flags**: defaults + metadata live in `lib/feature-flags.ts`; `isFeatureEnabled`/`getFeatureValue` stay synchronous and read a per-instance resolved snapshot. At runtime, rows in the `feature_flags` table override the defaults — admins toggle them in **Back Office → Settings**. `lib/feature-flags-store.ts` loads overrides (TTL-cached, per-instance like rate-limit) into the snapshot; the root layout and flag-checking API routes call `loadFeatureFlags()`, and `setFeatureFlag()` persists + audit-logs (`feature_flag_updated`). Client components read public flags via `useFeatureFlag` (`/api/feature-flags`). Pages that gate on a flag use `export const revalidate = 30` — **not** `force-dynamic`. The two give identical freshness, because the flag snapshot is per-instance and already `CACHE_TTL_MS = 30_000` stale by design; `force-dynamic` never bought an instant toggle. What it did buy was opting the page out of PPR, which made its prerendered shell 0 bytes — so a click had nothing to paint and blocked on the whole server render. Measured 2026-09-02: 23 of 39 shells empty. Do not put `force-dynamic` back for flag freshness. Gate new/experimental features behind a flag.
- **Rate limiting**: `lib/rate-limit.ts` — in-memory (per-instance, resets on deploy). Applied to listing creation, contact numbers, uploads, view tracking.
- **Storage**: Supabase `property-images` bucket (5 MB, JPEG/PNG/WebP/GIF) via `lib/storage.ts` / `/api/upload`. Photos are stored on `listings.photos` as a JSON array string.
- **Notifications**: in-app center (`notifications` table, `lib/notifications.ts`) + transactional email via Resend (`lib/email.ts`). Without `RESEND_API_KEY`, emails log to console.
- **Cron** (Vercel, secured by `CRON_SECRET` bearer token): `/api/cron/refresh-suggestions` (~15 min), `/api/cron/saved-search-alerts` (~6 h).

## Database & migrations — IMPORTANT GOTCHA

There are **two migration systems** and they are not interchangeable:

1. **drizzle-kit** (`pnpm db:generate` / `db:migrate`) — generates from `lib/db/schema.ts`.
2. **A hand-maintained raw-SQL runner** — `lib/db/migrations/00NN_*.sql` applied by `lib/db/run-all-migrations.ts` via `pnpm db:migrate-all`. This is what is actually used against Supabase.

**The numbered SQL files in `lib/db/migrations/` are the source of truth for the deployed schema.** When you change `schema.ts`, you generally also need to add a new numbered `00NN_*.sql` file **and register it in the `MIGRATIONS` array** in `run-all-migrations.ts` (the runner is idempotent — it skips "already exists" errors). Don't assume `db:generate` alone updates production.

> ⚠️ **`db:migrate-all` REPLAYS EVERY numbered file on every invocation** — there is no
> applied-migrations ledger. So a migration must be safe to re-run against a
> populated production database *forever*, not just correct once. Never write a
> statement that destroys data: no `DROP COLUMN` on a column that holds data, no
> `TRUNCATE`, no unguarded `UPDATE`/`DELETE`. Guard any conversion behind an
> `information_schema` check inside a `DO $$ … $$;` block (see the fixed
> `0001_stay_rental_transformation.sql`).
>
> This is not hypothetical: `0001` used to `DROP COLUMN IF EXISTS "role"` and
> re-add it with `DEFAULT 'tenant'`, so **every migration run silently reset
> every user's role**. On 2026-08-05 it locked the admin out of the back office
> and demoted a WhatsApp landlord. Roles carry no other source of truth, so the
> data was unrecoverable except by inference from `landlords` rows.

> ⚠️ **`splitStatements()` mis-parses `END $$;` — prefer migrations with NO `DO` block.**
> It sets `inDollarBlock` on a line matching `DO $$` or `AS $$`, and clears it
> **only** on a line that is nothing but `$$` or `$$;`. `END $$;` and
> `$$ LANGUAGE plpgsql;` do not match, so the rest of the file is emitted as one
> statement. Measured 2026-08-27: this already affects 13 files — `0007`, `0020`,
> `0031` and `0036` each collapse into a **single** statement.
>
> First runs still work, because `postgres.js` `.unsafe()` executes
> multi-statement strings. **Replay is where it bites:** the blob is one implicit
> transaction, the first `already exists` aborts the remainder, and the catch
> logs `⏭ Skipped` — so a new statement added below a `DO` block in one of those
> files never applies and the runner still reports success.
>
> Until it is fixed: plain `IF NOT EXISTS` DDL splits correctly and is always
> preferred. If a `DO` block is genuinely needed, close it with a bare `$$;` on
> its own line. Never trust "Done" for a file with a `DO` block — run
> `pnpm db:check-drift`.

- Connection: `lib/db/drizzle.ts` reads `DATABASE_URL`. **Production must use the Supabase transaction pooler (port 6543)**, not the direct connection (5432).
- Schema lives entirely in `lib/db/schema.ts`. Core tables: `users`, `landlords`, `listings`, `listing_views`, `saved_searches`, `business_accounts`, `business_account_members`, `user_contact_numbers`, `listing_contact_numbers`, `notifications`, `password_reset_tokens`, `audit_logs`.
- Enums: `listing_status` = `pending | active | rented | archived | rejected | expired`; `user_role`, `business_account_status`, `audit_action`.

## Commands

```bash
pnpm dev                 # dev server (Turbopack)
pnpm build               # production build
pnpm db:migrate-all      # apply numbered SQL migrations to Supabase  ← the real one
pnpm db:migrate-all:local
pnpm db:seed             # seed base data
pnpm db:seed-local       # local Docker: full reset + seed + ~1400 sample records
pnpm db:studio           # Drizzle Studio
pnpm db:set-admin        # promote a user to admin (scripts/set-admin.ts)
pnpm storage:setup       # create the property-images bucket
```

Test accounts (local seed): `admin@easyrent.com/admin123`, `ops@easyrent.com/ops123`, `landlord@test.com/landlord123`, `tenant@test.com/tenant123`.

## Key env vars

`DATABASE_URL` (pooler :6543 in prod) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…PUBLISHABLE_KEY`) · `SUPABASE_SERVICE_ROLE_KEY` (admin/storage) · `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` · `NEXT_PUBLIC_BASE_URL` · `CRON_SECRET` · `WHATSAPP_CONSENT_TEMPLATE` (asks an advert's owner whether we may list it; **unset = nothing can ever publish**, since the importer is opt-in) · `WHATSAPP_IMPORT_TEMPLATE` (the go-live notice sent after they say yes; unset = dry-run) · `VIEW_HASH_SALT` (view-dedup salt; must be stable across instances — a per-instance value multiplies every unique-viewer count). Never put secrets in `NEXT_PUBLIC_*`.

## Where to look

- Routes/page map, role-by-page, manual QA scenarios → `APP_OVERVIEW.md`
- End-user behavior (tenant/landlord/ops) → `USER_MANUAL.md`
- Monetization rules & pricing → `Monetization Plan & Strategy - Reimagined Free Listing Paid Visibility.md`
- Tech/infra detail & env → `Tech Stack.md`
- Auth/Supabase setup → `docs/AUTH_CONFIGURATION.md`, `docs/SUPABASE_DATABASE.md`
- Form builder → `FORM_BUILDER_GUIDE.md`, `lib/forms/README.md`
- Facebook post import → `docs/deep-dive-facebook-post-import.md`

## WhatsApp intake v2 (2026-08-04)

The intake pipeline now creates **real landlord accounts** and runs **automated
approval**. All of it is flag-gated and OFF by default — see
`docs/deep-dive-whatsapp-intake-pipeline.md` and the rollout section of
`docs/whatsapp-golive-runbook.md`.

- **Identity**: `users.wa_phone` is the verified WhatsApp identity. `users.phone`
  is user-typed and unverified — **never match on it**. Auth records for these
  landlords carry a synthetic `@wa.easyrent.lk` email; never render it (use
  `publisherDisplayName()` in `lib/publisher-name.ts`), and `signUp`/
  `updateAccount` reject that domain.
- **Access links** (`lib/auth/access-links.ts`, `app/l/[...slug]/route.ts`) are
  reusable and stored as sha256 only. A Supabase magic-link token is single-use,
  so it can never be the link we send. Never mutate on GET from a link.
- **Moderation** (`lib/moderation/**`): rules before models. Unknown towns are a
  soft note, never a hold. Title coherence is computed in code from extracted
  shapes, not asked of the model. Moderation always reads the ORIGINAL photo —
  watermarking first would flag our own logo.
- **Images** (`lib/images/**`): `listings.photos` stays an array of public URLs
  (five readers depend on it); `photos_manifest` is the source of truth.
- After changing prompts, re-run `pnpm moderation:probe` and
  `pnpm moderation:calibrate`, and bump `PROMPT_VERSION` only deliberately — it
  invalidates the whole image verdict cache.

## Intake conversation memory (2026-08-23)

A landlord answered three follow-up questions and was asked for the address four
times; the ask even GREW after they answered. See
`docs/deep-dive-whatsapp-intake-pipeline.md` for the full post-mortem. Three
rules came out of it:

- **An intake's knowledge only grows.** `lib/intake/accumulator.ts` merges each
  turn's parse onto everything already known. Extraction is allowed to wobble —
  the LLM fallback is asked only for the fields the rules missed, so it gets a
  different question every turn — but a field known at turn N must be known at
  turn N+1. `city` and `district` move as a PAIR, never independently.
- **A reply to a question is an answer.** If we asked for the address and the
  landlord replies, that IS the address, whatever `ADDRESS_RE` makes of it —
  Sri Lankan landlords give landmarks, not house numbers. Address only; a town
  still goes through the gazetteer, because a wrong town is worse than none.
- **Never ask a third time.** `NEEDS_INFO_MAX_ROUNDS = 2`, then it goes to a
  human. Any new outbound ask must respect the cap.

Two supporting invariants worth keeping:

- **Every gazetteer town needs a Sinhala AND a Tamil alias** (asserted per-town
  in `tests/unit/gazetteer.test.ts`, along with single-script/lowercase/unique).
  A town the gazetteer cannot recognise makes the address mandatory, which is
  how a landlord gets asked for something they already sent.
- **Never hold a listing on a title we generated.** `composeTitle()` writes
  "2BR Apartment in Horana"; when that disagrees with the landlord's own
  description the disagreement is between two of OUR readings. `isGeneratedTitle()`
  gates it in `lib/moderation/text-check.ts`. A landlord-written title is still
  checked — two properties in one submission is real.

## Social auto-publish (2026-08-22)

Published listings can be posted to **Easy Rent's own** Facebook Page, Instagram
and TikTok, with per-listing landlord consent asked over WhatsApp. Flag-gated
(`enableSocialAutoPublish`) and OFF by default — see
`docs/deep-dive-social-auto-publish.md`.

- **Facebook Groups cannot be automated.** Meta removed the Groups API on
  2024-04-22. Group posts are paste-ready drafts for ops, never API calls. Don't
  "fix" this.
- **Only Facebook Page supports deletion via API.** Instagram and TikTok
  takedowns are manual — the UI must say so rather than implying the post is
  gone.
- Social platforms never get a Supabase URL: Instagram is JPEG-only and TikTok
  only pulls from a **verified domain**. Everything goes through
  `/api/social/img/[listingId]/[index]`, which also normalises to Instagram's
  4:5 canvas. That path prefix is what is verified with TikTok — don't move it.
- `confirm_social` is the one conversation state that **falls through** on an
  unrecognised reply, so a pending consent prompt can't swallow DELETE for 24h.
- A listing leaving `active` must call `pullDownForListing` — a deleted listing
  must not stay live on our social accounts.
- Captions must never contain a phone number (`stripContactDigits`, asserted in
  tests).
- **TikTok's OAuth needs PKCE, hex-encoded.** No `code_challenge` = `errCode=10007`
  before any consent screen; and the challenge is SHA-256 of the verifier
  **hex-encoded**, not base64url as RFC 7636 says. Verified against the live
  endpoint 2026-09-04. Don't "fix" it to match the RFC.
- **The privacy level of a TikTok post is never chosen silently.** Ops picks it on
  `/back-office/social/post/[id]` from a live `creator_info` list, with nothing
  pre-selected — TikTok's Direct Post rules put that call with the creator. An
  unavailable choice FAILS the publish rather than being substituted: up is a
  privacy breach, down lies to the operator. The cron path (no human) still takes
  the most public level offered. That screen routes through `publishNow` → the
  same `publishOne` as the sweeper so the recording rules cannot drift.
- **TikTok is the only platform a deploy cannot finish.** Meta's credentials ARE
  env vars; TikTok's rotate, so they live in `social_accounts` and an admin has
  to click **Connect TikTok** in Back Office → Social once. Two expiries, only
  one of which is an ops concern: the access token (~24h) is refreshed by the
  adapter on every publish, the refresh grant (~365d) has no way back. Health
  reports the grant, and a lapsed one must render as broken — never `live`.
- With no credentials an adapter **dry-runs**: it logs `[social:dry-run] …` and
  returns a `dryrun-<platform>-<id>` post id. The back office must keep showing
  that as a `dry run` badge with no takedown button — a row reading `posted` for
  something never sent is the same lie as claiming an Instagram deletion we
  cannot perform.

## Landlord analytics (2026-08-31)

Migrations `0045`–`0048`. The retention roadmap this implements is in
`docs/analytics-retention-roadmap.md`. Items 5 and 7 extend the WhatsApp
landlord report in `lib/reports/**` — see the next section, which added it.

- **No per-listing insight helper exists, on purpose.** `getPortfolioInsights`
  in `lib/db/queries.ts` answers a whole portfolio in FIVE queries whatever its
  size. The old `getRentComparisonForListing` / `getListingPerformanceData` were
  called inside a nested `Promise.all` — ~70 concurrent queries for a
  ten-listing landlord, on a `max: 1` pool behind the transaction pooler, which
  wedges the request (commit `a3ac4f9`). `resolvePublishers`
  (`lib/listings/publisher-info.ts`) is the same fix for the three pages that
  each had their own copy of a per-row publisher lookup.
  `tests/unit/analytics-gates.test.ts` fails if `Promise.all` returns to any of
  them.
- **A statistic without the sample size for it is not printed.**
  `lib/analytics/comparables.ts` owns every floor (`MIN_COMPARABLES_FOR_RENT`,
  `MIN_COMPARABLES_FOR_PERCENTILE`, `MIN_MARKET_MOVE_PCT`) and returns `null`
  below them; the page says *why* rather than hiding the row. The percentile
  floor is higher than the rent floor because a percentile over three samples
  can only return 0, 33, 67 or 100.
- **Views and people are reported side by side, never swapped.**
  `listing_views.visitor_hash` is `sha256(ip + ua + VIEW_HASH_SALT + yyyy-mm-dd)`
  — the date component rotates it daily, so it is a per-day bucket, never a
  cross-day identity. Rows from before `0046` have no hash: a window containing
  any of them reports `uniqueViewersLast7d: null`, because counting only the
  hashed rows would render a historical week as a traffic collapse.
- **A tracked tap can never break a tap.** `ContactLink`
  (`components/contact-click-tracker.tsx`) is a plain `<a>` with a `sendBeacon`
  in `onClick` — no `preventDefault`, no awaited fetch. Blocking
  `/api/listings/[id]/contact` entirely must still open the dialer, and a test
  asserts the component never gains the ability to cancel the click.
- **Impressions are counted where listings are SERVED, not in
  `getActiveListings`.** The ranking function is the single search path, but
  "fetched" is not "seen": the homepage strip pulls 1000 rows to render six, and
  the saved-search cron pulls results nobody looks at. Counts accumulate in an
  in-process `Map` (per-instance, like `lib/rate-limit.ts`) and flush as ONE
  upsert via `after()` — on the instance holding the buffer, since a cron would
  land elsewhere and find it empty. The figure is therefore a **floor**; never
  present it to a landlord as exact.
- **`market_rent_snapshots` is written long before it is read.** Its entire
  value is history and history cannot be backfilled, so the weekly cron is ON by
  default while the reader stays silent until ~8 weeks have accumulated.
  `sample_size` is stored per row so a reading taken while the market was too
  thin can be discarded afterwards.

## Landlord performance reports (2026-08-31)

Scheduled "how your listings did" summaries over WhatsApp — weekly for everyone,
daily as a paid-plan option. Flag-gated (`enableLandlordReports`), OFF by
default. Rollout steps and ops signals are in `docs/whatsapp-golive-runbook.md`.

- **A scheduled message is not a reply.** Every other outbound WhatsApp message
  in this codebase rides inside the 24-hour customer-service window the
  landlord's own message opened. A report never does, so it MUST go out as an
  approved Meta **template** (`sendWhatsAppTemplate`), never `sendWhatsAppText`
  — free-form outside the window is rejected with 131047 for every recipient.
  There is deliberately **no free-form fallback**: it cannot succeed, and
  repeated failed business-initiated sends degrade the WABA quality rating that
  every landlord's messages depend on.
- **`REPORT_TEMPLATE_TEXT` in `lib/reports/message.ts` is the contract.** It is
  the exact body registered with Meta. Changing the variable count without
  re-registering breaks delivery for everyone at once with nothing failing
  locally; `tests/unit/landlord-reports.test.ts` holds code and template in
  agreement. Template params can contain **no newlines, tabs or 5+ spaces**, and
  every declared variable must always be non-empty — hence one label per line
  rather than optional blocks.
- **Daily is the paid cadence, weekly is for everyone.** Gating the weekly
  report would defeat its purpose: it exists to retain the landlord who never
  opens the dashboard. The tier check runs at SEND time
  (`effectiveReportFrequency`), never at write time, so a lapsed plan drops back
  to weekly instead of billing 30 templates a month against a dead subscription
  — while preserving the landlord's stored choice for when they renew.
- **Only `users.wa_phone` may be messaged.** `users.phone` is user-typed and
  unverified; a performance report about someone's property must never reach a
  stranger who typed their number.
- **A failed send still advances `report_last_period_end`.** The job runs daily,
  so leaving it untouched would retry a dead number every day forever. A report
  is a snapshot, not a ledger. `dryRun` (no template configured) is counted
  separately from `failed` (WhatsApp rejected it) — reporting unfinished setup
  as failure sends ops hunting an outage that doesn't exist.
- **The job is strictly sequential and set-based.** Two queries per landlord,
  never concurrent — see commit a3ac4f9 for what `Promise.all` does to a `max: 1`
  pool on Supabase's transaction pooler. Raw `sql` fragments must cast Dates
  (`ts()` in `lib/reports/data.ts`); drizzle's own operators bind them, hand-
  written fragments throw at bind time inside the driver.

## Facebook post import (2026-09-07)

Ops/admin paste a Facebook post URL, the system extracts what it can, an
operator reviews and publishes, and the post's owner gets a WhatsApp template
with a one-tap edit/remove link. Two flags, both OFF: `enableFacebookImport`
(screens + actions) and `notifyImportedOwners` (the message). Rollout in
`docs/whatsapp-golive-runbook.md`.

- **`users.wa_phone` alone NO LONGER means verified.** Migration 0057 adds
  `wa_phone_verified_at`, and anything that MESSAGES a landlord must gate on the
  timestamp. Until now the intake pipeline was the only writer of `wa_phone` and
  only ever wrote numbers Meta had proven, so `wa_phone IS NOT NULL` was a fair
  stand-in. The importer is a second writer and stores the number an owner
  printed in their own advert — useful for matching their reply, no proof of
  anything. On the old test, `lib/reports/send.ts` would mail a landlord's
  traffic figures to whoever really holds a number a stranger typed into an ad.
  The number becomes verified at the only moment it honestly can: when it sends
  us a WhatsApp message, which lands in `getOrCreateWhatsAppLandlord`'s
  existing-user branch and stamps it — so an imported owner who replies claims
  the account already waiting for them instead of getting a second one.
- **`resolved_via = 'manual'` is the NORMAL outcome, never an error.** Meta
  removed the Groups API on 2024-04-22 and gates third-party Page reads behind
  App Review, so a group post returns a login wall — verified live 2026-09-07.
  Graph works only for our own `FACEBOOK_PAGE_ID`; OpenGraph gives a truncated
  preview for some public posts; everything else gives nothing. The review
  screen is therefore a listing editor that happens to come pre-filled, not a
  confirm-what-we-found form. Don't "fix" this with a logged-in session cookie:
  it rotates, and it puts our own publishing Page at risk.
- **`parseFacebookUrl` is an SSRF guard before it is a parser.** An operator
  pastes a string and the SERVER dereferences it. Hosts are an exact-match
  allowlist (never `endsWith`, which accepts `facebook.com.evil.com`),
  credentials in the authority are refused as ambiguous, and `fetchAllowlisted`
  re-vets **every redirect hop** — `redirect: 'follow'` would let a facebook.com
  URL bounce us to an internal address.
- **The owner message is business-initiated, so it is a template or nothing.**
  The recipient has never messaged us — that is the premise — so there is no
  24-hour window and free-form is rejected with 131047. `IMPORT_TEMPLATE_TEXT`
  in `lib/imports/message.ts` is the contract registered with Meta; a drifting
  variable count fails for every recipient at once with nothing failing locally.
  No free-form fallback, and `dry_run` (no template configured) is counted apart
  from `failed` (WhatsApp rejected it).
- **THE IMPORTER IS OPT-IN (migration 0060). Silence is a no.** The operator's
  button ASKS the owner over WhatsApp; their YES is what creates the listing.
  `post_imports.consent_granted_at` is the authorisation and
  `assertImportConsent` in `lib/imports/consent.ts` is the single gate, checked
  inside `publishImport` — the one function that inserts the row — because the
  bug this replaced was a missing call site, and a permission check spread
  across the four calling screens fails the same way. It **throws** rather than
  returning a boolean, so a caller that ignores the result still cannot publish.
  There is deliberately **no timeout that publishes anyway**: an unanswered
  import stays `awaiting_consent` forever, and that is the expected terminal
  state for most of them. The importer is no longer a way to seed the
  marketplace in bulk — it recruits landlords who actively said yes.
- **One yes covers the website AND social**, because `CONSENT_TEMPLATE_TEXT`
  names Facebook, Instagram and TikTok. That is what makes a single reply real
  consent, and why `socialConsentSource` is now `'whatsapp'` and `ownerAsked`
  is `true` — `'ops'` was the honest label only while nobody was asked.
- **The preview link mints no session.** `/l/<token>` resolves consent tokens
  *before* access tokens (the approved template's button base is baked in at
  Meta and cannot differ), and forwards to `/preview/<token>`, which renders
  from `post_imports` — **never** from `listings`, because no listing row exists
  yet and nothing the marketplace queries can surface it. Signing someone in
  before they have agreed to anything would be the wrong default. The token
  stops resolving the moment they answer.
- **A NO really deletes.** `declineImportConsent` wipes `raw_text`,
  `parsed_payload` and `photo_urls`, because the template promised it; the row
  survives only as a tombstone so the same advert is not imported and the same
  person asked twice. `already_asked` blocks a second ask for the same reason.
- **The consent reply is free-form, the go-live notice is a template.** The YES
  *is* the landlord opening the 24-hour window, so the confirmation rides inside
  it. Moderation can then hold the listing for hours, so the notice that follows
  may land outside the window — which is why it stays an approved template on
  all four go-live paths.
- **An imported listing's contact number is `verified: false`** and, when
  moderation is armed, the listing lands `pending` for the sweeper. These are
  third-party photos and third-party text; `autoPublishWhatsAppIntakes` is about
  a landlord submitting their own property and does not apply.
- **EVERY path to `active` owes the owner their notice, not just the sweeper.**
  A listing goes live four ways — `publishImport` with moderation disarmed, the
  moderation sweeper, `publishAnywayAction` in Back Office → Moderation, and a
  PATCH to `/api/listings/[id]`. For a while only the first two called
  `notifyImportedOwnerForListing`, so an ops override published the property and
  told the owner nothing, **permanently**: `post_imports.notified_at` stays null
  and no job re-reads the row. `reconcileMissedAnnouncements` made it worse by
  stamping `landlord_notified_at` on any listing with no intake row — it now
  tries the import notice before writing one off. The `notifiedAt IS NULL` guard
  inside makes the call safe from all four, so add it to any fifth;
  `tests/unit/import-owner-notice-timing.test.ts` fails if a path drops it.
- **Nothing may take the dry-run branch on a repair.** `notifyImportedOwner`
  stamps `notified_at` whatever the outcome — correct on the live paths, where a
  notice is a snapshot and not a ledger. It means a backfill run with
  `notifyImportedOwners` off or `WHATSAPP_IMPORT_TEMPLATE` unset marks every
  owner told while sending nothing, and there is no second chance.
  `pnpm imports:notify-owners` refuses to run in that state rather than
  reporting `dry_run` rows; listing mode (no arguments) is read-only.
- **`post_imports.status = 'published'` is not "the listing is live".** It is set
  unconditionally at the end of `publishImport`, so with moderation armed the
  Imports screen reads `published` for a listing still sitting `pending` in the
  moderation queue. Read `listings.status` for liveness.
- The importer reuses `parseIntake`, `getOrCreateWhatsAppLandlord`,
  `mintAccessLink`, `photoCap`/`capPhotos` and the manifest helpers. Note the
  parser is not reliable on real ads — an ad saying "hot water" above its rent
  loses the rent to `UTILITY_BEFORE_RE` — which is *why* a human reviews before
  anything publishes.

### "It loses the photos, cuts the caption, misses the phone and the name" (2026-09-10)

Reported again, and **three of the four are the OpenGraph limit above, not a
regression** — `metaContentAll` has collected every `og:image` since PR #97 and
a live multi-photo post still yielded exactly one. Do not go looking for a
parser bug; the bytes are not in the response. But three of our own bugs sat on
top and made the limit look worse than it is:

- **The paste must survive every button on the review screen.** The Post-text
  textarea lives in the re-extract `<form>`; Save and Publish submit a
  *different* one, and neither wrote `rawText` — so an operator who pasted the
  whole advert and pressed **Save draft** lost every word, and the phone chips
  (recomputed from the STORED text) stayed empty too. That one bug reproduced
  three of the four symptoms. A hidden `rawText` mirror in the editor form fixes
  it; `keepRawText` uses `||` not `??` so a submission without the field can
  never blank stored text. `tests/unit/import-extraction-losses.test.ts` guards it.
- **The importer publishes the WHOLE advert, not 400 characters of it.**
  `truncateDescription` in `rule-parser.ts` clips at 400 with an ellipsis — fine
  for a WhatsApp intake, amputation for an import whose `raw_text` is stored in
  full. `importDescription` in `lib/imports/publish.ts` prefers the full text
  when the composed one is just its prefix, and **scrubs it** with an empty
  allow-list: a longer description carries the phone number, imported numbers
  are `verified: false`, and `moderateListing` only scrubs when moderation is
  ARMED. Do **not** widen the clip in `rule-parser.ts` — it is shared with the
  live intake and needs a `RULES_VERSION` bump plus `pnpm parser:probe`.
- **`PHONE_PATTERNS` in `contact-scrub.ts` has DIVERGED from `PHONE_RES`**, which
  that module's comment always allowed. It now reads `.`, `(`, `)` and Unicode
  dashes, the `00` prefix, and asserts digit boundaries so `0771234567890` no
  longer yields a confident, invented `+94771234567`. **The two-character
  separator cap is load-bearing**: unlimited separators turn
  `Rs. 25,000 - 0112345678` into `+94000112345`. Widening the parser's copy is a
  separate change with a probe run.
- **`preferMobile` picks the consent recipient**, not written order. An advert
  lists a landline first as often as not, and the consent request only travels
  on WhatsApp — a landline spends the one ask (`already_asked` refuses a second)
  on a number that cannot receive it.
- **A pasted image URL is an SSRF surface.** `fetchOriginal` is a bare `fetch`
  with `redirect: 'follow'`, safe only because its input came from an
  already-allowlisted document. Operator-typed URLs go through
  `fetchPastedImage`, which allowlists Facebook's photo CDN and re-vets every
  redirect hop. The suffix test is `.fbcdn.net` **with the dot** — `fbcdn.net`
  alone accepts `evil-fbcdn.net`.
- **The listing photo cap belongs at publish, not at ingest.**
  `ingestRemoteImages` used a bare `break`, so over-cap photos were never
  stored, never reached the manifest, and vanished with nothing recording it —
  and the cap depended on arrival order, before the operator could choose a
  cover. `INGEST_HARD_LIMIT` is an abuse ceiling, not the photo cap.
- **The invite comment is the real answer** (`lib/imports/invite.ts`). Ops paste
  it under the original advert; the owner messages us; the intake pipeline gets
  the full text, every photo, their name and a Meta-proven number — everything
  the scrape cannot reach. It is also better consent than the ask: the WhatsApp
  template is **Marketing** (Meta refused Utility twice, structurally — the
  recipient is not yet a customer), and a recipient with marketing messages
  switched off never receives it, with no error, which is indistinguishable from
  being ignored. Commenting cannot be automated — same App Review gate — so it
  is composed here and pasted by hand. An inbound reply carrying `FB-<id>` only
  notifies ops; it must never swallow the message, which IS the submission.

## Public view counts (2026-09-11)

The listing page prints, to everyone, how many people have seen a listing: its
own page views plus the views Facebook, Instagram and TikTok report for its
posts. Migration 0062; flag `showPublicViewCounts`, ON by default (it is the
visible half of the free reach a landlord gets, and the flag is the kill switch,
not the launch switch).

- **UNKNOWN IS NOT ZERO, and this is the only rule that matters here.**
  `listing_social_posts.view_count` is nullable and NULL means *we have no
  reading* — a dry run, a post whose insights have not been computed yet, a
  TikTok account connected before `video.list` was requested, an expired Page
  token. A platform with no live post is **omitted entirely**; a platform with
  no reading renders **"—"**. A landlord who reads "Facebook views: 0"
  concludes their advert was ignored, when the truth is usually our own missing
  permission — the same class of lie as a `posted` badge on a dry run.
  `tests/unit/public-view-counts.test.ts` fails if `?? 0` reappears anywhere on
  that path.
- **The website figure is DEDUPLICATED at read time; `count(*)` on
  `listing_views` is a page-load counter.** That table stores one row per load
  deliberately — the write route says so, and the landlord analytics need the
  raw count to report views and people side by side — so a public "views"
  number must be `count(distinct visitor_hash)` plus a raw count of the
  pre-0046 rows that have no hash to dedupe on. Getting this wrong is not
  subtle to the landlord: they reload their own listing, watch the number
  climb, and stop believing every other figure on the page (reported and fixed
  2026-09-11; listing 34 read 10 for 6 viewer-days). Per-day is the only
  granularity available, because the hash rotates at midnight by design.
- **The page never calls a platform.** `refreshSocialMetrics`
  (`lib/social/metrics.ts`) reads the numbers on the publish cron and stores
  them; the page reads only our own database. Rate limits are per app, not per
  visitor, so one popular listing calling Graph on render would exhaust the
  quota for every other listing. `METRICS_STALE_MINUTES` is 180 — social counts
  move over days, and the cron ticks every five minutes.
- **`metrics_fetched_at` records when we last ASKED, not when we last got an
  answer.** A failed read stamps it too (and leaves `view_count` alone, keeping
  the last good reading); `metrics_error` is how the two are told apart. Without
  the stamp a missing OAuth scope is retried every five minutes forever — and
  because it is a timestamp rather than a dead flag, the row heals by itself
  once an admin reconnects.
- **Only `status = 'posted'` rows count.** A pulled post is not on the account
  any more, so its views are not a current fact about the listing.
- **TikTok view counts need the `video.list` scope, which `video.publish` does
  not grant.** The connect route now requests it, so **an account connected
  before 2026-09-11 cannot answer** — its reads fail `scope_not_authorized`
  until an admin clicks Connect TikTok again in Back Office → Social. The
  adapter marks that failure `permanent` so the sweeper backs off, and the
  figure stays "—" rather than 0. Also note `remotePostId` is sometimes a
  `publish_id` (when `publish()` stopped polling before TikTok settled), which
  `video/query` cannot match: an empty result is no reading, not zero.
- **Facebook Groups are absent from `MEASURABLE_PLATFORMS` permanently** — no
  API since 2024-04-22, so a group post has no id to query. The group adapter
  deliberately has **no** `metrics` method; absence is how the page knows to
  omit the line instead of inventing a number.
- **Meta RETIRES insight metrics, and a retired one returns `(#100) The value
  must be a valid insights metric` — not a deprecation warning.** So a metric
  name that worked when it was written fails silently-ish later: the figure just
  reads unknown forever. This already bit us once — the whole
  `post_impressions` family was retired (`post_impressions_unique` 2025-06-15,
  `post_impressions` 2025-11-15) and both names shipped in #117, so every
  Facebook figure was unreadable on arrival (caught 2026-09-11 from the stored
  `metrics_error`). Current mapping: `post_impressions` → `post_media_view`,
  `post_impressions_unique` → `post_total_media_view_unique`. When a figure
  reads `—` for every listing, **check `listing_social_posts.metrics_error`
  first** — that column exists for exactly this.
- `graphInsightValue` tries a chain (`post_media_view` →
  `post_total_media_view_unique`; `views` → `impressions` → `reach`). The order
  is not arbitrary: the fallbacks measure *people*, not views, and are always
  the smaller number — putting them second means a degraded reading
  under-counts rather than over-counts. Retired names are NOT kept as trailing
  fallbacks; they only add a guaranteed-failed HTTP call per refresh.
- **Instagram insights need App Review.** Ours returns `(#10) Application does
  not have permission for this action` — a permission gap, not a code bug, and
  no metric name fixes it. `isTokenError` covers code 10, so it is marked
  permanent and the sweeper backs off; because the back-off is a timestamp and
  not a dead flag, it heals by itself once the permission is granted.

## Performance: where the time actually goes (2026-09-02)

Navigation was slow for three reasons that multiplied, and none of them was slow
application code. Measured: `/api/listings/paginated` took **8 ms locally and 830 ms in
production** running the same queries.

- **Functions must stay in `sin1`.** `vercel.json` had no `regions` key, so it defaulted to
  `iad1` (Washington DC) while the database is `ap-southeast-1` (Singapore) — every query
  crossed the planet, and since the pool is `max: 1` with strictly sequential queries, that
  latency added up linearly with no concurrency to hide it. Verify after any deploy that
  changes function config: `x-vercel-id` must read `…::sin1::…`.
- **Dynamic work belongs BELOW a Suspense boundary.** `getUser()` reads cookies, and under
  PPR React postpones at the first dynamic access — so an `await` in the page body
  postpones at the root and the shell is empty *whether or not* `force-dynamic` is set.
  `app/(dashboard)/listings/listings-results.tsx` is the pattern: static chrome in the
  page, everything DB- or user-dependent in a Suspense child.
- **`getUser` is request-memoized with React `cache()`** (`lib/db/queries.ts`), as are
  `getListingById` and `getLandlordByProfileSlugOrPublicId`. Each unmemoized call is an
  HTTPS round trip to Supabase auth *plus* a DB query, and a single render hit 2-3 of them.
  `generateMetadata` and the page body both fetch the listing, and Next runs them
  concurrently — which on a `max: 1` pool is also the wedge risk. Don't unwrap these.
- **The middleware matcher excludes static file extensions.** It didn't, so every logo,
  `robots.txt` and `manifest.json` request ran Node middleware *and* made a Supabase auth
  call.
- Every route segment should have a `loading.tsx`. Without one, and without a prerendered
  shell, the router paints nothing on click.
- **A 300s hang right after a deploy is a dead DB socket, not the new code.** On
  2026-09-12 `/`, `/back-office` and `/back-office/settings` hung for 300s on the first
  instance of a deploy while `/api/user` ran the same `SELECT` on `users` fine from another
  instance; the identical build promoted to a fresh instance has served cleanly since, and
  the symptom predates that code (2026-06-18, 2026-09-04). Fluid Compute suspends an
  instance with postgres-js's socket still open, and `max: 1` lets one dead socket stall the
  whole instance. `lib/db/hold-until-idle.ts` holds each invocation until the idle socket
  has closed. Don't replace it with `attachDatabasePool` — it throws for postgres-js — or
  with postgres-js's `debug` hook, which puts query parameters into error logs. Raising
  `max` does not fix it either: postgres-js pipelines new queries onto busy connections,
  dead one included.

## When making changes

- Match the existing server-component-first style; reach for client components only when interactivity demands it.
- Keep listings free/unlimited and visibility manually-activated unless explicitly told otherwise — these are product decisions, not bugs.
- Schema change? Update `schema.ts` **and** add + register a numbered SQL migration.
- **Run `pnpm db:migrate-all` against production BEFORE the deploy lands.** Nothing
  runs it for you — `build` is a plain `next build` and `vercel.json` sets no
  `buildCommand`. Drizzle's relational queries name every column explicitly, so a
  column that exists in `schema.ts` but not in the database takes down *every read
  of that table*, not just the new feature. Adding four columns to `listings` and
  deploying first is what 500'd the whole site on 2026-08-22; a feature flag does
  not protect you, because the ORM names the columns whether the flag is on or not.
- **Then prove it with `pnpm db:check-drift`.** It compares every table, column and
  enum value `schema.ts` declares against the live database and exits non-zero on
  anything the code needs and the database lacks. `db:migrate-all` reporting
  "Done" is *not* proof — it swallows `already exists` errors, and a swallowed
  error can abort the rest of a file (see the `splitStatements` note above). This
  check is what would have caught both the 2026-08-22 outage and the untracked
  `0044`. It only reports the outage-causing direction; extra columns in the
  database are ignored, because migrations here never drop anything.
- New admin action? Add an `audit_action` enum value and log it.
- Preserve secure, generic auth messaging (no account enumeration) on sign-in/forgot-password flows.
- Sri Lanka context is the point: prices are LKR, locations are Sri Lankan cities/districts, and resilience fields (power/water/fiber) are first-class, not afterthoughts.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
