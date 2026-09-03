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

`DATABASE_URL` (pooler :6543 in prod) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…PUBLISHABLE_KEY`) · `SUPABASE_SERVICE_ROLE_KEY` (admin/storage) · `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` · `NEXT_PUBLIC_BASE_URL` · `CRON_SECRET` · `VIEW_HASH_SALT` (view-dedup salt; must be stable across instances — a per-instance value multiplies every unique-viewer count). Never put secrets in `NEXT_PUBLIC_*`.

## Where to look

- Routes/page map, role-by-page, manual QA scenarios → `APP_OVERVIEW.md`
- End-user behavior (tenant/landlord/ops) → `USER_MANUAL.md`
- Monetization rules & pricing → `Monetization Plan & Strategy - Reimagined Free Listing Paid Visibility.md`
- Tech/infra detail & env → `Tech Stack.md`
- Auth/Supabase setup → `docs/AUTH_CONFIGURATION.md`, `docs/SUPABASE_DATABASE.md`
- Form builder → `FORM_BUILDER_GUIDE.md`, `lib/forms/README.md`

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
