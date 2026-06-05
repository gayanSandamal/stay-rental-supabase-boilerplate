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

## When making changes

- Match the existing server-component-first style; reach for client components only when interactivity demands it.
- Keep listings free/unlimited and visibility manually-activated unless explicitly told otherwise — these are product decisions, not bugs.
- Schema change? Update `schema.ts` **and** add + register a numbered SQL migration.
- New admin action? Add an `audit_action` enum value and log it.
- Preserve secure, generic auth messaging (no account enumeration) on sign-in/forgot-password flows.
- Sri Lanka context is the point: prices are LKR, locations are Sri Lankan cities/districts, and resilience fields (power/water/fiber) are first-class, not afterthoughts.
