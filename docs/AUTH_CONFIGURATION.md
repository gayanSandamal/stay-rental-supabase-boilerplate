# Supabase Authentication Configuration Guide

This guide walks you through configuring Supabase Auth for the Easy Rent app.

---

## 1. Supabase Dashboard Setup

### 1.1 Get your project credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. Open **Settings** → **API**.
3. Copy:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **anon** key (or **Publishable** key under the new API keys)

### 1.2 Configure URL settings

1. Go to **Authentication** → **URL Configuration**.
2. Set **Site URL**:
   - Local: `http://localhost:3000`
   - Production: `https://yourdomain.com` (e.g. `https://easyrent.lk`)
3. Add **Redirect URLs** to the allow list:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/callback?next=*`
   - Production: `https://yourdomain.com/auth/callback`
   - Production: `https://yourdomain.com/auth/callback?next=*`
   
   For Vercel preview deployments, add:
   - `https://*-your-project.vercel.app/auth/callback`
   - `https://*-your-project.vercel.app/auth/callback?next=*`

### 1.3 Email settings (optional)

1. Go to **Authentication** → **Providers** → **Email**.
2. **Confirm email**: Toggle ON if you want users to verify their email before signing in.
3. **Secure email change**: Recommended ON for production.

### 1.4 Email templates (optional)

1. Go to **Authentication** → **Email Templates**.
2. Customize **Confirm signup** and **Reset password** templates if needed.
3. The default templates use `{{ .ConfirmationURL }}` and `{{ .RedirectTo }}` — keep these for the app to work.

---

## 2. Environment Variables

Add these to `.env` (local) and your hosting provider (e.g. Vercel):

```env
# Required for Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# Base URL for redirects (must match your Site URL)
NEXT_PUBLIC_BASE_URL=http://localhost:3000   # or https://yourdomain.com
```

**Important:**
- No trailing spaces in values.
- `NEXT_PUBLIC_*` vars are exposed to the browser; never put secrets there.
- Restart the dev server after changing `.env`.

---

## 3. Auth Flow Overview

| Flow | Redirect URL | Callback |
|------|--------------|----------|
| Sign up (email confirmation) | `/auth/callback?next=/listings` | Exchanges code → session → redirects to `/listings` |
| Password reset | `/auth/callback?next=/reset-password` | Exchanges code → session → redirects to `/reset-password` |
| Sign in | No redirect | Session set directly |

---

## 4. Troubleshooting

### "Authentication service is not configured"
- `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing or invalid.
- Check `.env` and restart the dev server.
- For production, verify env vars in Vercel/hosting dashboard.

### Email confirmation link doesn't work
- Ensure the redirect URL is in **Redirect URLs** in Supabase.
- Ensure `NEXT_PUBLIC_BASE_URL` matches your Site URL.
- Check for trailing spaces in env vars.

### "Token has expired or is invalid"
- Links expire (default ~1 hour). Request a new one.
- Some email clients prefetch links and consume the token; consider using OTP in templates instead.

### Sign-up loads indefinitely
- Supabase project may be paused (free tier).
- Check network/connectivity.
- Verify Supabase URL and key are correct.

---

## 5. Database Trigger for Sign-Up

A trigger (`0020_auth_user_trigger.sql`) automatically creates a row in `public.users` when a new user signs up in Supabase Auth. This avoids connection/timeout issues during sign-up.

**Run the migration on your Supabase database:**
```bash
# With DATABASE_URL set to your Supabase connection string (use pooler port 6543 for production)
pnpm db:migrate-all
```

For production (Vercel), ensure `DATABASE_URL` uses the **Supabase transaction pooler** (port 6543), not the direct connection (port 5432).

---

## 6. Production Checklist

- [ ] Set **Site URL** to production domain.
- [ ] Add production redirect URLs to allow list.
- [ ] Set `NEXT_PUBLIC_BASE_URL` in Vercel/hosting env.
- [ ] Enable **Confirm email** if required.
- [ ] (Optional) Configure custom SMTP for auth emails.
- [ ] Run `pnpm db:migrate-all` to apply the auth trigger (0020_auth_user_trigger.sql).
