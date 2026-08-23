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
- **Feature flags**: defaults + metadata live in `lib/feature-flags.ts`; `isFeatureEnabled`/`getFeatureValue` stay synchronous and read a per-instance resolved snapshot. At runtime, rows in the `feature_flags` table override the defaults — admins toggle them in **Back Office → Settings**. `lib/feature-flags-store.ts` loads overrides (TTL-cached, per-instance like rate-limit) into the snapshot; the root layout and flag-checking API routes call `loadFeatureFlags()`, and `setFeatureFlag()` persists + audit-logs (`feature_flag_updated`). Client components read public flags via `useFeatureFlag` (`/api/feature-flags`). Pages that gate on a flag must be dynamic (`force-dynamic`) so toggles take effect without a rebuild. Gate new/experimental features behind a flag.
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

`DATABASE_URL` (pooler :6543 in prod) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…PUBLISHABLE_KEY`) · `SUPABASE_SERVICE_ROLE_KEY` (admin/storage) · `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` · `NEXT_PUBLIC_BASE_URL` · `CRON_SECRET`. Never put secrets in `NEXT_PUBLIC_*`.

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
- New admin action? Add an `audit_action` enum value and log it.
- Preserve secure, generic auth messaging (no account enumeration) on sign-in/forgot-password flows.
- Sri Lanka context is the point: prices are LKR, locations are Sri Lankan cities/districts, and resilience fields (power/water/fiber) are first-class, not afterthoughts.
