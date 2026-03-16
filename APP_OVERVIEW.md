## Easy Rent App Overview

Easy Rent is a **Next.js (App Router) boilerplate** for a mid‑to‑long‑term rental marketplace in Sri Lanka.

It combines:

- **Public/tenant experience**: browse verified listings with rich filters, property details, and direct contact (phone/WhatsApp).
- **Landlord dashboard**: manage your own listings.
- **Internal back‑office**: ops/admin tools to manage business accounts, team members, and platform‑wide listings.

Data is stored in Postgres using **Drizzle ORM**, with strong modeling around landlords, listings, and business accounts, plus verification flags and Sri‑Lanka‑specific resilience fields (power backup, water source, etc.).

---

## Routes

### Public & Marketing

- **`/`**  
  Landing page with hero, trust signals, differentiators, how‑it‑works, testimonials, and strong CTAs for:
  - Browsing listings (`/listings`)
  - Listing your property (`/list-your-property`)
  - Signing in / creating an account (`/sign-in`, `/sign-up`)

- **`/listings`**  
  Public listings index with:
  - Search and filters (city, district, price range, bedrooms, property type, power backup, water source, fiber, parking, pets, verified/visited flags, etc.).
  - Uses `getActiveListings` and shows enriched publisher info (individual landlord vs business account).

- **`/listings/[id]`**  
  Single listing detail page:
  - Full property info, resilience features, verification/visit badges, etc.
  - Admin/ops see extra controls/actions (based on `user.role` checks).

- **`/list-your-property`**  
  Entry point for landlords to start listing their property (funnels them into auth + landlord flows).

- **`/not-found`**  
  Custom 404 page used by Next.js for unknown routes.

### Auth

Top‑level route group: `app/(login)/**` – the group name does **not** appear in the URL.

- **`/sign-in`**  
  Sign‑in page using the shared `Login` component in `signin` mode.  
  On success:
  - `admin` / `ops` → redirect to `/dashboard`
  - `tenant` / `landlord` → redirect to `/listings`

- **`/sign-up`**  
  Sign‑up page using the same `Login` component in `signup` mode.  
  - Accepts optional `role` (`tenant` or `landlord`, default `tenant`).
  - On success:
    - `landlord` → `/dashboard`
    - `tenant` → `/listings`

- **`/forgot-password`**  
  Starts password reset flow; creates a password reset token and emails a reset link.

- **`/reset-password`**  
  Completes password reset using a signed token.

### Landlord / Ops Dashboard

Top‑level route group: `app/(dashboard)/dashboard/**` → URLs under `/dashboard`.

- **`/dashboard`**  
  Dashboard overview for landlords/ops/admin:
  - High‑level stats: active listings, verified listings.
  - Quick actions guidance (“Use the navigation menu…”).

- **`/dashboard/listings`**  
  Listings management:
  - Shows current user’s listings (plus more if admin/ops).
  - Actions like edit, archive, delete, approval/re‑review flows for admin/ops.

- **`/dashboard/listings/new`**  
  Create new listing:
  - Rich listing builder (`listing-form-with-builder`, `create-listing-form`).
  - On first listing creation, a `tenant` is auto‑upgraded to `landlord`.

- **`/dashboard/listings/[id]`**  
  Listing detail in dashboard context:
  - Admin/ops can approve, reject, request re‑review, archive, or delete.
  - Landlords see management‑oriented view of their own listing.

- **`/dashboard/listings/[id]/edit`**  
  Edit existing listing.

- **`/dashboard/activity`**  
  Platform/user activity feed (plus `loading` state route).

- **`/dashboard/general`**  
  General account settings for the logged‑in user (profile, contact details, etc.).

- **`/dashboard/security`**  
  Security settings:
  - Change password
  - Delete account (soft‑delete with email mutation)

### Back‑Office (Internal Ops/Admin)

Top‑level route group: `app/(dashboard)/back-office/**` → URLs under `/back-office`.  
Access is restricted by `requireBackOfficeAccess` to **`admin`** and **`ops`** only.

- **`/back-office`**  
  Back‑office overview.

- **`/back-office/business-accounts`**  
  List of business accounts (e.g. agencies, corporate customers).

- **`/back-office/business-accounts/new`**  
  Create new business account.

- **`/back-office/business-accounts/[id]`**  
  Business account detail:
  - Members list, roles, status, and related listings.

- **`/back-office/business-accounts/[id]/add-member`**  
  Add team member to a business account; assigns internal role like `member`, `admin`, `owner`.

- **`/back-office/team-members`**  
  All team members view; shows each member’s role and associated business account.

- **`/back-office/listings`**  
  Platform‑wide listings view for ops/admin (not limited to a single landlord).

- **`/back-office/settings`**  
  Back‑office‑level configuration/settings for ops/admin.

### Other UI Routes

- **`/terminal`**  
  Developer‑oriented terminal page under the `(dashboard)` group; not for end‑users.

### API Routes (Internal, Server‑Side)

All under `/api/**`, used by the UI and not typically called directly by end‑users:

- **Listings**
  - `/api/listings` (GET/POST for listings; POST auto‑upgrades tenant → landlord on first creation).
  - `/api/listings/paginated`
  - `/api/listings/[id]`
  - `/api/export/listings` (CSV/Excel export for admin/ops).

- **Contact Numbers**
  - `/api/contact-numbers`
  - `/api/contact-numbers/[id]`

- **Business Accounts**
  - `/api/business-accounts`
  - `/api/business-accounts/[id]/members`
  - `/api/business-accounts/[id]/members/[memberId]`

- **User**
  - `/api/user` (current user info; also pre‑seeded via SWR fallback in `RootLayout`).

- **Upload**
  - `/api/upload` (likely for property photos/documents).

---

## Page & Route Hierarchy

### Top‑Level (App Router)

- `/`  
  - Home (marketing + CTAs)
- `/listings`  
  - `/listings/[id]`
    - Contact owner (phone/WhatsApp) visible to all visitors
- `/list-your-property`
- Auth group `(login)` (URL paths as shown above)
  - `/sign-in`
  - `/sign-up`
  - `/forgot-password`
  - `/reset-password`
- Dashboard group `(dashboard)`
  - `/dashboard`
    - `/dashboard/listings`
      - `/dashboard/listings/new`
      - `/dashboard/listings/[id]`
        - `/dashboard/listings/[id]/edit`
    - `/dashboard/activity`
    - `/dashboard/general`
    - `/dashboard/security`
  - `/back-office`
    - `/back-office/business-accounts`
      - `/back-office/business-accounts/new`
      - `/back-office/business-accounts/[id]`
        - `/back-office/business-accounts/[id]/add-member`
    - `/back-office/team-members`
    - `/back-office/listings`
    - `/back-office/settings`
  - `/terminal`
- System routes
  - `/not-found`
  - `robots.txt` (`app/robots.ts`)
  - `sitemap.xml` (`app/sitemap.ts`)

---

## User Roles

### Core User Roles (`user_role` enum)

- **`tenant`**
  - Default role for regular renters.
  - Can browse and filter listings, view listing details, and contact landlords directly via phone/WhatsApp.
  - Redirected to **`/listings`** after sign‑in/sign‑up.

- **`landlord`**
  - For individual property owners.
  - Full access to **`/dashboard`** and its child routes to manage their own listings.
  - Created either at sign‑up (choosing landlord role) or when a `tenant` creates their first listing (auto‑upgrade).
  - Redirected to **`/dashboard`** after sign‑up if role is `landlord`.

- **`ops`**
  - Internal operations team.
  - Has access to:
    - Landlord dashboard features (`/dashboard/**`)
    - Back‑office (`/back-office/**`) via `requireBackOfficeAccess`
    - Admin‑like controls on listings (approve/reject, create on behalf of others, verify visits, etc.).
  - Redirected to **`/dashboard`** on login.

- **`admin`**
  - Top‑level platform administrator.
  - Same as `ops` plus full admin capabilities:
    - Export routes (`/api/export/**`)
    - Manage any listing, landlord, or business account.
  - Redirected to **`/dashboard`** on login.

### Business Account Team Member Roles

Inside a **business account**, members have a separate role field (string, default `'member'`, with common values like `owner`, `admin`, `member`):

- **`owner`**  
  Primary contact/owner of the business account.
- **`admin`**  
  Manages team members and listings within that business account.
- **`member`**  
  Regular team member; can work with assigned listings.

These are **scoped to a specific business account** and are **in addition to** the global `user_role` (`tenant/landlord/ops/admin`).

---

## Which Page Is For Which User Type

- **Everyone (including not logged‑in)**
  - `/` – marketing and education.
  - `/listings`, `/listings/[id]` – browse properties and view details.

- **Tenants**
  - `/listings`, `/listings/[id]` – primary usage.
  - Can sign up/sign in via `/sign-up` and `/sign-in`.
  - Can later become `landlord` by listing a property.

- **Landlords**
  - `/list-your-property` – entry point.
  - `/dashboard`, `/dashboard/listings`, `/dashboard/general`, `/dashboard/security` – daily management.
  - `/dashboard/listings/new` and `/dashboard/listings/[id]/edit` – create and manage listings.

- **Ops/Admin**
  - All landlord dashboard pages above **plus**:
    - `/back-office/**` – business accounts, team members, internal listings, back‑office settings.
    - Admin/ops‑only actions on listings, exports, and user management.

---

## How to Test (Manual QA on Hosted Environment)

This section is written for a **software tester** running manual tests against the **deployed app** (e.g. `https://stay-rental-supabase-...vercel.app`).  
Use it as a **scenario guide**: each flow describes user goal, starting URL, steps, and key assertions.

> **Note**: Where specific emails/passwords are not known on the hosted environment, treat credentials as “any valid user of that role” and focus on behaviour and navigation, not exact data.

### 1. Public Renter Journey (Not Logged In)

- **Goal**: A new renter discovers the product, understands the value, and browses listings.
- **Start**: Home page `/`.
- **Steps**:
  1. Verify hero section text explains *verified mid‑to‑long‑term rentals in Sri Lanka* and primary CTAs exist for “Browse Listings” and “List Your Property”.
  2. Click **Browse Listings** and confirm navigation to `/listings`.
  3. On `/listings`, check that:
     - A search bar and basic filters are visible.
     - At least one listing card is shown (or a clear empty state).
  4. Apply filters (e.g. city, min/max price, bedrooms, property type) and verify:
     - URL query string updates (e.g. `?city=Colombo&minPrice=...`).
     - Listings update to reflect the filters (or a clear “no results” message shows).
  5. Open a listing detail by clicking a card; confirm navigation to `/listings/[id]`.
- **Key assertions**:
  - No login is required for viewing listings.
  - Filters are reflected in both the UI and the URL.
  - Listing detail shows key fields: title, address/city, rent, bedrooms, and badges for verified/visited if applicable.

### 2. Auth Journeys

#### 2.1 Sign‑up as Tenant

- **Goal**: A renter signs up and lands on the correct page.
- **Start**: `/sign-up` (via footer or “Create Account” CTA).
- **Steps**:
  1. Submit the form with an **invalid email** and **short password**; verify validation messages.
  2. Submit with a valid email/password; if a role selector is present, leave as default (tenant).
  3. After successful sign‑up, verify redirect to `/listings`.
- **Key assertions**:
  - Client‑side and/or server‑side validation errors are user‑friendly.
  - On success, user appears logged in (e.g. user menu / avatar visible).
  - Redirect is to **`/listings`** for tenant role.

#### 2.2 Sign‑up as Landlord

- **Goal**: A landlord signs up and gets into dashboard.
- **Start**: `/sign-up`.
- **Steps**:
  1. Choose role **landlord** (if exposed) and submit valid credentials.
  2. Confirm redirect to `/dashboard`.
  3. Verify sidebar navigation items for landlords (Overview, Listings, Saved Alerts, Settings, Security).
- **Key assertions**:
  - Landlord accounts land in **dashboard**, not listings.
  - Dashboard layout and navigation are visible and usable.

#### 2.3 Sign‑in

- **Goal**: Existing users of different roles are redirected correctly.
- **Start**: `/sign-in`.
- **Steps**:
  1. Attempt login with wrong password; verify generic “invalid email or password” message (no user enumeration).
  2. Login as a **tenant** → must land on `/listings`.
  3. Login as a **landlord** → must land on `/dashboard`.
  4. Login as **ops/admin** (if such accounts exist on the hosted env) → must land on `/dashboard`.
- **Key assertions**:
  - Error handling is secure and generic.
  - Redirect rules match role:
    - tenant → `/listings`
    - landlord / ops / admin → `/dashboard`

#### 2.4 Forgot / Reset Password

- **Goal**: User can recover access without leaking whether an email exists.
- **Start**: `/forgot-password`.
- **Steps**:
  1. Submit an email that is **unlikely** to exist; verify the same generic success message is shown as for a valid email.
  2. Submit a known valid email (if available).
  3. Follow the reset link (from email or QA tool) to `/reset-password?token=...`.
  4. Enter mismatched new/confirm passwords; verify clear validation error.
  5. Enter matching new/confirm passwords; verify success and ability to log in with the new password.
- **Key assertions**:
  - Generic messaging prevents account enumeration.
  - Token errors (expired/invalid) surface a clear “link invalid or expired” message.

### 3. Tenant Functional Flows (Logged In as Tenant)

- **Goal**: Tenant can search, inspect, and express interest in properties.
- **Start**: Logged in as **tenant**, on `/listings`.
- **Steps**:
  1. Adjust filters and confirm:
     - Counts and listing cards update.
     - Filter chips (if any) show active filters.
  2. Open `/listings/[id]` and:
     - Verify property meta (type, beds, baths, city, rent, resilience fields).
     - Check that any “Request viewing” or contact actions behave as expected (form opens, validates, and submits).
  3. Navigate back to `/` via logo; ensure top‑level navigation still reflects logged‑in state.
- **Key assertions**:
  - Tenant has **no access** to `/dashboard` (unless promoted to landlord).
  - Contact details (phone/WhatsApp) are visible to visitors on listing pages.

### 4. Landlord Flows (Own Listings)

Assume testing with a **landlord** user on the hosted environment.

#### 4.1 Create First Listing (Tenant → Landlord Upgrade)

- **Goal**: A tenant who lists a property is upgraded to landlord and gains dashboard access.
- **Start**: Logged in as tenant; go to `/list-your-property`.
- **Steps**:
  1. Follow prompts into the listing creation flow (which routes into `/dashboard/listings/new`).
  2. Fill mandatory fields: title, address, city, bedrooms, rent, at least one contact number, etc.
  3. Submit and ensure:
     - Creation succeeds (no server validation errors).
     - You are redirected to a dashboard context (e.g. listings list or listing detail).
  4. Try visiting `/dashboard`; it should now be accessible.
- **Key assertions**:
  - Before first listing, tenant has no dashboard.
  - After first listing creation, role behaves like landlord (dashboard visible).

#### 4.2 Manage Listings

- **Goal**: Landlord can see and manage own listings from dashboard.
- **Start**: Logged in as landlord, on `/dashboard/listings`.
- **Steps**:
  1. Confirm the list shows only that user’s listings (unless logged in as ops/admin).
  2. Use actions on a listing (e.g. **Edit**, **Archive**, etc. depending on what is exposed to landlords only).
  3. Open `/dashboard/listings/[id]/edit`, change a user‑visible field (e.g. title or rent), save, then:
     - Confirm success toast or message.
     - Visit the public `/listings/[id]` page and verify the updated field is visible.
- **Key assertions**:
  - Changes made in dashboard are reflected on the public listing view.
  - Unauthorized admin‑only actions (approve/reject) are **not** visible to a plain landlord.

### 5. Ops/Admin Flows (Back‑Office)

These flows assume access to an **ops** or **admin** user on the hosted environment.

#### 5.1 Back‑Office Access Control

- **Goal**: Only ops/admin can access `/back-office/**`.
- **Steps**:
  1. Log in as a **tenant** or **landlord** and try to open `/back-office`.
     - Expect redirect to `/sign-in` or `/dashboard` with no back‑office UI.
  2. Log in as **ops/admin** and open `/back-office`.
     - Expect a dedicated layout and sidebar for back‑office.
- **Key assertions**:
  - Non‑ops/admin users cannot see or navigate to back‑office pages.
  - Ops/admin see consistent back‑office navigation (Overview, Business Accounts, Team Members, Listings, Settings).

#### 5.2 Business Accounts & Team Members

- **Goal**: Ops/admin can manage business accounts and members.
- **Start**: `/back-office/business-accounts`.
- **Steps**:
  1. From `/back-office/business-accounts`, create a **new business account** using realistic data.
  2. Open the account detail page `/back-office/business-accounts/[id]` and verify:
     - Account name, status, and metadata are correct.
     - Members section initially empty or showing defaults.
  3. Click **Add Member** and go to `/back-office/business-accounts/[id]/add-member`.
  4. Add a member with role `member` or `admin` and save.
  5. Confirm:
     - Member appears in the business account detail page.
     - Member appears in `/back-office/team-members` with correct role and account association.
- **Key assertions**:
  - Required fields validate correctly when blank/invalid.
  - Role dropdown and help text make sense to a non‑technical user.

#### 5.3 Back‑Office Listings & Exports

- **Goal**: Ops/admin can see platform‑wide listings and perform exports.
- **Start**: `/back-office/listings`.
- **Steps**:
  1. Verify that listings from multiple landlords/business accounts appear (if data exists).
  2. From dashboard or back‑office (wherever exports are exposed), trigger **Export Listings**.
  3. Confirm browser downloads a file or shows a URL that returns structured data.
- **Key assertions**:
  - Exports are restricted to ops/admin.
  - Exported data fields roughly match what’s visible in the UI (no sensitive secrets).

### 6. Security & Account Management

- **Goal**: Users can manage their own security settings safely.
- **Start**: Logged in as any role; navigate to `/dashboard/security`.
- **Steps**:
  1. **Change password**:
     - Enter wrong current password, verify error.
     - Enter same value for current and new password, verify error.
     - Enter a valid new password and confirm; verify success and ability to re‑login with the new password.
  2. **Delete account**:
     - Attempt delete with wrong password, verify error.
     - Delete with correct password; confirm:
       - You are logged out / redirected to sign‑in with a query like `?deleted=true`.
       - Subsequent login with that email fails (if you can safely test this on the hosted environment).
- **Key assertions**:
  - All validation errors are clear and non‑technical.
  - Account deletion leads to a clean logged‑out state with no dashboard access.

### 7. General UX & Non‑Functional Checks

- **Responsiveness**:
  - Test in mobile, tablet, and desktop widths.
  - Pay attention to sidebar behaviour in dashboard/back‑office (hamburger menu, overlay).
- **Error Handling**:
  - Force server errors where possible (e.g. missing required fields) and ensure friendly messages.
  - Check 404 by visiting a random `/listings/does-not-exist` URL; expect custom not‑found page.
- **Consistency**:
  - Verify that the same listing data (title, rent, status badges) looks consistent across:
    - `/listings`
    - `/listings/[id]`
    - `/dashboard/listings`
    - `/back-office/listings` (for ops/admin)

---

## Etc. (Tech Stack & Design Notes)

- **Tech stack**
  - Next.js App Router, React, TypeScript
  - Drizzle ORM + Postgres
  - SWR for data fetching (`/api/user` is pre‑loaded in `RootLayout`)
  - Tailwind CSS + custom components + lucide icons

- **Design intentions**
  - Strong focus on **trust and verification** (Verification for landlords, verified/visited listing flags).
  - Separation of concerns:
    - Public marketplace
    - Landlord self‑service dashboard
    - Internal back‑office for ops/admin
  - Clear role‑based redirects and access control at both UI and API layers.

