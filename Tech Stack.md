# Easy Rent — Tech Stack & Tools

A high-level overview of the technologies and tools powering the Easy Rent rental platform.

---

## **Core Framework**

| Tool | Purpose |
|------|---------|
| **Next.js 15** | React framework with App Router, server components, API routes |
| **React 19** | UI library |
| **TypeScript** | Type safety across the codebase |
| **Turbopack** | Fast dev server (`next dev --turbopack`) |

---

## **Backend & Database**

| Tool | Purpose |
|------|---------|
| **PostgreSQL** | Primary database (hosted on Supabase) |
| **Drizzle ORM** | Type-safe SQL queries, migrations, schema management |
| **Drizzle Kit** | Migrations (`db:generate`, `db:migrate`), Drizzle Studio |
| **Supabase** | Database hosting, connection pooling (Transaction mode 6543 for production) |

*Local dev can use Supabase direct connection (5432) or a local Postgres instance.*

---

## **Authentication & Storage**

| Tool | Purpose |
|------|---------|
| **Supabase Auth** | User authentication (email/password, OAuth-ready), PKCE flow |
| **@supabase/ssr** | Server-side session handling with cookies (Next.js App Router) |
| **Supabase Storage** | Property image uploads (`property-images` bucket, 5 MB limit, JPEG/PNG/WebP/GIF) |

*Auth uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client/server; `SUPABASE_SERVICE_ROLE_KEY` for admin ops and storage.*

---

## **Email**

| Tool | Purpose |
|------|---------|
| **Resend** | Transactional emails (password reset, listing approved/rejected, saved search alerts, expiration reminders) |
| **Resend Contacts API** | Sync users as contacts for Broadcasts/marketing (on sign-in/sign-up) |

*Configure with `EMAIL_PROVIDER=resend` and `RESEND_API_KEY`. Without Resend, emails log to console.*

---

## **Payments**

| Tool | Purpose |
|------|---------|
| **Stripe** | In `package.json`; setup script supports webhooks. *Currently not used for live payments—Boost and plans are activated manually by admin/ops after payment.* |

*Stripe integration is prepared for future subscription and one-time payment flows.*

---

## **UI & Styling**

| Tool | Purpose |
|------|---------|
| **Tailwind CSS 4** | Utility-first styling |
| **Radix UI** | Accessible primitives (dialogs, dropdowns, etc.) |
| **Lucide React** | Icons |
| **class-variance-authority (CVA)** | Component variants |
| **clsx** + **tailwind-merge** | Conditional class merging |
| **tw-animate-css** | Animations |

---

## **Forms & Validation**

| Tool | Purpose |
|------|---------|
| **Zod** | Schema validation for forms and API inputs |
| **Server Actions** | Form submissions with `validatedAction` / `validatedActionWithUser` helpers |

---

## **Data Fetching & State**

| Tool | Purpose |
|------|---------|
| **SWR** | Client-side data fetching and caching |
| **Server Components** | Default for data loading; `getUser()` and DB queries run on server |

---

## **Deployment & Infrastructure**

| Tool | Purpose |
|------|---------|
| **Vercel** | Hosting, serverless functions, edge |
| **Vercel Cron** | Scheduled jobs: search suggestions (every 15 min), saved search alerts (every 6 hours) |
| **CRON_SECRET** | Bearer token to secure cron endpoints |

*Cron routes: `/api/cron/refresh-suggestions`, `/api/cron/saved-search-alerts`.*

---

## **Security & Performance**

| Tool / Feature | Purpose |
|----------------|---------|
| **Rate limiting** | In-memory rate limits on listing creation, contact numbers, uploads, listing views |
| **Feature flags** | Toggle features (lead nurturing, audit log, rate limiting, etc.) via `lib/feature-flags.ts` |

---

## **Utilities & Dev Tools**

| Tool | Purpose |
|------|---------|
| **bcryptjs** | Password hashing (legacy; Supabase Auth handles passwords when used) |
| **jose** | JWT handling |
| **dotenv** | Environment variable loading |
| **server-only** | Enforce server-only modules |

---

## **Key Environment Variables**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (Supabase pooler for production) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key (Auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key (Storage, auth admin) |
| `EMAIL_PROVIDER` | `resend` for real emails |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender address (e.g. `Easy Rent <noreply@easyrent.lk>`) |
| `NEXT_PUBLIC_BASE_URL` | App URL (e.g. `https://easyrent.lk`) |
| `CRON_SECRET` | Secret for Vercel cron authentication |

---

## **Architecture Summary**

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App (Vercel)                       │
├─────────────────────────────────────────────────────────────────┤
│  App Router │ API Routes │ Server Components │ Middleware        │
└─────────────────────────────────────────────────────────────────┘
         │                    │                        │
         ▼                    ▼                        ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Supabase   │    │   Supabase        │    │   Resend            │
│   Auth       │    │   Storage         │    │   (Email)           │
└──────────────┘    └──────────────────┘    └─────────────────────┘
         │                    │                        │
         └────────────────────┼────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   Supabase       │
                    │   PostgreSQL     │
                    │   (Drizzle ORM)  │
                    └──────────────────┘
```
