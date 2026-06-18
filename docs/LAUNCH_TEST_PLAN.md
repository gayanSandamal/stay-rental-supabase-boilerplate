# Launch Test Plan — easyrent.lk

Comprehensive manual QA test plan for publishing **Easy Rent** (https://easyrent.lk/).
This is the source-of-truth checklist a tester works through before declaring the site go-live ready.

- **Target:** https://easyrent.lk/ (prod) — run destructive/auth cases against a staging/preview deploy where possible.
- **Method:** manual, in-browser, driven per role. Can be assisted by the `qa-flow-tester` / `verify` flows.
- **Companion docs:** route map & role-by-page → `APP_OVERVIEW.md`; end-user behavior → `USER_MANUAL.md`; pre-launch findings → `LAUNCH_READINESS.md`; monetization rules → `Monetization Plan & Strategy - Reimagined Free Listing Paid Visibility.md`.

## How to use this document

Each case has an **ID**, **priority**, **role**, **preconditions**, **steps**, and **expected result**. Record Pass/Fail/Blocked + evidence (screenshot/URL/status code) against each ID.

**Priority:** `P0` = launch blocker (must pass to ship) · `P1` = should-fix before launch · `P2` = nice-to-have/post-launch.

**Sign-off gate:** all `P0` Pass + no open `P0`/`P1` regressions.

## Launch configuration assumptions (verify these first — they change expected results)

These are product decisions encoded in the code. Test cases assume the **launch** state below; if a flag/decision changes, re-baseline the affected suite.

| Assumption | Launch state | Where |
|---|---|---|
| Paid visibility / pricing section | **OFF** — site presents as fully free; no pricing section, price copy, or upgrade CTAs | `enablePricingSection = false`, `lib/feature-flags.ts` |
| Payments | **Manual/offline** — Stripe NOT wired to live checkout; admin/ops activate visibility after offline payment | monetization doc |
| Listings | **Free + unlimited on all tiers** (`LISTING_LIMITS = 999999`) — this is intentional, not a bug | `lib/landlord-plans.ts` |
| New listing status | **`pending`** — requires ops/admin approval before public | `app/api/listings/route.ts` |
| Tenant→landlord | **Auto-upgrade** on first listing creation | `app/api/listings/route.ts` |
| Visibility activation | **admin/ops only** — landlords get 403 | `app/api/listings/[id]/{boost,feature,urgent,bundle}` |
| Listing expiry | **30 days** after publish (`listingExpirationDays`) | `lib/feature-flags.ts` |

**Test accounts (seed):** `admin@easyrent.com/admin123` · `ops@easyrent.com/ops123` · `landlord@test.com/landlord123` · `tenant@test.com/tenant123`. (Repair with `pnpm tsx scripts/fix-seed-users.ts` if roles drift.) Use a throwaway tenant for destructive auth cases.

---

## Suite A — Pre-launch infrastructure & environment

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| A1 | P0 | Production build is green | Run `pnpm build` against the deploy commit | Exits 0; `dashboard/activity` and `sitemap.ts` do not time out (both `force-dynamic`/`revalidate`) |
| A2 | P0 | `CRON_SECRET` set in Vercel prod | Inspect Vercel env; then `curl -i https://easyrent.lk/api/cron/saved-search-alerts` with **no** auth header | Returns **401** (must fail closed). With wrong bearer → 401. With correct bearer → 200 |
| A3 | P0 | `NEXT_PUBLIC_BASE_URL=https://easyrent.lk` in prod | Inspect env; view-source on `/` and `/listings` | Canonical URLs, OG `url`, sitemap links all use `https://easyrent.lk` (no `localhost`/preview host) |
| A4 | P0 | `www` resolves & redirects | `curl -I https://www.easyrent.lk/` | Resolves and **301/308 → apex** `https://easyrent.lk/` |
| A5 | P0 | HTTPS + HSTS | `curl -I https://easyrent.lk/` and `http://easyrent.lk/` | HTTPS serves; HSTS header present; `http → https` 308 redirect |
| A6 | P1 | Security headers present | Inspect response headers on `/` | `X-Frame-Options`/CSP `frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` present |
| A7 | P1 | Secrets not leaked to client | View-source + JS bundles; grep for service-role key | `SUPABASE_SERVICE_ROLE_KEY` never appears in any `NEXT_PUBLIC_*` or client bundle |
| A8 | P1 | Email provider configured | Confirm `RESEND_API_KEY` + `EMAIL_FROM` set in prod | Transactional emails send (not console-logged); see Suite K |
| A9 | P1 | DB uses pooler in prod | Confirm `DATABASE_URL` uses Supabase **transaction pooler :6543** | Not the direct :5432 connection |
| A10 | P2 | Custom 404 | Visit `/this-route-does-not-exist` | Branded not-found page, HTTP 404, nav intact |

---

## Suite B — SEO, metadata & crawlability

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| B1 | P0 | `robots.txt` correct | GET `/robots.txt` | Allows public routes; disallows `/dashboard/`, `/back-office/`, `/api/`; **no** stray `Disallow: /` |
| B2 | P0 | `sitemap.xml` valid & complete | GET `/sitemap.xml` | Valid XML; includes `/`, `/listings`, `/list-your-property`, `/how-to-use`, `/pricing`, legal pages, active listing detail URLs, landlord `/[slug]` profile pages |
| B3 | P1 | Root metadata | View-source `/` | Title template, description, `metadataBase`, OpenGraph, Twitter `summary_large_image`, Org + WebSite JSON-LD with `SearchAction` |
| B4 | P1 | Listing detail structured data | View-source `/listings/[id]` | Valid `RealEstateListing` JSON-LD with LKR price, address, beds, baths |
| B5 | P1 | Auth/private pages noindexed | View-source `/sign-in`, `/sign-up` | `noindex` present; not in sitemap |
| B6 | P1 | Dynamic OG image | GET `/opengraph-image` | 200, 1200×630 image; listing pages emit OG image (fallback when listing has no photo) |
| B7 | P2 | `/listings` dynamic SEO | View-source `/listings` and a filtered URL | Dynamic title/description + canonical reflecting filters |
| B8 | P2 | Area landing pages (if shipped) | Visit Colombo/Kandy/etc. landing pages | Render, indexable, internally linked (deferred per LAUNCH_READINESS #8 — mark N/A if not shipped) |

---

## Suite C — Public marketplace (no login)

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| C1 | P0 | Homepage renders | Visit `/` | Hero explains *verified mid-to-long-term SL rentals*; CTAs for Browse Listings + List Your Property; no placeholder/lorem text |
| C2 | P0 | Browse without login | Click Browse Listings | Lands on `/listings`, no auth required, listing cards (or clear empty state) shown |
| C3 | P0 | Filters update results + URL | On `/listings` apply city, min/max price, bedrooms, property type | Results update; URL query string updates (`?city=Colombo&minPrice=...`); clear "no results" when empty |
| C4 | P0 | Rental-specific filters work | Filter by power backup, water source, fiber, parking, pets, verified, visited | Each filter narrows results correctly; combine multiple filters |
| C5 | P0 | Only active listings public | Confirm a `pending`/`rejected`/`expired`/`archived` listing is NOT shown publicly | Public index/detail show **active** listings only |
| C6 | P0 | Listing detail | Open a listing card → `/listings/[id]` | Title, city/address, LKR rent, beds/baths, resilience fields (power/water/fiber), verified/visited badges, photos |
| C7 | P0 | Contact reveal (phone/WhatsApp) | On detail, reveal contact | Phone/WhatsApp shown to anonymous visitor (no in-app messaging/booking); WhatsApp deep-link works |
| C8 | P1 | Contact reveal rate-limited | Reveal contact many times rapidly | Throttled after limit (per-instance rate limit); friendly message |
| C9 | P1 | Similar listings module | On detail, scroll to similar listings | Shows related listings (gated by `enableSimilarListings`); hidden when flag off |
| C10 | P1 | Social sharing | Use share buttons on detail | Share buttons present (gated by `enableSocialSharing`); links/preview correct |
| C11 | P1 | Pagination / load more | Browse beyond first page (`/api/listings/paginated`) | Loads next page; no duplicates; stable ordering |
| C12 | P1 | Search ranking order | Compare ordering of listings with different visibility | Featured → Boost → Urgent → plan tier → verified → completeness → newest (per `getActiveListings`; see LAUNCH_READINESS #9 re: Urgent vs tier precedence) |
| C13 | P2 | Listing not found | Visit `/listings/does-not-exist` | Custom not-found, no crash |
| C14 | P2 | Landlord public profile | Visit a landlord `/[slug]` page | Renders profile + their active listings |

---

## Suite D — Authentication & account

| ID | Pri | Title | Role | Steps | Expected |
|---|---|---|---|---|---|
| D1 | P0 | Sign-up as tenant | anon | `/sign-up`, submit invalid email + short password, then valid creds (default role) | Validation errors are friendly; on success redirect to **`/listings`**; logged-in state visible |
| D2 | P0 | Sign-up as landlord | anon | `/sign-up`, choose landlord role, valid creds | Redirect to **`/dashboard`**; landlord nav visible |
| D3 | P0 | Sign-up no account enumeration | anon | Sign up with an **already-registered** email | Generic message (no "user already exists" leak) — per LAUNCH_READINESS #5 |
| D4 | P0 | Sign-in role redirects | all | Sign in as tenant / landlord / ops / admin | tenant → `/listings`; landlord/ops/admin → `/dashboard` |
| D5 | P0 | Sign-in wrong password generic | anon | Sign in with wrong password | Generic "invalid email or password" (no enumeration) |
| D6 | P0 | Forgot password generic | anon | `/forgot-password` with unlikely + known email | Same generic success message both times (no enumeration) |
| D7 | P0 | Reset password happy path | anon | Follow reset link → `/reset-password?token=...`; mismatched then matching passwords | Mismatch → clear error; match → success; can log in with new password |
| D8 | P1 | Reset token invalid/expired | anon | Use a tampered/old token | Clear "link invalid or expired" message; no crash |
| D9 | P1 | Password reset flag off | admin/anon | Turn `enablePasswordReset` off in back office; visit `/forgot-password` | Flow disabled/hidden gracefully |
| D10 | P1 | Session persistence & logout | any | Log in, refresh, navigate, then log out | Session persists across refresh; logout clears session; protected pages redirect to `/sign-in` |
| D11 | P1 | DB trigger creates public.users row | any | Sign up a fresh user | `public.users` row auto-created (migration 0020), default role `tenant`, `deletedAt` null |
| D12 | P2 | Email confirmation flow | anon | Sign up; check confirmation email behavior | Matches configured Supabase auth flow (see `docs/AUTH_CONFIGURATION.md`) |

---

## Suite E — Tenant flows (logged in as tenant)

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| E1 | P0 | Tenant cannot access dashboard | As tenant, visit `/dashboard` | Redirected (no dashboard) until upgraded to landlord |
| E2 | P0 | Tenant cannot access back-office | As tenant, visit `/back-office` | Redirected; no back-office UI (verify in-browser, not just HTTP — PPR returns a 200 shell, see LAUNCH_READINESS ⚪) |
| E3 | P1 | Save a search | As tenant, build filters and save the search | Saved search persists; appears in `/dashboard/saved-searches` (after upgrade) or tenant-visible list |
| E4 | P1 | Saved-search alert emails | Trigger `saved-search-alerts` cron (with `CRON_SECRET`) after a matching listing goes active | Tenant receives alert email (gated by `enableLeadNurturing`) |
| E5 | P1 | Contact landlord as tenant | Open detail, reveal contact | Phone/WhatsApp visible; behaves same as anon |
| E6 | P2 | Renter premium (deprecated) | If exposed, inspect premium upsell | Deprioritized; hidden when pricing flag off |

---

## Suite F — Landlord listing lifecycle

| ID | Pri | Title | Role | Steps | Expected |
|---|---|---|---|---|---|
| F1 | P0 | First listing auto-upgrades tenant | tenant | Logged in as tenant → `/list-your-property` → create listing (title, address, city, beds, rent, ≥1 contact number) | Creation succeeds; role becomes **landlord**; `/dashboard` now accessible |
| F2 | P0 | New listing starts `pending` | landlord | Create a listing | Status = **pending**; NOT visible on public `/listings` until approved |
| F3 | P0 | Required-field validation | landlord | Submit create form with missing/invalid fields | Clear per-field errors; no server 500 |
| F4 | P0 | Photo upload | landlord | Upload property photos (`/api/upload`) | JPEG/PNG/WebP/GIF ≤5MB accepted; oversized/wrong type rejected; photos persist to listing |
| F5 | P0 | Edit own listing reflects publicly | landlord | Edit title/rent in `/dashboard/listings/[id]/edit`, save | Success; after approval, change visible on public `/listings/[id]` |
| F6 | P0 | Landlord sees only own listings | landlord | Open `/dashboard/listings` | Only this user's listings (admin/ops see more) |
| F7 | P0 | Landlord cannot approve/reject | landlord | Inspect listing actions | No approve/reject/re-review controls (admin-only) |
| F8 | P1 | Edit/delete IDOR protection | landlord | Try to PUT/PATCH/DELETE another landlord's listing via API | 403/404 — ownership enforced |
| F9 | P1 | Contact numbers management | landlord | Add/edit/delete contact numbers (`/api/contact-numbers`) | CRUD works; can't edit another user's numbers (IDOR) |
| F10 | P1 | Duplicate detection | landlord | Create a near-duplicate listing | Flagged as likely duplicate (gated by `enableDuplicateDetection`); HTTP 409 with duplicate list |
| F11 | P1 | Archive / mark rented | landlord | Archive a listing / mark as rented | Status transitions; removed from public index |
| F12 | P1 | Listing expiry (30d) | landlord/system | Inspect an expired listing + reminder behavior | Auto-`expired` after `listingExpirationDays`; expiration reminder sent; not shown publicly |
| F13 | P1 | Analytics dashboard | landlord | Open `/dashboard/analytics` | Views/metrics render (gated by `enableAnalyticsDashboard`); hidden when off |
| F14 | P1 | Listing limit NOT enforced | landlord | Create many listings on free tier | All allowed (limit 999999) — listings are free/unlimited by design |
| F15 | P2 | Custom profile slug | landlord (pro/agency) | Set profile slug (`/api/landlords/me/profile-slug`) | Allowed only for pro/premium/agency; `/[slug]` resolves |
| F16 | P2 | General/account settings | landlord | `/dashboard/general` edit profile/contact | Saves; reflected across app |
| F17 | P2 | Activity feed | landlord/ops | `/dashboard/activity` | Renders recent activity; page is dynamic (no stale build) |

---

## Suite G — Ops/Admin back-office

| ID | Pri | Title | Role | Steps | Expected |
|---|---|---|---|---|---|
| G1 | P0 | Back-office access control | tenant/landlord vs ops/admin | Visit each `/back-office/**` page as each role | Non-ops/admin redirected; ops/admin get back-office layout + nav |
| G2 | P0 | Approve listing → goes public | ops/admin | Open a `pending` listing in dashboard/back-office, approve | Status → `active`; now visible on public `/listings`; audit log entry written |
| G3 | P0 | Reject / request re-review | ops/admin | Reject a listing; request re-review on another | Status → `rejected`; re-review flow works; landlord notified; audit logged |
| G4 | P0 | Platform-wide listings view | ops/admin | `/back-office/listings` | Listings from multiple landlords/business accounts visible |
| G5 | P1 | Create business account | ops/admin | `/back-office/business-accounts/new` with realistic data | Created; detail page shows name/status/metadata; blank/invalid fields validate |
| G6 | P1 | Add team member | ops/admin | `/back-office/business-accounts/[id]/add-member`, role member/admin/owner | Member appears in account detail + `/back-office/team-members` with correct role |
| G7 | P1 | Edit/remove team member | ops/admin | Change member role / remove member | Updates reflect; IDOR-safe (member-scoped routes) |
| G8 | P1 | Data export (admin) | admin | Trigger `/api/export/listings` | File downloads; ops/admin-only; feature-flagged (`enableDataExport`); audit-logged; no secrets in export |
| G9 | P1 | Export blocked for non-admin | tenant/landlord | Call export endpoint | 401/403 |
| G10 | P1 | Admin/ops create on behalf | ops/admin | Create a listing for another landlord | Allowed (per role check); `createdBy` forced to authenticated user.id, not client body (LAUNCH_READINESS #6) |
| G11 | P2 | Back-office overview stats | ops/admin | `/back-office` | Stats render without error |
| G12 | P2 | Cross-surface data consistency | ops/admin | Compare a listing across `/listings`, `/listings/[id]`, `/dashboard/listings`, `/back-office/listings` | Title/rent/status badges consistent everywhere |

---

## Suite H — Monetization & visibility products

> At launch `enablePricingSection = OFF`. Run H1–H3 in **OFF** state, then flip ON in back office and run H4+.

| ID | Pri | Title | Role | Steps | Expected |
|---|---|---|---|---|---|
| H1 | P0 | Pricing hidden when flag OFF | anon | With pricing OFF, visit `/`, `/pricing`, listing detail | No pricing section, no price copy, no "upgrade" CTAs; site presents as fully free |
| H2 | P0 | Landlord cannot self-activate visibility | landlord | POST `/api/listings/[id]/boost` (and feature/urgent/bundle) | **403** "Only admin or ops can activate boosts. Contact support after payment." |
| H3 | P0 | No live checkout exists | any | Look for Stripe checkout / payment capture | None wired; payments are offline/manual |
| H4 | P1 | Admin activates Boost | admin/ops | POST boost on a listing | `boostedUntil` = now + 7d; audit logged; ranking reflects boost |
| H5 | P1 | Admin activates Featured/Urgent | admin/ops | Activate feature (LKR 500/7d) and urgent (LKR 150/7d) | Durations correct; badges show; ranking reflects |
| H6 | P1 | Bundle activation | admin/ops | Activate a bundle | Applies its components; audit logged |
| H7 | P1 | Included Boosts consumed | admin/ops | Boost a listing for a starter/pro/agency landlord | Uses included monthly boost (0/1/3/6 per tier); "X remaining this month" message; decrements |
| H8 | P1 | Prices match constants & doc | anon (flag ON) | Read pricing UI | Boost 250 / Featured 500 / Urgent 150; Starter 900 / Pro 2,500 / Agency 5,000; bundles 350/650/1,000; renter Premium 300 |
| H9 | P1 | Plan tier ranking weight | admin | Set landlords to different tiers, compare ranking | Higher tier ranks above lower (weights 0/1/2/3), below Featured/Boost/Urgent |
| H10 | P1 | Visibility expiry | system | Let a boost/feature/urgent window lapse | Reverts to normal ranking after expiry |
| H11 | P2 | Bulk renew (agency) | landlord (agency) | `/api/listings/bulk-renew` | Allowed only for agency tier + own listings; others 403 |

---

## Suite I — Feature flags (Back Office → Settings)

| ID | Pri | Title | Role | Steps | Expected |
|---|---|---|---|---|---|
| I1 | P0 | Toggle persists & takes effect | admin | Toggle a flag (e.g. `enableSimilarListings`) off, reload affected page | DB override saved; effect visible without rebuild (flag-gated pages are `force-dynamic`); audit `feature_flag_updated` logged |
| I2 | P0 | Pricing master switch | admin | Flip `enablePricingSection` ON then OFF | ON: pricing section + price copy + upgrade CTAs appear. OFF: all hidden |
| I3 | P1 | Public vs private flags | anon | GET `/api/feature-flags` | Only `public:true` flags exposed (self-service, social, similar, analytics, password-reset, pricing, expiration days); private flags (audit, rate-limit, export, dup-detection, lead-nurturing) NOT exposed |
| I4 | P1 | Numeric flag | admin | Change `listingExpirationDays` | New listings use the new expiry window |
| I5 | P1 | Disable rate limiting (debug only) | admin | Toggle `enableRateLimiting` off then on | Throttling stops/resumes accordingly |
| I6 | P1 | Disable audit logging | admin | Toggle `enableAuditLog` off, perform an admin action | No new audit rows while off (confirm intended) |
| I7 | P2 | Flag cache TTL | admin | Toggle a flag, observe propagation delay | Picked up within store TTL across instances |

---

## Suite J — Security & RBAC

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| J1 | P0 | Cron fails closed | Call both `/api/cron/*` with no/wrong bearer | 401 (see A2) |
| J2 | P0 | Visibility routes role-gated | Hit boost/feature/urgent/bundle as tenant/landlord | 403; as ops/admin → allowed |
| J3 | P0 | Listing IDOR | As landlord A, edit/delete landlord B's listing via API | 403/404 |
| J4 | P0 | Saved-search / notification / contact-number IDOR | Mutate another user's `saved-searches/[id]`, `notifications/[id]/read`, `contact-numbers/[id]` | 403/404 — ownership enforced |
| J5 | P0 | No account enumeration | Sign-in, sign-up, forgot-password with known vs unknown emails | Generic responses everywhere (D3/D5/D6) |
| J6 | P1 | `createdBy` not client-trusted | Create listing with forged `createdBy` in body | Server forces `user.id`; forged value ignored |
| J7 | P1 | Soft-delete on account deletion | `/dashboard/security` → delete with correct password | Email mutated + `deletedAt` set (not hard-deleted); logged out → `/sign-in?deleted=true`; old email can't log in; `getUser()` returns null for deleted |
| J8 | P1 | Change password | `/dashboard/security` | Wrong current → error; same-as-current → error; valid → success + re-login works |
| J9 | P1 | Unauthenticated API access | Hit authed endpoints (listings POST, user, export) with no session | 401 |
| J10 | P1 | Middleware gates `/dashboard` | Visit `/dashboard/*` unauthenticated | Redirect to `/sign-in` |
| J11 | P2 | Upload abuse | Upload oversized / wrong-type / many files | Rejected by size/type/rate limits |

---

## Suite K — Notifications & email

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| K1 | P1 | In-app notifications | Trigger an event (approval/rejection); open notification center | Notification appears; mark-as-read works (`/api/notifications/[id]/read`) |
| K2 | P1 | Transactional emails send | With `RESEND_API_KEY` set: trigger reset password, approval, saved-search alert | Emails delivered from `EMAIL_FROM`; not console-only |
| K3 | P1 | Email graceful degradation | Without `RESEND_API_KEY` (staging) | Emails log to console; no crash |
| K4 | P2 | Email content/links | Inspect a reset + alert email | Correct branding; links use `https://easyrent.lk`; reset token valid |

---

## Suite L — Cron jobs

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| L1 | P0 | `saved-search-alerts` auth + run | Call with correct bearer | 200; matches saved searches against new active listings; sends alerts; writes DB; idempotent enough not to double-send |
| L2 | P1 | `refresh-suggestions` | Call with correct bearer | 200; refreshes suggestion data (`/api/search/suggestions` reflects) |
| L3 | P1 | Vercel cron schedule | Confirm cron config | `refresh-suggestions` ~15 min, `saved-search-alerts` ~6 h; both pass `CRON_SECRET` |

---

## Suite M — Non-functional & cross-cutting

| ID | Pri | Title | Steps | Expected |
|---|---|---|---|---|
| M1 | P0 | Responsive layout | Test mobile / tablet / desktop widths on `/`, `/listings`, `/listings/[id]`, dashboard, back-office | No broken layouts; dashboard/back-office sidebar collapses to hamburger/overlay |
| M2 | P0 | Core browser matrix | Chrome, Safari, Firefox (+ iOS Safari, Android Chrome) | Key flows (browse, contact, sign-in, create listing) work |
| M3 | P1 | Error handling | Force server/validation errors (missing fields, bad IDs) | Friendly messages, no raw stack traces / 500 pages |
| M4 | P1 | Performance | Lighthouse on `/` and `/listings` | Reasonable LCP/CLS; images optimized; no obvious jank |
| M5 | P1 | Accessibility basics | Keyboard nav, focus states, alt text, color contrast on key pages | No critical a11y blockers (forms labelled, images have alt) |
| M6 | P1 | Sri Lanka context correct | Spot-check listings/filters | Prices in LKR; SL cities/districts; deposits in months; notice periods; resilience fields first-class |
| M7 | P2 | Empty states | View listings with no results, dashboard with no listings, no notifications | Clear, branded empty states |
| M8 | P2 | Copy / content pass | Click through `/`, `/listings`, `/pricing`, `/how-to-use`, `/privacy-policy`, `/terms-of-service` | No placeholder/typo/stale copy (LAUNCH_READINESS ⚪) |
| M9 | P2 | `/terminal` not user-facing | Visit `/terminal` | Dev-only; not linked in user nav |

---

## P0 launch gate (quick smoke — all must pass)

A1, A2, A3, A4, A5 · B1, B2 · C1, C2, C3, C5, C6, C7 · D1, D2, D3, D4, D5, D6, D7 · E1, E2 · F1, F2, F4, F5, F6, F7 · G1, G2, G3, G4 · H1, H2, H3 · I1, I2 · J1, J2, J3, J4, J5 · L1 · M1, M2

If every P0 above passes and no open P0/P1 regressions remain, the site is shippable.

---

## Test run log (fill in per release)

| Date | Build/commit | Env | Tester | P0 pass | Open blockers | Sign-off |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |
