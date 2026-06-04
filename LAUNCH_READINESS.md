# Launch Readiness — easyrent.lk

Pre-launch technical, security, SEO, and business review of Easy Rent.

- **Date:** 2026-06-04
- **Target domain:** https://easyrent.lk/
- **Status at review:** site is live on Vercel + Cloudflare, HTTPS/HSTS active, all key public routes return 200.
- **Method:** local production build, live HTTP probes (headers/routes/robots/sitemap/redirects), and code audits across security/RBAC, SEO, and the monetization model.

Legend: 🔴 blocker · 🟠 should-fix · 🟡 nice-to-have · ✅ verified healthy · ⚪ needs manual verification.

## Remediation status (2026-06-04)

Fixed in-repo this session:
- ✔ #1 build — `force-dynamic` on `dashboard/activity` + `sitemap.ts`.
- ✔ #2 cron guards hardened to fail closed (still set `CRON_SECRET` in Vercel).
- ✔ #5 sign-up enumeration — generic message.
- ✔ #6 `createdBy` forced to authenticated `user.id`.
- ✔ #7 baseline security headers added in `next.config.ts` (CSP `frame-ancestors` only; full CSP deferred).
- ✔ #10 sitemap now includes `/how-to-use`.
- ✔ theme-color added to `viewport`.

Still requires you (infra/external, cannot be done in-repo):
- ☐ #2 set `CRON_SECRET` in Vercel production.
- ☐ #3 confirm `NEXT_PUBLIC_BASE_URL=https://easyrent.lk` in Vercel production.
- ☐ #4 add `www.easyrent.lk` DNS record + redirect to apex.

Deferred (larger scope): #8 area landing pages, #9 ranking-order decision, remaining SEO polish, content/UX pass.

---

## 🔴 Launch blockers

### 1. Production build is failing
`pnpm build` exits with code **1**. Two pages time out (>60s) during static generation:
- `app/(dashboard)/dashboard/activity/page.tsx`
- `app/sitemap.ts`

**Root cause:** neither declares `export const dynamic`. `activity/page.tsx` never reads auth/cookies, so Next tries to *statically prerender* it and runs `getRecentAuditLogs()` (a DB query) at build time; the DB-backed `sitemap.ts` behaves the same way. The live site works only because a past build happened to beat the timeout — every future deploy is non-deterministic. Statically baking an authenticated audit-log page is also a correctness/staleness concern.

**Fix:**
- Add `export const dynamic = 'force-dynamic'` to `app/(dashboard)/dashboard/activity/page.tsx`.
- Add `export const revalidate = 86400` (or `dynamic`) to `app/sitemap.ts`.

> Note: other `/dashboard` and `/back-office` pages are fine — they call `getUser()`, which reads cookies and automatically opts them out of static generation.

### 2. Cron endpoints become public if `CRON_SECRET` is unset
Guard is `if (cronSecret && authHeader !== ...)` — a *missing* env var skips auth entirely. `saved-search-alerts` sends emails and writes to the DB.
- `app/api/cron/saved-search-alerts/route.ts:20`
- `app/api/cron/refresh-suggestions/route.ts:12`

**Fix:** confirm `CRON_SECRET` is set in Vercel production, and harden to `if (!cronSecret || authHeader !== \`Bearer ${cronSecret}\`) return 401;`.

### 3. Confirm `NEXT_PUBLIC_BASE_URL=https://easyrent.lk` in Vercel prod
Code default and `.env` are correct, but `.env` is local-only. If the Vercel var is missing or still `localhost`, every canonical URL, OpenGraph `url`, and sitemap link breaks. **Action:** verify the production env var before launch.

### 4. `www.easyrent.lk` does not resolve
DNS lookup fails (`Could not resolve host: www.easyrent.lk`). Anyone typing `www.` hits a dead page. **Action:** add a `www` DNS record and redirect it to the apex.

---

## 🟠 Should-fix

| # | Area | Finding | Location |
|---|------|---------|----------|
| 5 | Security | **Sign-up account enumeration** — returns "User with this email already exists" (sign-in and forgot-password are correctly generic). Return a generic message / rely on email-confirmation. | `app/(login)/actions.ts:167,261` |
| 6 | Security | **`createdBy` trusted from client body** on listing create; it later grants edit/delete via the ownership check. Force it to `user.id` server-side. | `app/api/listings/route.ts:215` |
| 7 | Security | **No security headers beyond HSTS** — no CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Add via `next.config` headers or middleware. | live response headers |
| 8 | Growth/SEO | **No area/location landing pages** (Colombo, Kandy, Negombo, Galle, Jaffna) — the #1 SEO acquisition lever per the marketing strategy. `getActiveListings` already supports city/district filters (`lib/db/queries.ts:159-160`). Use the `create-area-landing-page` skill. | missing routes; `app/sitemap.ts` |
| 9 | Business | **Search ranking order mismatch** — SQL orders Featured→Boost→**plan tier→Urgent**; spec/comment says Featured→Boost→**Urgent→plan tier**. Not customer-visible. Decide intended precedence and fix the misleading comment. | `lib/db/queries.ts:290-299` |
| 10 | SEO | Sitemap omits `/how-to-use` (and landlord `/[slug]` profile pages, which are indexable). | `app/sitemap.ts` |

---

## 🟡 Nice-to-have (polish)

- **SEO polish:** add `themeColor` to the exported `viewport` (`app/layout.tsx`); add PNG icon / `apple-touch-icon` / web manifest (only `favicon.ico` exists today); add `BreadcrumbList` JSON-LD matching the visible breadcrumb on listing detail; add an OG-image fallback for listings with no photo.
- **Build hygiene:** `pnpm i baseline-browser-mapping@latest -D` (stale-data build warning); address the `middleware`→`proxy` deprecation warning.
- **Minor correctness:** listing-view endpoint has no per-IP dedup (inflatable counts, not security-sensitive); `landlords/[id]` PATCH returns 404 only after building the update.

---

## ⚪ Needs manual verification

- **Content / copy / UX pass** — Cloudflare blocks automated fetches (HTTP 403), so the live homepage copy could not be read programmatically. Manually click through `/`, `/listings`, `/pricing`, `/how-to-use` for placeholder text, typos, broken/empty sections, and stale copy. (Can be driven with the `qa-flow-tester` / `verify` flow.)
- **`/back-office` returns a 200 shell to unauthenticated requests** at the HTTP level — a Partial Prerendering (PPR) artifact; the code path *does* call `requireBackOfficeAccess()`. Confirm in-browser that an unauthenticated or tenant user is actually redirected.

---

## ✅ Verified healthy (no action)

**Security / RBAC**
- No exposed secrets — `SUPABASE_SERVICE_ROLE_KEY` is server-only, never in `NEXT_PUBLIC_*`, never imported by a `use client` module. `.env*` gitignored; `.env.example` holds placeholders only.
- All four visibility-activation routes (`boost`, `feature`, `urgent`, `bundle` under `app/api/listings/[id]/`) enforce `getUser()` + role ∈ {admin, ops} → **landlords cannot self-activate paid visibility.**
- All 8 `/back-office/**` pages call `requireBackOfficeAccess()`. `middleware.ts` redirects unauthenticated `/dashboard` → `/sign-in`.
- IDOR/ownership checks on listing PUT/PATCH/DELETE, `saved-searches/[id]`, `notifications/[id]/read`, `contact-numbers/[id]`. `bulk-renew` gated to agency tier + ownership.
- Generic auth messaging on sign-in and forgot-password (no enumeration). Soft-delete on account deletion. Export route feature-flagged + admin/ops-gated + audit-logged.

**Business / monetization**
- Listings free + unlimited on all tiers (`LISTING_LIMITS = 999999`) — intended.
- All customer-facing prices match the constants and the monetization doc: Boost LKR 250/7d, Featured LKR 500/7d, Urgent LKR 150/7d; plans Starter 900 / Pro 2,500 / Agency 5,000; bundles 350 / 650 / 1,000; renter Premium 300. `INCLUDED_BOOSTS_PER_MONTH` (0/1/3/6) and `PLAN_TIER_WEIGHTS` (0/1/2/3) match.
- Visibility activation is manual/admin-ops-only; Stripe is not wired to live payments (no checkout route, no webhook handler).

**SEO foundation**
- Root metadata correct (title template, description, `metadataBase`, OpenGraph, Twitter `summary_large_image`, Org + WebSite JSON-LD with `SearchAction`).
- `robots.ts` disallows `/dashboard/`, `/back-office/`, `/api/`; no stray `Disallow: /` or global `noindex`. Auth pages noindexed.
- Dynamic OG image at `app/opengraph-image.tsx` (1200×630). Listing detail emits valid `RealEstateListing` JSON-LD with LKR price/address/beds/baths. `/listings` has dynamic title/description + canonical.

**Infra (live probes)**
- HTTPS with HSTS (`max-age=63072000`); apex `http→https` 308 redirect.
- 200 on `/`, `/listings`, `/list-your-property`, `/how-to-use`, `/pricing`, `/sign-in`, `/sign-up`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`, `/opengraph-image`; `/dashboard` correctly 307s when unauthenticated.

---

## Suggested order of work

1. Fix the build (blocker #1) → get a reliably green deploy.
2. Set/verify Vercel env vars: `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL` (#2, #3) and harden the cron guard.
3. Add `www` DNS + redirect (#4).
4. Security headers + sign-up enumeration + `createdBy` (#5, #6, #7).
5. Manual content/UX pass (⚪).
6. Growth: area landing pages (#8) and remaining SEO polish.
