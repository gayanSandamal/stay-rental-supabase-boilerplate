# WhatsApp Intake — Go-Live Runbook for +94 77 071 1939

**Status:** the pipeline is fully built, merged (PR #14), deployed, and verified end-to-end against a local stack (2026-07-28). Production is dormant by design — the webhook returns 503 until the four `WHATSAPP_*` env vars exist. This runbook is the *only* remaining work, and most of it happens in Meta's dashboards, so it must be done by a human with access to the business's Facebook account.

The app-side pieces (env var names, webhook URL, verify token) are pre-decided below — follow top to bottom.

---

## ⚠️ Read first: what happens to +94 77 071 1939

Registering a number with the WhatsApp Business **Cloud API** is a one-way door for day-to-day use:

- The number **cannot simultaneously run in the normal WhatsApp or WhatsApp Business phone app**. If it currently has a WhatsApp account, you must delete that account first (WhatsApp → Settings → Account → Delete account) — chat history on the phone is lost.
- After registration, *all* inbound messages to this number arrive only via the webhook, and outbound replies go only through the API. The intake pipeline auto-replies to landlords; anything unusual lands in **Back Office → WhatsApp Intakes** for manual handling.
- If this number is your personal/support number, consider buying a cheap dedicated SIM for intake instead, and keep this number for human support. (The support and intake numbers may be the same value in config — `NEXT_PUBLIC_WHATSAPP_SUPPORT` — but whichever number you register with the Cloud API stops working in the phone apps.)

## Prerequisites

- A Facebook account with admin access to (or ability to create) a **Meta Business Portfolio** for Easy Rent — https://business.facebook.com
- The +94 77 071 1939 SIM available to receive an SMS or voice call once, for number verification.
- Access to the Vercel project for easyrent.lk.

## Step 1 — Meta app + WhatsApp product (developers.facebook.com)

1. Go to https://developers.facebook.com/apps → **Create App** → use case "Other" → type **Business** → link it to the Easy Rent business portfolio.
2. In the app dashboard, **Add Product → WhatsApp → Set up**. This creates a WhatsApp Business Account (WABA) with a free Meta **test number**.
3. (Optional but recommended) Do a sandbox smoke test with the test number first — see Step 6; it works before business verification.

## Step 2 — Register +94 77 071 1939

1. WhatsApp → **API Setup** → "Add phone number".
2. Display name: `Easy Rent` (Meta reviews this against their display-name policy — avoid punctuation gimmicks). Category: real estate.
3. Verify the number via SMS or voice call to the SIM.
4. Copy the number's **Phone Number ID** (a long numeric ID shown under the number — *not* the phone number itself) → this is `WHATSAPP_PHONE_NUMBER_ID`.

## Step 3 — Credentials

1. **App secret**: App Settings → Basic → App secret → Show → this is `WHATSAPP_APP_SECRET`.
2. **Permanent access token** (do NOT use the 24-hour temporary token from API Setup):
   - business.facebook.com → Business Settings → Users → **System users** → Add → name `easyrent-intake`, role Admin.
   - Add Assets → Apps → your app → full control.
   - **Generate New Token** → select the app → expiry **Never** → permissions: `whatsapp_business_messaging` + `whatsapp_business_management` → this is `WHATSAPP_ACCESS_TOKEN`.
3. **Verify token** (self-chosen, shared between Meta and the app — NOT committed to git). Generate one locally and keep it with your other secrets:

   ```
   openssl rand -hex 24
   ```

## Step 4 — Vercel env vars, then redeploy

Vercel → easyrent.lk project → Settings → Environment Variables (Production):

| Var | Value |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | the value generated in Step 3.3 |
| `WHATSAPP_APP_SECRET` | from Step 3.1 |
| `WHATSAPP_ACCESS_TOKEN` | system-user token from Step 3.2 |
| `WHATSAPP_PHONE_NUMBER_ID` | from Step 2.4 |
| `NEXT_PUBLIC_WHATSAPP_SUPPORT` | `94770711939` |

Then **redeploy** (`NEXT_PUBLIC_*` vars are baked in at build time — a plain env change without a new deployment will not surface the concierge CTAs). After the deploy:

- `POST https://easyrent.lk/api/whatsapp/webhook` should return **401** (was 503) — it now wants a signature.
- The homepage landlord section shows the "WhatsApp us" CTAs pointing at wa.me/94770711939.

## Step 5 — Register the webhook with Meta

App dashboard → WhatsApp → **Configuration** → Webhook → Edit:

- Callback URL: `https://easyrent.lk/api/whatsapp/webhook` — **exactly, with no trailing slash**. A trailing slash gets a 308 redirect that Meta will not follow, and verification fails silently.
- Verify token: the `WHATSAPP_VERIFY_TOKEN` value above
- Click **Verify and save** — Meta calls the GET handshake; it succeeds only after Step 4's deploy is live.
- Under **Webhook fields**, subscribe to **`messages`** (that single field carries inbound texts, images, and statuses).

## Step 6 — Smoke test (15 minutes)

1. From your personal phone, WhatsApp the intake number:
   > 2 bedroom house at 25 Galle Road, Dehiwala for 85000 per month. 2 bathrooms.
   and attach 1–2 photos.
2. Within ~10 s: **Back Office → WhatsApp Intakes** shows a `received` row with your number, text, and photo thumbnails.
3. Within ~10–20 min (10-min settle window + 10-min cron): the row flips to `published`, the listing is live on /listings under "Easy Rent Operations" with your number as the verified contact, and you receive a WhatsApp confirmation reply.
4. Also send a deliberately incomplete message ("house for rent, 2 rooms") from another phone → expect a reply asking for the missing fields (`needs_info`).

## Step 7 — App Review / going fully live

While the app is in **Development mode**, only numbers added as test recipients can message the business number. To accept messages from *any* landlord:

1. Complete **Business verification** (Business Settings → Security Centre — business documents, can take days). Start this early.
2. Switch the app to **Live mode** (App dashboard toggle). Inbound messages + free-form replies within the 24-hour customer-service window need no template approval, so no message templates are required for the intake flow.

## Kill switches & ops

- **Back Office → Settings**: `enableWhatsAppIntake` OFF = webhook acks but stores nothing. `autoPublishWhatsAppIntakes` OFF = intakes go to `pending` for one-tap approval instead of publishing live.
- Triage queue: **Back Office → WhatsApp Intakes** (reject / reprocess).
- Cron `/api/cron/process-whatsapp-intakes` runs every 10 min (Vercel cron, `CRON_SECRET` bearer).
- Docs: `docs/deep-dive-whatsapp-intake-pipeline.md` for architecture; `e2e/whatsapp-intake.spec.ts` for the simulated-payload test suite.

## Known limitations to keep in mind

- **The site footer shows this number as general support.** Tenants who WhatsApp a question ("is the Dehiwala house still available?") reach the intake bot and get a "to publish your listing we still need…" reply. Watch the intake queue for these in week one; if it's noisy, either point the footer at a different (human) number or accept the bot reply.
- **Alerting is in-app only.** Pipeline events create bell notifications for ops/admin — nobody is emailed. If the webhook or cron breaks silently (bad secret, expired token), the symptom is "no new intakes". Check **Back Office → WhatsApp Intakes** daily in week one; a dead-man alert (oldest `received` intake age) is a good follow-up ticket.
- **Replies outside 24h fail by design** (Meta's customer-service window). The pipeline flags these to ops ("could not reach sender") rather than erroring; the ops fallback is calling the number.
- **The access token in Step 3.2 must be the never-expiring system-user token.** The API-Setup page's temporary token dies after 24h and every photo silently stops persisting (now logged loudly, but still).
