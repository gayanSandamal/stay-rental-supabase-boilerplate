# Auth email templates & deliverability

The password-reset (and signup-confirmation) emails are sent by **Supabase Auth**, not the app's
Resend templates in `lib/email.ts` — `app/(login)/actions.ts` calls `supabase.auth.resetPasswordForEmail()`,
so Supabase renders its own template and sends it through whatever SMTP is configured in the
Supabase dashboard. That's why those emails look unbranded even though `lib/email.ts` is fully styled.

## 1. Fix the Gmail "This message might be dangerous" banner (deliverability)

The banner appears because the mail claims to be from `noreply@easyrent.lk` but the domain's
email authentication (SPF/DKIM/DMARC) doesn't vouch for the sender. Fix by sending through
Resend with a verified domain:

1. **Resend dashboard → Domains → Add Domain** → `easyrent.lk`.
   Resend shows 3–4 DNS records (DKIM `resend._domainkey…`, SPF include, optional return-path).
2. **Cloudflare DNS** → add those records exactly as shown, plus a DMARC record:
   - Type `TXT`, name `_dmarc`, value `v=DMARC1; p=quarantine; rua=mailto:hello@easyrent.lk`
3. Wait for Resend to show the domain as **Verified**.
4. **Supabase Dashboard → Project Settings → Authentication → SMTP Settings** → enable custom SMTP:
   - Host: `smtp.resend.com` · Port: `465` · User: `resend` · Password: your Resend API key
   - Sender email: `noreply@easyrent.lk` · Sender name: `Easy Rent`
5. Send a test reset — the banner should be gone (check "show original" in Gmail:
   SPF, DKIM and DMARC should all say PASS).

## 2. Make the emails match the brand

Paste the templates from this folder into
**Supabase Dashboard → Authentication → Emails (Email Templates)**:

| Supabase template | File | Suggested subject |
|---|---|---|
| Reset Password | `supabase-reset-password.html` | Reset your Easy Rent password |
| Confirm signup | `supabase-confirm-signup.html` | Confirm your Easy Rent email |

They replicate the branded shell from `lib/email.ts` (teal gradient header with the reversed
logo, pill CTA, footer) with Supabase's `{{ .ConfirmationURL }}` / `{{ .Email }}` variables and
a plain-link fallback. The logo is loaded from `https://easyrent.lk/brand/easy-rent-logo-reversed.png`
(must stay an absolute URL).

While in the dashboard, also confirm **Authentication → URL Configuration**:
- Site URL: `https://easyrent.lk`
- Redirect URLs include: `https://easyrent.lk/auth/callback`

## Notes

- Rich HTML + a proper text-to-link ratio also reduces spam scoring — the default two-line
  template is part of why Gmail flagged it.
- If you later edit the shell in `lib/email.ts`, update these copies to match (they can't share
  code — Supabase stores them server-side).
