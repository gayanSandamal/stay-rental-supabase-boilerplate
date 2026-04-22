# Easy Rent - Complete Application Manual

> This document is the single source of truth for understanding Easy Rent — its features, user roles, credentials, API endpoints, database schema, listing lifecycle, and permission model. Written for humans and AI agents alike.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack & Architecture](#tech-stack--architecture)
3. [Test Credentials (Seed Users)](#test-credentials-seed-users)
4. [User Roles & Permissions Matrix](#user-roles--permissions-matrix)
5. [Getting Started](#getting-started)
6. [For Tenants (Renters)](#for-tenants-renters)
7. [For Landlords](#for-landlords)
8. [For Operations Team](#for-operations-team)
9. [For Admins](#for-admins)
10. [Plans & Pricing](#plans--pricing)
11. [Visibility Add-Ons & Bundles](#visibility-add-ons--bundles)
12. [Listing Lifecycle & Status Transitions](#listing-lifecycle--status-transitions)
13. [Database Schema Reference](#database-schema-reference)
14. [API Endpoints Reference](#api-endpoints-reference)
15. [Authentication & Authorization](#authentication--authorization)
16. [Notification System](#notification-system)
17. [Saved Searches & Alerts](#saved-searches--alerts)
18. [Image Upload System](#image-upload-system)
19. [Contact Number Management](#contact-number-management)
20. [Search Ranking Algorithm](#search-ranking-algorithm)
21. [Key Features](#key-features)
22. [Navigation Guide](#navigation-guide)
23. [Troubleshooting](#troubleshooting)

---

## Overview

Easy Rent is a mid-to-long-term (1–12+ months) house rental platform built specifically for Sri Lanka. The platform focuses on verified listings, Sri Lanka-specific features (power backup, water source, fiber internet), direct landlord-tenant contact, and affordable pricing.

**Key differentiators:**
- Every listing verified by ops team (identity + optional property visit)
- Sri Lanka-specific filters: power backup, water source, fiber ISP
- Direct contact via phone & WhatsApp (no middlemen, no booking fees)
- Free to list, paid visibility add-ons (Boost, Featured, Urgent)
- Tenant Premium tier for early access and exclusive listings

---

## Tech Stack & Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15+ (App Router, Server Components) |
| Language | TypeScript |
| Database | PostgreSQL (Supabase-hosted) |
| ORM | Drizzle ORM |
| Auth | Supabase Auth (email/password, PKCE flow, SSR cookies) |
| Storage | Supabase Storage (bucket: `stay-rental-images`) |
| Email | Resend |
| Hosting | Vercel |
| Styling | Tailwind CSS + shadcn/ui |

**Key directories:**
- `app/` — Next.js App Router pages and API routes
- `lib/db/schema.ts` — Drizzle schema (all tables, enums, relations)
- `lib/db/seed.ts` — Foundational seed data (4 test users)
- `lib/db/seed-sample-data.ts` — Comprehensive sample data (~1300 records)
- `lib/auth/` — Auth utilities, middleware helpers
- `lib/supabase/` — Supabase client setup (server, browser, admin)
- `components/` — Shared UI components
- `middleware.ts` — Route protection (protects `/dashboard/*`)

---

## Test Credentials (Seed Users)

These accounts are created by the seed script (`lib/db/seed.ts`). Use them for testing and development.

### Admin Account

| Field | Value |
|-------|-------|
| Email | `admin@easyrent.com` |
| Password | `admin123` |
| Role | `admin` |
| Access | Dashboard + Back-Office (full system access) |
| Sign-in redirect | `/dashboard` |

### Operations (Ops) Account

| Field | Value |
|-------|-------|
| Email | `ops@easyrent.com` |
| Password | `ops123` |
| Role | `ops` |
| Access | Dashboard + Back-Office (verify listings, manage business accounts, team members) |
| Sign-in redirect | `/dashboard` |

### Tenant Account

| Field | Value |
|-------|-------|
| Email | `tenant@test.com` |
| Password | `tenant123` |
| Role | `tenant` |
| Access | Browse listings, save searches, contact landlords |
| Sign-in redirect | `/listings` |

### Landlord Account

| Field | Value |
|-------|-------|
| Email | `landlord@test.com` |
| Password | `landlord123` |
| Role | `landlord` |
| NIC | `123456789V` |
| Access | Dashboard (create/manage own listings) |
| Sign-in redirect | `/dashboard` |

### Sample Data (Optional)

Running `seed-sample-data.ts` creates ~1300 additional records:
- 75 users (40 tenants, 25 landlords, 8 ops, 2 admin)
- 25 landlord records with random KYC status
- 10 business accounts (e.g., Island Properties, Lanka Real Estate Group)
- 25 business account members (owner/admin/member roles)
- ~120 contact numbers
- 400 listings across various statuses, locations, and property types
- 50 saved searches
- 100 audit logs

### Seeding Commands

```bash
# Reset database and seed foundational users
pnpm db:seed

# Seed sample data (optional, for development/testing)
pnpm db:seed-sample
```

---

## User Roles & Permissions Matrix

### Roles

| Role | DB Value | Description |
|------|----------|-------------|
| Tenant | `tenant` | Default role. Browse listings, contact landlords, save search alerts, upgrade to Premium |
| Landlord | `landlord` | Create and manage property listings, purchase visibility add-ons |
| Ops | `ops` | Verify listings, manage business accounts, publish properties, manage team members |
| Admin | `admin` | Full system access — everything Ops can do plus user management and settings |

**Business Account Member Roles** (separate from user roles):
- `owner` — Full control over business account
- `admin` — Manage account and members
- `member` — Basic access to business account resources

### Permissions Matrix

| Action | Tenant | Landlord | Ops | Admin |
|--------|--------|----------|-----|-------|
| Browse/search public listings | Yes | Yes | Yes | Yes |
| View listing detail page | Yes | Yes | Yes | Yes |
| Contact landlord (phone/WhatsApp) | Yes | Yes | Yes | Yes |
| Save search alerts (3 max free) | Yes | Yes | Yes | Yes |
| Upgrade to Premium | Yes | No | No | No |
| Create listing | No* | Yes | Yes | Yes |
| Edit own listings | No | Yes | Yes | Yes |
| Edit any listing | No | No | Yes | Yes |
| Change listing status | No | Archive own only | Yes | Yes |
| Verify listing | No | No | Yes | Yes |
| Mark listing as visited | No | No | Yes | Yes |
| Reject listing (with reason) | No | No | Yes | Yes |
| Activate Boost/Featured/Urgent | No | No | Yes | Yes |
| Activate bundle | No | No | Yes | Yes |
| Bulk renew listings | No | No | Yes | Yes |
| Access Dashboard (`/dashboard`) | Yes** | Yes | Yes | Yes |
| Access Back-Office (`/back-office`) | No | No | Yes | Yes |
| Create business accounts | No | No | Yes | Yes |
| Add/remove team members | No | No | Yes | Yes |
| Search users by email | No | No | Yes | Yes |
| Set custom profile URL | No | Pro+ plans | No | No |
| Export listings CSV | No | No | Yes | Yes |
| View audit logs | No | No | Yes | Yes |

> \* Tenants are auto-upgraded to `landlord` role upon creating their first listing.
> \*\* Tenants can access `/dashboard` but primarily use `/listings` for browsing.

### Route Protection Summary

| Route Pattern | Required Role | Redirect if Unauthorized |
|---------------|---------------|--------------------------|
| `/` | Public | — |
| `/listings` | Public | — |
| `/listings/[id]` | Public (if listing is active) | — |
| `/list-your-property` | Public | — |
| `/how-to-use` | Public | — |
| `/sign-in`, `/sign-up` | Public | — |
| `/privacy-policy`, `/terms-of-service` | Public | — |
| `/dashboard/*` | Any authenticated user | → `/sign-in` |
| `/back-office/*` | `admin` or `ops` only | → `/sign-in` (unauthenticated) or → `/dashboard` (wrong role) |

---

## Getting Started

### Accessing the Application

Open your web browser and navigate to the Easy Rent URL. The homepage shows a search bar, featured listings, pricing plans, and quick links.

### Creating an Account

1. Click **"Sign Up"** in the top-right corner (or navigate to `/sign-up`)
2. Enter your **email** and **password** (minimum 8 characters)
3. Click **"Sign up"**
4. You'll be redirected to `/sign-in?signed_up=1` with a success banner
5. Sign in with your new credentials
6. Role-based redirect:
   - **Tenants** → `/listings`
   - **Landlords** → `/dashboard`
   - **Ops/Admin** → `/dashboard`
7. Check your email for a verification link — an `EmailUnverifiedBanner` appears until verified

### Signing In

1. Click **"Sign In"** (or navigate to `/sign-in`)
2. Enter email and password
3. Click **"Sign in"**
4. Redirected based on role (see above)

### Forgot Password

1. Click **"Forgot your password?"** on the sign-in page
2. Enter your email
3. Check email for reset link
4. Set new password on the reset page (`/reset-password`)

### Account Management

From Dashboard → Settings (`/dashboard/general`):
- Update name and email

From Dashboard → Security (`/dashboard/security`):
- Change password (validates current password first)
- Delete account (soft-delete: sets `deletedAt`, renames email)

---

## For Tenants (Renters)

### Browsing Listings

1. Click **"Browse All Listings"** on the homepage, or navigate to `/listings`
2. Use the **search bar** to search by city, area, or district
3. Popular quick-search buttons: Colombo 3, Nugegoda, Kandy, Galle, Negombo, Battaramulla

### Filtering Listings

The platform offers 30+ filters:

**Basic Filters:**
- Property type: House, Apartment, Room
- City and District
- Bedrooms (number), Bathrooms (number)
- Min/max area (sq ft)

**Pricing Filters:**
- Min/max monthly rent (LKR)
- Deposit months
- Utilities included (boolean)
- Max service charge (LKR)

**Sri Lanka-Specific Filters:**
- Power backup: Generator, Solar, UPS, None
- Water source: Mains, Tank, Borehole, Mains + Tank, Mains + Borehole
- Min water tank size (liters)
- Fiber internet available (boolean)
- Fiber ISP

**Climate & Comfort Filters:**
- Min AC units
- Min fans
- Ventilation quality: Excellent, Good, Fair, Poor

**Security Filters:**
- Gated community, Security guard, CCTV, Burglar bars (all boolean)

**Additional Filters:**
- Parking available, Min parking spaces
- Pets allowed
- Max notice period (days)
- Verified only, Visited only (trust filters)

### Viewing Listing Details

Click any listing card to see the full detail page (`/listings/[id]`):

- **Photo gallery** — up to 6 property photos
- **Property details** — type, bedrooms, bathrooms, area
- **Location** — address, city, district
- **Pricing** — monthly rent, deposit, service charge, utilities, notice period
- **Sri Lanka-specific** — power backup, water source & tank size, fiber & ISPs
- **Climate & comfort** — AC units, fans, ventilation
- **Security** — gated community, guard, CCTV, burglar bars
- **Additional** — parking spaces, pets allowed
- **Verification badges** — verified (green), visited, with dates
- **Publisher info** — individual landlord or business account name
- **Visibility badges** — Featured, Boosted, Urgent, Exclusive (if applicable)
- **Contact sidebar** — phone numbers and WhatsApp links

### Contacting Landlords

1. On the listing detail page, find the **contact section** in the sidebar
2. Verified phone number(s) and WhatsApp links are displayed
3. **Call** or **WhatsApp** the landlord directly — **no sign-in required**
4. Verified contacts shown first; only platform-verified numbers displayed

### Saving Search Alerts

1. Sign in (or create a free account)
2. Set your filters on the listings page
3. Save the search — you'll be notified via email when new matches appear
4. **Free plan**: up to 3 saved alerts
5. **Premium plan**: unlimited saved alerts
6. Alerts check for new listings every 6 hours (cron job)

### Premium Plan for Renters

Upgrade to Premium for **LKR 300/month**:
- **24-hour early access** to new listings (free users see listings with a 24h delay)
- **Unlimited saved alerts** (vs 3 on Free)
- **Exclusive listings** — access properties marked "Premium renters only"
- Exclusive listings sorted first in search results

### How to Use Guide

Visit `/how-to-use` for an interactive step-by-step guide:
- **For Renters** (5 steps): Find → View → Contact → Save Alerts → Go Premium
- **For Landlords** (6 steps): Sign Up → Add Property → Verification → Manage → Get Contacted → Boost Visibility

---

## For Landlords

### Listing Your Property

1. **Create an account** — Sign up at `/sign-up` (tenants auto-upgrade to landlord on first listing)
2. **Go to Dashboard** — `/dashboard`
3. **Create a new listing** — click **"New Listing"** and fill in the form:

#### Listing Form Fields

**Basic Information (required):**
- Title (10–200 chars) — e.g., "Modern 2BR Apartment in Colombo 7"
- Description (textarea)
- Property Type: House, Apartment, or Room

**Property Details:**
- Bedrooms (required, min 1)
- Bathrooms
- Area in sq ft (House/Apartment only)

**Location (required):**
- Address
- City (default: "Colombo")
- District (optional)

**Pricing & Terms:**
- Monthly Rent in LKR (required)
- Deposit in months (default: 3)
- Service Charge in LKR/month (Apartment only)
- Utilities Included (checkbox, default: false)
- Notice Period in days (default: 30)

**Utilities & Infrastructure:**
- Power Backup: None, Generator, Solar, UPS
- Water Source: Mains, Tank, Borehole, Mains + Tank, Mains + Borehole
- Water Tank Size in liters (shown if water source includes "tank")
- Fiber Internet Available (checkbox)
- Fiber ISPs comma-separated (shown if fiber = true)

**Climate & Comfort:**
- AC Units (count)
- Fans (count)
- Ventilation: Excellent, Good, Fair, Poor

**Security Features (House/Apartment only):**
- Gated Community, Security Guard, CCTV, Burglar Bars (all checkboxes)

**Additional Features:**
- Parking Available (checkbox)
- Parking Spaces (shown if parking = true)
- Pets Allowed (checkbox)

**Photos:**
- Upload up to 6 images (max 5MB each, auto-compressed)

**Listing Visibility:**
- Exclusive Listing (checkbox) — only visible to Premium subscribers

**Contact Information (required):**
- Select at least one contact number to display on the listing

4. **Submit** — Listing goes to `pending` status
5. **Verification** — Ops team reviews, optionally visits, then publishes
6. **Active** — Listing goes live, tenants can contact you directly
7. **Expires** — After 30 days, listing expires. Renew to keep it active

### Managing Your Listings

From Dashboard → Listings (`/dashboard/listings`):
- View all listings with status (Pending, Active, Rented, Archived, Rejected, Expired)
- Edit listing details
- Renew expired listings
- Archive listings you no longer need
- Re-request review for rejected listings

### Business Accounts (For Agencies)

- Manage multiple properties under one business account
- Add team members with roles (owner, admin, member)
- Ideal for agencies and portfolio landlords
- Created by ops/admin team

### List Your Property Landing Page

Visit `/list-your-property` for a dedicated page explaining benefits:
- Direct tenant contact
- Property visit badge (trust signal)
- Ops support for verification
- 30-day active listings
- Verified contact numbers
- Business accounts for agencies

---

## For Operations Team

### Accessing the Back-Office

1. Sign in with `ops@easyrent.com` / `ops123` (or any ops/admin account)
2. Navigate to `/back-office`

### Back-Office Sidebar

| Menu Item | URL | Description |
|-----------|-----|-------------|
| Overview | `/back-office` | Dashboard home |
| Business Accounts | `/back-office/business-accounts` | Manage agencies |
| Team Members | `/back-office/team-members` | Manage team members |
| Listings | `/back-office/listings` | Manage ALL platform listings |
| Settings | `/back-office/settings` | Configuration |

### Managing Listings

At `/back-office/listings`:

1. **View all listings** with status filters: Pending, Active, Rented, Archived, Rejected, Expired
2. **Actions on each listing:**
   - **Edit** — modify any listing details
   - **View** — preview the public listing page
   - **Verify** — mark as verified (sets `verifiedAt`, `verifiedBy`)
   - **Mark as Visited** — record property visit (sets `visitedAt`, `visitedBy`)
   - **Change Status** — transition between statuses
   - **Reject** — reject with a reason (`rejectionReason` field)
   - **Boost** — activate Boost add-on (LKR 250/7 days, sets `boostedUntil`)
   - **Feature** — activate Featured add-on (LKR 500/7 days, sets `featuredUntil`, limited 1 per landlord)
   - **Mark Urgent** — activate Urgent add-on (LKR 150/7 days, sets `urgentUntil`)
   - **Activate Bundle** — apply bundle packages
3. **Create new listing** on behalf of a landlord
4. **Bulk renew** listings via `/api/listings/bulk-renew`
5. **Export listings** as CSV via `/api/export/listings`

### Verification Process

1. Review listing details, photos, and landlord information
2. Verify landlord identity (NIC) and ownership documents
3. Optionally schedule and complete physical property visit
4. Mark listing as **verified** → green badge appears publicly
5. Set **visited date** if property was visited → "Visited" badge appears
6. Change status to `active` to publish (sets `publishedAt`, calculates `expiresAt` = publishedAt + 30 days)

### Managing Business Accounts

At `/back-office/business-accounts`:
- View all business accounts
- Create new business accounts
- Edit account details
- Navigate to `/back-office/business-accounts/[id]` to view a specific account
- Add team members via `/back-office/business-accounts/[id]/add-member`
- Remove team members

### Managing Team Members

At `/back-office/team-members`:
- View all team members across all business accounts
- Manage member roles (owner, admin, member)

### Staleness Management

- **30–45 Days** — Reminder to contact landlord about listing status
- **60 Days** — Listing auto-hidden if not updated
- **Before Reactivating** — Re-verify the listing

---

## For Admins

Admins have **full system access** — everything Ops can do, plus:

- Full user management (search users by email via API)
- System settings and configuration
- Access all Dashboard and Back-Office features
- Manage all roles and permissions

### Admin Access Points

- **Dashboard** (`/dashboard`) — Overview, Listings, Analytics, Saved Alerts, Settings, Security
- **Back-Office** (`/back-office`) — Business Accounts, Team Members, All Listings, Settings

---

## Plans & Pricing

### Renter Plans

| Feature | Free (LKR 0) | Premium (LKR 300/mo) |
|---------|---------------|----------------------|
| Browse all verified listings | Yes | Yes |
| View full property details | Yes | Yes |
| Contact landlords directly | Yes | Yes |
| Saved alerts | Up to 3 | Unlimited |
| Early access (24h head start) | No | Yes |
| Exclusive listings access | No | Yes |

### Landlord Plans

| Feature | Free (LKR 0) | Starter (LKR 900/mo) | Pro (LKR 2,500/mo) | Agency (LKR 5,000/mo) |
|---------|---------------|----------------------|---------------------|----------------------|
| Unlimited active listings | Yes | Yes | Yes | Yes |
| Direct contact (Phone & WhatsApp) | Yes | Yes | Yes | Yes |
| Listed on Easy Rent | Yes | Yes | Yes | Yes |
| Free Boosts per month | 0 | 1 | 3 | 6 |
| Higher visibility | No | Yes | Yes | Yes |
| Renewal reminders | No | Yes | Yes | Yes |
| Featured priority | No | No | Yes | Yes |
| Listing performance insights | No | No | Yes | Yes |
| Faster approval | No | No | Yes | Yes |
| Custom profile URL | No | No | Yes (one-time) | Yes (one-time) |
| Agency badge | No | No | No | Yes |
| Team support | No | No | No | Yes |
| Bulk renewals | No | No | No | Yes |
| Priority support | No | No | No | Yes |

### Subscription Fields in Database

- `users.subscriptionTier` — `'free'` (default) or `'premium'` (for renters)
- `users.subscriptionExpiresAt` — expiration timestamp
- `landlords.landlordPlanTier` — `'free'` (default) for landlord plans
- `landlords.landlordPlanExpiresAt` — expiration timestamp
- `landlords.boostsUsedThisMonth` — tracks monthly boost usage

---

## Visibility Add-Ons & Bundles

### Add-Ons (Pay Per Use)

| Add-On | Price | Duration | DB Field | Effect |
|--------|-------|----------|----------|--------|
| **Boost** | LKR 250 | 7 days | `boostedUntil` | Improved ranking in search results |
| **Featured** | LKR 500 | 7 days | `featuredUntil` | Top placement + Featured badge (limit: 1 per landlord) |
| **Urgent** | LKR 150 | 7 days | `urgentUntil` | Urgent badge for quick action |

### Bundles (Discounted Combos)

| Bundle | Price | Includes | API `bundleType` |
|--------|-------|----------|------------------|
| **Quick Results Pack** | LKR 350 | Boost + Urgent (7 days each) | `quick_results` |
| **Priority Exposure Pack** | LKR 650 | Featured + Urgent (7 days each) | `priority_exposure` |
| **Landlord Starter Bundle** | LKR 1,000 | Starter plan (30 days) + 1 Boost | `starter` |

### How to Activate

1. Landlord pays ops team (outside the platform)
2. Ops/Admin navigates to the listing in Back-Office
3. Clicks the appropriate action button (Boost, Feature, Urgent, or Bundle)
4. System sets the corresponding `*Until` timestamp
5. Add-on becomes active immediately and expires automatically

---

## Listing Lifecycle & Status Transitions

### Statuses

| Status | DB Value | Description |
|--------|----------|-------------|
| Pending | `pending` | Just created, awaiting ops verification |
| Active | `active` | Verified and published, visible to public |
| Rented | `rented` | Tenant found, hidden from public |
| Archived | `archived` | Manually archived by landlord |
| Rejected | `rejected` | Failed verification (has `rejectionReason`) |
| Expired | `expired` | 30 days since `publishedAt`, auto-expired |

### Status Transition Rules

```
                    ┌─────────┐
        ┌──────────►│ rejected │◄─────────────────┐
        │           └────┬─────┘                   │
        │                │ re-request review        │ reject
        │                ▼                          │
   ┌────┴────┐     ┌─────────┐     ┌────────┐     │
   │ created │────►│ pending │────►│ active │─────┘
   └─────────┘     └─────────┘     └───┬────┘
                                       │    │
                                       │    ├──► expired (auto, 30 days)
                                       │    │
                                       ▼    ▼
                                  ┌────────┐  ┌──────────┐
                                  │ rented │  │ archived │
                                  └────────┘  └──────────┘
```

### Who Can Trigger Transitions

| Transition | Who |
|------------|-----|
| → `pending` (create) | Landlord, Ops, Admin |
| `pending` → `active` | Ops, Admin only |
| `pending` → `rejected` | Ops, Admin only |
| `rejected` → `pending` | Landlord (re-request), Ops, Admin |
| `active` → `rented` | Ops, Admin only |
| `active` → `archived` | Listing owner (landlord), Ops, Admin |
| `active` → `expired` | Automatic (30 days after `publishedAt`) |

### Key Timestamps

| Field | Set When |
|-------|----------|
| `createdAt` | Listing created |
| `publishedAt` | Status changed to `active` |
| `expiresAt` | Calculated as `publishedAt + 30 days` |
| `verifiedAt` | Ops marks as verified |
| `visitedAt` | Ops records property visit |
| `boostedUntil` | Boost activated |
| `featuredUntil` | Featured activated |
| `urgentUntil` | Urgent activated |

---

## Database Schema Reference

### Tables

| Table | Description |
|-------|-------------|
| `users` | Core user accounts (all roles) |
| `landlords` | Landlord-specific profile, KYC, plan info |
| `listings` | Property listings |
| `listing_views` | Analytics — tracks listing page views |
| `saved_searches` | Tenant saved search filters & alert config |
| `business_accounts` | Agency/team accounts |
| `business_account_members` | Team members within business accounts |
| `user_contact_numbers` | Phone numbers (linked to users or business accounts) |
| `listing_contact_numbers` | Junction: which contact numbers appear on which listing |
| `password_reset_tokens` | Password reset flow |
| `notifications` | In-app notification messages |
| `audit_logs` | Compliance/audit trail of all major actions |

### Users Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | Primary key |
| `authUserId` | uuid | Links to Supabase `auth.users` |
| `name` | varchar(100) | |
| `email` | varchar(255) | Unique, required |
| `passwordHash` | text | Nullable (legacy users only) |
| `role` | enum | `tenant`, `landlord`, `ops`, `admin` (default: `tenant`) |
| `phone` | varchar(20) | |
| `subscriptionTier` | varchar(20) | `free` (default) or `premium` |
| `subscriptionExpiresAt` | timestamp | Premium expiration |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `deletedAt` | timestamp | Soft delete |

### Landlords Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | Primary key |
| `userId` | FK → users | One-to-one |
| `nic` | text | National Identity Card number |
| `ownershipDocUrl` | text | Uploaded ownership document |
| `kycVerified` | boolean | Identity verified by ops |
| `kycVerifiedAt` | timestamp | |
| `kycVerifiedBy` | integer | Ops user ID who verified |
| `landlordPlanTier` | varchar(20) | `free` (default) |
| `landlordPlanExpiresAt` | timestamp | |
| `boostsUsedThisMonth` | integer | Tracks monthly boost usage |
| `profileSlug` | text | Custom URL (Pro+ plans) |
| `publicId` | text | Public identifier |

### Listings Table (Key Fields)

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | Primary key |
| `landlordId` | FK → landlords | Who owns this listing |
| `createdBy` | FK → users | Who created it (may differ for ops-created) |
| `title` | varchar(200) | Required, 10–200 chars |
| `description` | text | |
| `propertyType` | enum | `house`, `apartment`, `room` |
| `bedrooms` | integer | Required, min 1 |
| `bathrooms` | integer | |
| `area` | integer | Square feet |
| `address` | text | Required |
| `city` | text | Required |
| `district` | text | |
| `latitude`, `longitude` | numeric | |
| `rent` | numeric | Monthly rent in LKR, required |
| `depositMonths` | integer | Default 3 |
| `serviceCharge` | numeric | LKR/month (apartments) |
| `utilitiesIncluded` | boolean | Default false |
| `noticePeriodDays` | integer | Default 30 |
| `powerBackup` | text | none/generator/solar/ups |
| `waterSource` | text | mains/tank/borehole/combinations |
| `waterTankSize` | integer | Liters |
| `hasFiber` | boolean | |
| `fiberIsps` | text | Comma-separated |
| `acUnits` | integer | |
| `fans` | integer | |
| `ventilation` | text | excellent/good/fair/poor |
| `gated` | boolean | |
| `securityGuard` | boolean | |
| `cctv` | boolean | |
| `burglarBars` | boolean | |
| `parking` | boolean | |
| `parkingSpaces` | integer | |
| `petsAllowed` | boolean | |
| `exclusive` | boolean | Premium renters only |
| `status` | enum | `pending`, `active`, `rented`, `archived`, `rejected`, `expired` |
| `verified` | boolean | |
| `verifiedAt` | timestamp | |
| `verifiedBy` | integer | |
| `visited` | boolean | |
| `visitedAt` | timestamp | |
| `visitedBy` | integer | |
| `rejectionReason` | text | |
| `publishedAt` | timestamp | When status changed to active |
| `expiresAt` | timestamp | publishedAt + 30 days |
| `boostedUntil` | timestamp | Boost add-on expiry |
| `featuredUntil` | timestamp | Featured add-on expiry |
| `urgentUntil` | timestamp | Urgent add-on expiry |
| `images` | json | Array of image URLs |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### Key Relationships

```
users ──1:1──► landlords
landlords ──1:many──► listings
users ──1:many──► user_contact_numbers
business_accounts ──1:many──► user_contact_numbers
business_accounts ──1:many──► business_account_members
business_account_members ──many:1──► users
listings ──1:many──► listing_contact_numbers
user_contact_numbers ──1:many──► listing_contact_numbers
users ──1:many──► saved_searches
users ──1:many──► notifications
```

---

## API Endpoints Reference

### Listings

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/api/listings/paginated` | No | Public | Fetch listings with pagination and filters |
| GET | `/api/listings/[id]` | No | Public | Fetch single listing detail |
| POST | `/api/listings` | Yes | Landlord, Ops, Admin | Create new listing (auto-upgrades tenant → landlord) |
| PATCH | `/api/listings/[id]` | Yes | Owner, Ops, Admin | Update listing (status, verification, rejection) |
| POST | `/api/listings/[id]/boost` | Yes | Ops, Admin | Activate Boost (7 days) |
| POST | `/api/listings/[id]/feature` | Yes | Ops, Admin | Activate Featured (7 days, 1 per landlord) |
| POST | `/api/listings/[id]/urgent` | Yes | Ops, Admin | Activate Urgent (7 days) |
| POST | `/api/listings/[id]/bundle` | Yes | Ops, Admin | Activate bundle (quick_results, priority_exposure, starter) |
| POST | `/api/listings/[id]/view` | No | Public | Record listing view (rate-limited by IP) |
| POST | `/api/listings/bulk-renew` | Yes | Ops, Admin | Bulk renew multiple listings |
| GET | `/api/export/listings` | Yes | Ops, Admin | Export listings as CSV |

### Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Yes | Get user's notifications (paginated, max 100) |
| PATCH | `/api/notifications` | Yes | Mark all notifications as read |
| PATCH | `/api/notifications/[id]/read` | Yes | Mark single notification as read |

### Saved Searches

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/saved-searches` | Yes | Get user's saved searches |
| POST | `/api/saved-searches` | Yes | Create saved search (enforces 3 limit for free users) |
| GET | `/api/saved-searches/[id]` | Yes | Get single saved search |
| DELETE | `/api/saved-searches/[id]` | Yes | Delete saved search |

### Contact Numbers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/contact-numbers` | Yes | List user's contact numbers (own + business account) |
| POST | `/api/contact-numbers` | Yes | Create contact number (for user or business account) |
| PUT | `/api/contact-numbers/[id]` | Yes | Update contact number (validates ownership) |
| DELETE | `/api/contact-numbers/[id]` | Yes | Soft-delete (sets `isActive=false`) |

### Business Accounts

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/api/business-accounts` | Yes | Ops, Admin | List all business accounts |
| POST | `/api/business-accounts` | Yes | Ops, Admin | Create business account |
| GET | `/api/business-accounts/[id]` | Yes | Ops, Admin | Get account details |
| GET | `/api/business-accounts/[id]/members` | Yes | Ops, Admin | List team members |
| POST | `/api/business-accounts/[id]/members` | Yes | Ops, Admin | Add team member |
| DELETE | `/api/business-accounts/[id]/members/[memberId]` | Yes | Ops, Admin | Remove team member |

### Users & Landlords

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user` | Yes | Get current user (email param requires Ops/Admin) |
| GET | `/api/landlords/[id]` | Yes | Get landlord profile |
| GET | `/api/landlords/me/profile-slug` | Yes | Get own profile slug info |
| PATCH | `/api/landlords/me/profile-slug` | Yes | Set custom profile URL (Pro+ only, one-time) |

### Other

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/upload` | Yes | Upload images (max 6, 5MB each, rate-limited) |
| GET | `/api/search/suggestions` | No | Location/property type suggestions |
| GET | `/api/cron/saved-search-alerts` | Bearer (CRON_SECRET) | Trigger saved search alerts (Vercel Cron) |
| GET | `/api/cron/refresh-suggestions` | Bearer (CRON_SECRET) | Refresh search suggestions |

---

## Authentication & Authorization

### How Auth Works

1. **Supabase Auth** handles email/password authentication with PKCE flow
2. **SSR cookies** maintain session (via `@supabase/ssr`)
3. **Middleware** (`middleware.ts`) protects `/dashboard/*` routes
4. **Back-office guard** (`lib/auth/back-office.ts`) restricts `/back-office/*` to `admin`/`ops`
5. **API routes** check `getUser()` and validate role/ownership per endpoint
6. **No Supabase RLS** — all authorization is application-level via server-side checks

### Permission Check Pattern (in API routes)

```typescript
// Typical permission check in API routes:
const user = await getUser();
if (!user) return 401; // Not authenticated

// Role check
const isAdminOrOps = user.role === 'admin' || user.role === 'ops';

// Ownership check
const isOwner = listing.landlord?.userId === user.id || listing.createdBy === user.id;

if (!isAdminOrOps && !isOwner) return 403; // Forbidden
```

### Auth Callback Flow

The `/auth/callback` route handles:
- Email confirmation after sign-up
- Password reset token exchange
- PKCE code exchange for session creation
- Redirects to appropriate page based on `next` param

### Security Features

- **Rate limiting** — IP-based on uploads, listing creation, view tracking
- **Soft deletes** — Users and contact numbers use `deletedAt` / `isActive` flags
- **Audit logging** — All major actions logged via `logAudit()` / `logListingAction()`
- **Email verification** — Supabase Auth with email confirmation
- **CRON security** — Cron routes secured via `CRON_SECRET` bearer token
- **Ownership validation** — Resources verified to belong to current user before modification

---

## Notification System

### Notification Types

| Type | Description |
|------|-------------|
| `new_lead` | New inquiry from a renter |
| `saved_search_alert` | New listings matching a saved search |
| `viewing_scheduled` | Viewing appointment scheduled |
| `listing_approved` | Listing approved by ops/admin |

### How It Works

1. **Created** via `createNotification()` function (inserts into `notifications` table)
2. **Retrieved** via `GET /api/notifications` (paginated, max 100)
3. **Displayed** in the Notification Center (bell icon in top nav, with Suspense boundary)
4. **Marked read** via `PATCH /api/notifications/[id]/read` or bulk via `PATCH /api/notifications`
5. **Ops/Admin notifications** — `createNotificationsForOpsAndAdmin()` broadcasts to all ops/admin users

---

## Saved Searches & Alerts

### How It Works

1. User creates a saved search via `POST /api/saved-searches` with filter criteria as JSON
2. System checks limits (free: 3 max, premium: unlimited)
3. A **Vercel Cron job** runs every 6 hours (`GET /api/cron/saved-search-alerts`)
4. Cron finds new listings matching each saved search since `lastAlertAt`
5. For **free users**: only listings older than 24 hours are included (early access delay)
6. **Email sent** via `sendSavedSearchAlert()` + **in-app notification** created
7. `lastAlertAt` updated to prevent duplicate alerts

### Saved Search Fields

| Field | Description |
|-------|-------------|
| `name` | Alert name |
| `searchParams` | JSON — all filter criteria |
| `emailAlerts` | Email notifications enabled (boolean) |
| `whatsappAlerts` | WhatsApp notifications (boolean, not yet implemented) |
| `lastAlertAt` | Timestamp of last alert sent |

---

## Image Upload System

### Flow

1. User selects images in the listing form (max 6 images, max 5MB each)
2. Client sends files to `POST /api/upload`
3. Server validates: auth required, rate-limited by IP, allowed types (JPEG, PNG, WebP, GIF)
4. Images uploaded to **Supabase Storage** bucket `stay-rental-images`
5. Path: `listings/{timestamp}-{random-hash}.{ext}`
6. Public URLs returned with 1-year cache headers
7. URLs stored in the listing's `images` JSON field

---

## Contact Number Management

### Structure

Each contact number has:
- `phoneNumber` — the number
- `isWhatsApp` — WhatsApp capability (boolean)
- `label` — e.g., "Primary", "Office", "Mobile"
- `isActive` — soft-delete flag
- `verified` — verified by platform support
- `verifiedBy` / `verifiedAt` — verification tracking

### Ownership Model

Contact numbers can belong to:
- A **user** (`userId` field) — personal numbers
- A **business account** (`businessAccountId` field) — shared team numbers

### Linking to Listings

- `listing_contact_numbers` junction table links contact numbers to listings
- At least one contact number required per listing
- Displayed on public listing page: verified contacts shown first

### Display Priority on Public Listings

1. Verified contacts (highest priority)
2. Active contacts
3. Landlord/publisher phone fallback
4. "No contacts available" message (last resort)

---

## Search Ranking Algorithm

Listings in search results are sorted by the following priority (highest first):

| Priority | Criteria | Source |
|----------|----------|--------|
| 1 (highest) | Featured listings | `featuredUntil > now()` |
| 2 | Boosted listings | `boostedUntil > now()` |
| 3 | Subscription plan level | Agency > Pro > Starter > Free |
| 4 | Urgent listings | `urgentUntil > now()` |
| 5 | Verified/visited status | `verified = true` or `visited = true` |
| 6 (lowest) | Newest first | `createdAt DESC` |

**Additional rules:**
- Exclusive listings (`exclusive = true`) only shown to Premium renters
- Free renters see new listings with a 24-hour delay (Premium gets early access)

---

## Key Features

### Sri Lanka-Specific Design

- **Power backup filters** — Generator, Solar, UPS, None
- **Water source info** — Mains, Tank, Borehole with tank size
- **Fiber internet ready** — Filter by fiber availability and ISP (Dialog, SLT, etc.)
- **Hyper-local search** — City, district, popular areas
- **Pricing in LKR** — All prices in Sri Lankan Rupees

### Verification System

- **Landlord verification** — NIC and ownership documents verified by ops
- **Property visit** — Physical visit with "Visited" badge
- **Verification badge** — Green badge on verified listings with date
- **Verified contacts** — Only platform-verified phone numbers shown

### Direct Contact

- **Phone & WhatsApp** — Contact numbers on every listing
- **No sign-in required** — Anyone can view contacts and reach out
- **No middlemen** — Direct landlord-tenant communication
- **No booking fees** — Free to contact and arrange viewings

---

## Navigation Guide

### Public Pages (No Sign-In Required)

| Page | URL | Description |
|------|-----|-------------|
| Homepage | `/` | Hero, search, pricing, featured listings, testimonials |
| Browse Listings | `/listings` | All active listings with 30+ filters |
| Listing Detail | `/listings/[id]` | Full property details and contact info |
| List Your Property | `/list-your-property` | Landlord landing page |
| How to Use | `/how-to-use` | Step-by-step guide for renters and landlords |
| Sign In | `/sign-in` | Login |
| Sign Up | `/sign-up` | Registration |
| Forgot Password | `/forgot-password` | Password recovery |
| Reset Password | `/reset-password` | Set new password |
| Privacy Policy | `/privacy-policy` | Legal |
| Terms of Service | `/terms-of-service` | Legal |

### Top Navigation Bar

- **Easy Rent** logo → `/`
- **Home** → `/`
- **Browse Listings** → `/listings`
- **List Property** → `/list-your-property`
- **How to Use** → `/how-to-use`
- **Notification bell** → notification center (authenticated only)
- **User menu** → sign in/up or account dropdown

### Dashboard Sidebar (All Authenticated Users)

| Menu Item | URL | Description |
|-----------|-----|-------------|
| Overview | `/dashboard` | Active and verified listing counts |
| Listings | `/dashboard/listings` | Manage your listings |
| Analytics | `/dashboard/analytics` | Listing performance data |
| Saved Alerts | `/dashboard/saved-searches` | Manage saved search alerts |
| Settings | `/dashboard/general` | Account settings (name, email) |
| Security | `/dashboard/security` | Password management |

### Back-Office Sidebar (Ops and Admin Only)

| Menu Item | URL | Description |
|-----------|-----|-------------|
| Overview | `/back-office` | Back-office dashboard |
| Business Accounts | `/back-office/business-accounts` | Manage agencies |
| Team Members | `/back-office/team-members` | Manage team members |
| Listings | `/back-office/listings` | Manage ALL platform listings |
| Settings | `/back-office/settings` | Back-office settings |

### Footer

**Renters:** Browse Listings, Apartments (`/listings?type=apartment`), Houses (`/listings?type=house`), Rooms (`/listings?type=room`)
**Landlords:** List Your Property, Landlord Login, Manage Listings
**Company:** How It Works (`/#how-it-works`), How to Use, Sign In, Create Account
**Legal:** Privacy Policy, Terms of Service
**Contact:** hello@easyrent.lk | +94 77 000 0000
**Tagline:** Sri Lanka's trusted, affordable platform for verified rentals. No scams. No surprises.

---

## Troubleshooting

### Can't Access Dashboard

- **Cause**: Not authenticated
- **Fix**: Sign in at `/sign-in`. Middleware redirects unauthenticated users.

### Can't Access Back-Office

- **Cause**: Role is not `ops` or `admin`
- **Fix**: Sign in with ops or admin credentials. Other roles redirect to `/dashboard`.

### Listing Not Showing in Public Listings

- **Cause**: Status is not `active`
- **Fix**: Check status in dashboard — must be `active`. Pending = awaiting verification. Exclusive = Premium renters only.

### Can't See Contact Details on a Listing

- **Cause**: No contact numbers linked to the listing
- **Fix**: Edit listing and add at least one contact number.

### Email Verification Banner Won't Go Away

- **Cause**: Email not yet verified
- **Fix**: Check email (including spam) for verification link. Click it. Refresh page.

### New Listings Not Appearing for Free Renters

- **Cause**: 24-hour early access delay for Premium
- **Fix**: Listings appear to free users 24 hours after creation. Premium users see them immediately.

### Saved Search Limit Reached

- **Cause**: Free plan allows max 3 saved searches
- **Fix**: Delete an existing saved search or upgrade to Premium for unlimited.

### Error Messages

| Error | Meaning |
|-------|---------|
| `Invalid ID` | Listing ID in URL is malformed |
| `Listing not found` | Listing doesn't exist or is not active |
| `User not authenticated` | Sign-in required |
| `Unauthorized` | Your role doesn't have permission for this action |
| `Featured limit reached` | Only 1 featured listing per landlord allowed |

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `BASE_URL` | App base URL | Yes |
| `NEXT_PUBLIC_BASE_URL` | Public app URL | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server only) | Yes |
| `RESEND_API_KEY` | Email provider (Resend) | For emails |
| `CRON_SECRET` | Secret for cron job endpoints | For crons |
| `STRIPE_SECRET_KEY` | Stripe payment key | Optional |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Optional |

---

## Support

- **Email:** hello@easyrent.lk
- **Phone:** +94 77 000 0000
- **How to Use guide:** `/how-to-use`
- **This manual:** `USER_MANUAL.md`

---

**Last Updated**: April 2026
**Version**: 3.0.0
