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
3. Within ~4–6 min (4-min settle window + 2-min cron): the row flips to `published`, the listing is live on /listings under "Easy Rent Operations" with your number as the verified contact, and you receive a WhatsApp confirmation reply.
4. Also send a deliberately incomplete message ("house for rent, 2 rooms") from another phone → expect a reply asking for the missing fields (`needs_info`).

## Step 7 — App Review / going fully live

While the app is in **Development mode**, only numbers added as test recipients can message the business number. To accept messages from *any* landlord:

1. Complete **Business verification** (Business Settings → Security Centre — business documents, can take days). Start this early.
2. Switch the app to **Live mode** (App dashboard toggle). Inbound messages + free-form replies within the 24-hour customer-service window need no template approval, so no message templates are required for the intake flow.

## Kill switches & ops

- **Back Office → Settings**: `enableWhatsAppIntake` OFF = webhook acks but stores nothing. `autoPublishWhatsAppIntakes` OFF = intakes go to `pending` for one-tap approval instead of publishing live.
- Triage queue: **Back Office → WhatsApp Intakes** (reject / reprocess).
- Cron `/api/cron/process-whatsapp-intakes` runs every 2 min (Vercel cron, `CRON_SECRET` bearer).
- Docs: `docs/deep-dive-whatsapp-intake-pipeline.md` for architecture; `e2e/whatsapp-intake.spec.ts` for the simulated-payload test suite.

## Known limitations to keep in mind

- **The site footer shows this number as general support.** Tenants who WhatsApp a question ("is the Dehiwala house still available?") reach the intake bot and get a "to publish your listing we still need…" reply. Watch the intake queue for these in week one; if it's noisy, either point the footer at a different (human) number or accept the bot reply.
- **Alerting is in-app only.** Pipeline events create bell notifications for ops/admin — nobody is emailed. If the webhook or cron breaks silently (bad secret, expired token), the symptom is "no new intakes". Check **Back Office → WhatsApp Intakes** daily in week one; a dead-man alert (oldest `received` intake age) is a good follow-up ticket.
- **Replies outside 24h fail by design** (Meta's customer-service window). The pipeline flags these to ops ("could not reach sender") rather than erroring; the ops fallback is calling the number.
- **The access token in Step 3.2 must be the never-expiring system-user token.** The API-Setup page's temporary token dies after 24h and every photo silently stops persisting (now logged loudly, but still).


---

# Intake v2 rollout (added 2026-08-04)

Everything below is already deployed but **inert**: every new flag defaults OFF,
and the moderation engine no-ops without an API key. Roll out in this order,
watching each step before the next.

## 0. One-time setup

1. **Migrations** — `pnpm db:migrate-all` (0030–0032). Already applied to
   production on 2026-08-04.
2. **SiliconFlow key** for the automated checks. Create one at
   [cloud.siliconflow.com](https://cloud.siliconflow.com/) → API Keys, then add
   to Vercel (Production):

   | Variable | Value |
   | --- | --- |
   | `SILICONFLOW_API_KEY` | your key |

   Model ids and endpoint have working defaults (Qwen3-VL-8B for the per-image
   gate and text checks, Qwen3-VL-32B to adjudicate flagged images). Only set
   `MODERATION_API_BASE=https://api.siliconflow.cn/v1` if you use the China
   platform. Cost is ~$0.002 per 6-photo listing — about $1/month at 500
   listings — so a $5 top-up lasts months.
3. **DNS** — done 2026-08-04, `wa.easyrent.lk. IN MX 0 .` in Cloudflare.
   Landlord accounts use placeholder addresses on that subdomain and nothing
   ever sends to them (`createUser` passes `email_confirm: true`;
   `admin.generateLink` mints links without sending). This is defence in depth
   against a future accidental send.

   What matters is **no MX *and* no A/AAAA/CNAME** on `wa`: with no MX, senders
   fall back to the address record as an *implicit MX*, so a subdomain that
   resolves to the web server is not protected. Hence the explicit null MX
   (RFC 7505) rather than just leaving the name absent — it survives someone
   later adding a wildcard `*.easyrent.lk`, which would otherwise make `wa`
   resolve. **When adding new subdomains, use explicit CNAMEs, never a
   wildcard.** Verify with:

   ```bash
   dig +short MX wa.easyrent.lk   # expect: 0 .
   dig +short A  wa.easyrent.lk   # expect: empty
   ```
4. **Validate before enabling anything:**

   ```bash
   pnpm moderation:probe        # key, endpoint, model ids + the 2 risky behaviours
   pnpm moderation:calibrate    # 14-case text corpus with expected verdicts
   ```

   Both must pass. The probe asserts that a Sinhala listing with an English
   title is **not** flagged and that an added watermark **is** detected; the
   calibration corpus covers Sinhala/Tamil/Singlish/bilingual, unknown towns,
   spam, and the two zero-token deterministic holds.

## 1. Image processing first (no AI involved)

Back Office → Settings → **Compress + watermark images** ON.

Validates sharp on Vercel and the derived-URL path in isolation. New photos
become WebP (max 1920px, EXIF/GPS stripped) with the Easy Rent watermark; the
logo variant is chosen per photo by corner brightness so it can't vanish on a
white wall. Check a freshly published listing's gallery, then move on.

## 2. Automated approval, images only

Turn ON **Automated listing approval**, leave **check text coherence** OFF.

Watch Back Office → **Moderation**. Every held listing shows its reasons and its
original photos with per-photo verdicts. If a legitimate photo is rejected, hit
**Restore** — that decision is remembered permanently, so the same image passes
on every future check.

## 3. Text coherence

Turn ON **check text coherence**. This is the likelier source of false
positives; watch the Moderation queue for a day before leaving it.

## 4. Landlord accounts and self-service links (last)

Turn ON **WhatsApp landlord accounts**.

From here, each sender gets a real account, owns their listing, and the publish
reply carries three links: view, edit, and remove. **Test cross-device before
trusting it** — the whole point is that the link works on a phone that never
started the session:

1. WhatsApp a listing from your phone.
2. When the 🎉 reply arrives, open the **edit** link on a *different* device.
   You should land on the edit form already signed in.
3. Change something, save, and confirm it re-enters the queue and republishes.
4. Send `delete` → reply with the number → reply `DELETE`. The listing should
   disappear from the site. Reply `yes` instead of `DELETE` on a later attempt
   and confirm it does **not** delete.

## 5. Conversation UX flags (added 2026-08-04)

Two further flags, independent of the four above:

- **WhatsApp rich replies** (`enableWhatsAppRichReplies`): blue-ticks incoming
  messages, sends an instant "got it" ack (the parse reply still takes ~5 min
  on the cron), swaps the delete flow to a native list picker + Delete/Cancel
  buttons, offers a share-location button when the address is missing, and
  renders the publish confirmation's view link as a preview card. Typed
  commands (`DELETE`, numbers, `CANCEL`) keep working as a fallback. OFF =
  plain-text conversation exactly as before.
- **LLM parser fallback (intake)** (`enableLlmParserFallback`): when the rules
  leave required fields empty, SiliconFlow (`Qwen/Qwen3-8B`, same key as
  moderation) fills only the gaps — recovers unknown towns ("Kolonnawa") and
  odd phrasings in all three languages. Validate first:

  ```bash
  pnpm parser:probe
  ```

Location pins work regardless of these flags: a pin shared mid-session fills
the listing's address/coordinates; a pin within 48h of publish attaches
coordinates to that listing.

## Ops notes

- **Moderation queue**: Back Office → Moderation. Actions: publish anyway
  (override), restore photo (permanent), re-run checks.
- **Removed listings** are archived immediately and purged permanently after 30
  days by `/api/cron/purge-archived` (daily 03:30). Within that window ops can
  restore one by setting its status back to `active`.
- **Access links** live 90 days from last use. A landlord who sends `LINK` gets
  fresh ones; `HELP` lists what they can do.
- **If the moderation provider goes down**, listings queue and then hold — they
  do not publish unchecked. `— publish if checks unavailable` is the emergency
  valve if the queue backs up and ops has no bandwidth.
- **Kill switches**, in order of bluntness: `WhatsApp landlord accounts` OFF
  (back to Ops-owned listings, no self-service), `Automated listing approval`
  OFF (publish as before, no checks), `enableWhatsAppIntake` OFF (webhook acks
  and stores nothing).

## Known limitations

- A landlord whose account was created over WhatsApp cannot yet convert to
  email + password sign-in (password change needs a current password; reset
  would mail the undeliverable placeholder). They manage listings entirely
  through their links. Self-deletion of the account is likewise unavailable.
- If several people share one WhatsApp number — or an agent forwards clients'
  properties — every listing from that number lands in the same account.
- A real "For Rent" board photographed in a garden is the one image
  false-positive risk we could not fully test before launch. The prompt
  distinguishes photographed from added text and the 32B model adjudicates every
  text finding, but watch for it. Worst case is a dropped photo, not a blocked
  listing.
- Face blurring is not built yet: a photo with a person visible is rejected
  rather than blurred. Face bounding boxes are already captured on every check,
  so adding blurring later is a small change.
