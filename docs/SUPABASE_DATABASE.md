# Host the database on Supabase

Follow these steps to run your Stay Rental app against a Supabase Postgres database.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**.
3. Choose your **organization**, set a **name** (e.g. `stay-rental`), set a **database password** (save it securely), and pick a **region** close to your users.
4. Click **Create new project** and wait until the project is ready.

---

## 2. Get the database connection string

1. In the Supabase dashboard, open your project.
2. Go to **Project Settings** (gear icon) → **Database**.
3. Scroll to **Connection string**.
4. Choose **URI** and copy the string. It looks like:
   ```text
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the database password you set when creating the project.

**Two connection modes:**

| Use case              | Port | When to use |
|-----------------------|------|-------------|
| **Session mode**      | 5432 | Running migrations, long-lived scripts, local dev. |
| **Transaction mode**  | 6543 | Serverless (e.g. Vercel). Use the **pooler** URL. |

- For **local dev and running migrations**, you can use either:
  - **Direct**: Port **5432** (Session mode) — same page, “Direct connection” or “Session” URI.
  - **Pooler**: Port **6543** (Transaction mode) — “Transaction” URI.
- For **production on Vercel**, use the **Transaction (6543)** pooler URL to avoid exhausting connections.

---

## 3. Configure your app

Create or update `.env` in the project root (do not commit this file).

**Option A – Supabase as main DB (local + production):**

```env
# Supabase database (use Transaction mode / 6543 for production serverless)
DATABASE_URL="postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Optional: keep for local Postgres if you use it
# POSTGRES_URL=postgres://postgres:postgres@localhost:54322/postgres
```

**Option B – Keep local Postgres for dev, Supabase for production:**

- **Local:** use `POSTGRES_URL` pointing at your local Postgres (e.g. Docker).
- **Production (e.g. Vercel):** set only `DATABASE_URL` to the Supabase pooler URL.

The app reads **`DATABASE_URL` first**, then **`POSTGRES_URL`**, so one of them must be set.

---

## 4. Run migrations on Supabase

From your machine, with `.env` pointing at the Supabase URL (or with `DATABASE_URL` set to Supabase):

```bash
npm run db:migrate
```

This applies all migrations in `lib/db/migrations` to your Supabase database. You only need to run this once per new Supabase project (or after adding new migrations).

---

## 5. (Optional) Seed data

If you use seed scripts:

```bash
npm run db:seed
npm run db:seed-listings   # if you have listing seed data
```

---

## 6. Verify

1. Start the app: `npm run dev`
2. Open the site and check:
   - Listings load.
   - You can sign in / sign up (if auth uses this DB).
   - Dashboard works.
3. In Supabase: **Table Editor** — you should see tables such as `users`, `listings`, `saved_searches`, etc.

---

## 7. Production (e.g. Vercel)

- In Vercel → **Project → Settings → Environment Variables**, add:
  - **`DATABASE_URL`** = your Supabase **Transaction mode (6543)** pooler URI.
  - **`CRON_SECRET`** = a random secret (min 16 chars, e.g. `openssl rand -base64 32`). Required for the search suggestions cron job.
- Redeploy. The app will use Supabase in production.
- Run migrations from your **local** machine (with `DATABASE_URL` in `.env` pointing at the same Supabase DB) whenever you add new migrations:
  ```bash
  pnpm db:migrate-all
  ```

**Search suggestions cron:** The `search_location_suggestions` materialized view is refreshed every 15 minutes via Vercel Cron (`/api/cron/refresh-suggestions`). Ensure `CRON_SECRET` is set in Vercel so the cron can authenticate.

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| **Connection timeout** | Use the **Transaction (6543)** pooler URL in production; check firewall / IP allowlist in Supabase. |
| **Too many connections** | Ensure production uses the **pooler** URL (6543), not the direct 5432 URL. |
| **Migrations fail** | Use the **Session/Direct (5432)** URI for `DATABASE_URL` when running `npm run db:migrate`. |
| **SSL errors** | Supabase uses SSL by default; the provided URI is usually correct. If you see SSL errors, add `?sslmode=require` to the URL. |

---

## Summary

1. Create a Supabase project and get the **Database** connection URI.
2. Set **`DATABASE_URL`** (or **`POSTGRES_URL`**) in `.env` to that URI.
3. Run **`npm run db:migrate`** once to apply migrations.
4. Use the **pooler (6543)** URL for production (e.g. Vercel) and optionally **direct (5432)** for local migrations.

After this, your database is hosted on Supabase; you can proceed to host the app (e.g. on Vercel) and set `DATABASE_URL` there to the same Supabase pooler URL.
