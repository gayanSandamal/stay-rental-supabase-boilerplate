---
name: audit-access-control
description: >
  Audit Easy Rent for authentication and role-based access-control problems —
  missing role gates, broken ownership checks, account enumeration, exposed
  secrets, unprotected cron. Use when reviewing a diff/PR for security, before a
  release, or when the user asks "is this locked down / who can access this".
---

# Audit access control

Easy Rent uses **Supabase Auth** as the source of truth. `getUser()` (`lib/db/queries.ts`) bridges the auth user to the `public.users` row by `auth_user_id` (excluding soft-deleted users) and is the basis for every server-side authz decision. `middleware.ts` only gates `/dashboard` (no role checks) — role enforcement is per-route/page.

## Role model
- Global `user_role`: `tenant | landlord | ops | admin`.
- Business-account-scoped role string: `owner | admin | member` (on `business_account_members`), additional to the global role.
- `requireBackOfficeAccess()` (`lib/auth/back-office.ts`) gates `/back-office/**` to admin/ops.

## Audit checklist (report findings Critical → Low with file:line + fix)

1. **Every protected route/page calls `getUser()` and checks `user.role`** (or `requireBackOfficeAccess`). Middleware presence is NOT sufficient for role gating.
2. **Ownership checks** on landlord mutations: can landlord A edit/delete landlord B's listing? Must verify `landlordId` from the DB, never from client input.
3. **Admin/ops-only actions** truly gated: visibility activation (Boost/Featured/Urgent/bundle), exports (`/api/export/**`), approvals/rejections, business-account & member management.
4. **No account enumeration**: sign-in, forgot-password, and reset return the same generic message regardless of whether the email exists. Login error is generic ("invalid email or password").
5. **Dynamic `params` awaited** and numeric IDs validated (`Number`, `isNaN`, `<=0`) before DB use.
6. **Account deletion is soft** (email mutation + `deletedAt`), and soft-deleted users are excluded by `getUser()`.
7. **Password reset tokens**: hashed before storage, single-use (`usedAt`), expiry-checked.
8. **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and other secrets never appear in `NEXT_PUBLIC_*`, client components, or responses. Service role used server-side only.
9. **Cron endpoints** (`/api/cron/**`) verify the `CRON_SECRET` bearer token.
10. **Rate limiting** present on write-heavy public endpoints (`lib/rate-limit.ts`) — note it's per-instance/in-memory (abuse-dampening, not a security boundary).
11. **Audit trail**: consequential admin actions call `logAudit`/`logListingAction`.

## Output
Prioritized list: severity · file:line · what's wrong · concrete fix. Don't claim something is safe without tracing it. Apply fixes only if asked; otherwise propose them.
