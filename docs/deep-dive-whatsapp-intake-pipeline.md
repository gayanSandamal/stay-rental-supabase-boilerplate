# Messaging Intake Pipeline (WhatsApp + future channels) - Deep Dive Documentation

**Generated:** 2026-07-10 · **Updated:** 2026-07-13 (rule-parser + channel-adapter refactor)
**Scope:** `lib/intake/**`, `app/api/whatsapp/webhook/**`, `app/api/cron/process-whatsapp-intakes/**`, `app/(dashboard)/back-office/whatsapp-intakes/**`, plus schema/migration/flag anchors

## Overview

The intake pipeline turns inbound messenger messages ("Hi, I want to list my 2BR house in Nugegoda for 80k") into published `listings` rows, with no human typing. It is the automation layer behind the "WhatsApp concierge" landlord-acquisition CTAs.

Since 2026-07-13 the pipeline is **channel-agnostic**: a core (session batching, parsing, checks, publishing) that knows nothing about Meta, plus per-channel adapters. WhatsApp is the first adapter; Telegram/iMessage later means one adapter module + one thin webhook route + a registry entry.

Parsing is **rule-based and in-process** (`lib/intake/parser`) — deterministic regex + a Sri Lanka gazetteer + scam heuristics, unit-tested, zero external calls. An optional LLM fallback (Claude) can fill fields the rules miss, but only behind the `enableLlmParserFallback` flag (default OFF) and only with `ANTHROPIC_API_KEY` set.

**Key responsibilities:**
- Receive channel webhook events (verify + store) — thin and fast, no decisions.
- Batch multi-message submissions into one intake session per sender (6h window).
- Parse free text (English / Sinhala-English) via the rule parser (+ optional LLM fill-ins).
- Run pre-publication checks (completeness, rent sanity, duplicate, scam score).
- Create the listing under the "Easy Rent Operations" identity with the sender's number as a verified contact (auto-publish or pending, per flag).
- Reply to the sender and notify ops; expose a back-office triage queue.

> ⚠️ **STATUS: LIVE BUT DORMANT.** Deployed but inert until all `WHATSAPP_*` env vars are set and Meta Business verification completes. Webhook 503s and cron no-ops while unconfigured (`lib/intake/channels/whatsapp/config.ts::isIntakeConfigured`). `ANTHROPIC_API_KEY` is NOT required — parsing is in-process.
>
> ⚠️ **OWNER DECISION:** `autoPublishWhatsAppIntakes` defaults **ON** — intakes passing automated checks go live immediately, no human review. Flip OFF in Back Office → Settings to route intakes to `pending` for one-tap approval (fully built fallback).

## File inventory

### Core pipeline — `lib/intake/`

| File | Purpose |
| --- | --- |
| `process.ts` | The "brain": `processSettledIntakes(adapters)` + `processIntake(intake, adapter)`. Parse → checks → publish/needs_info/manual_review state machine. `SETTLE_MS` (4 min; `INTAKE_SETTLE_MS` env is a test seam) batches multi-message bursts. |
| `session.ts` | `appendToIntake(msg, mediaUrls)` — per-sender session append, channel-scoped, 6h `SESSION_WINDOW_MS`, idempotent via message ids, `needs_info` → `received` reopen. |
| `checks.ts` | `runIntakeChecks(parsed)` — suspicious → non-retriable; missing fields / rent outside 5k–3M LKR → retriable (ask sender); duplicate address+city → non-retriable. |
| `messages.ts` | Pure sender-reply string builders (needs-info / published / pending-review). |
| `ops-identity.ts` | Get-or-create the login-less `concierge@easyrent.lk` user + "Easy Rent Operations" business account that owns concierge listings. Race-safe. |

### Parser — `lib/intake/parser/`

| File | Purpose |
| --- | --- |
| `index.ts` | `parseIntake(text)` orchestrator: rules first; if fields missing AND `enableLlmParserFallback` AND `ANTHROPIC_API_KEY` → LLM fills nulls only (rule values always win). **Never returns null.** |
| `rule-parser.ts` | `parseIntakeRules(text)` — pure, deterministic passes: phone masking → rent (lakh/Rs/k//month//-) → beds/baths → property type (annex→house, titled "Annex") → gazetteer city/district → address heuristic → title composition → description → suspicion. |
| `gazetteer.ts` | 25 districts + ~90 cities/aliases (incl. Sinhala script, Colombo ward numbers). `matchCity` / `matchDistrict`. |
| `scam.ts` | `scoreSuspicion` — additive keyword/heuristic scoring (threshold 3). Replaces the LLM's self-flag; suspicious → manual_review, never auto-replied. |
| `llm-parser.ts` | `parseIntakeWithLlm` — the old Claude parser, now fallback-only. Direct fetch, model `WHATSAPP_INTAKE_MODEL` (default Haiku 4.5). Null on any failure. |
| `types.ts` | `ParsedIntake`, `REQUIRED_FIELDS` (`title, address, city, bedrooms, rentPerMonth`), `parserMeta` diagnostics tag. Dependency-free. |

### Channels — `lib/intake/channels/`

| File | Purpose |
| --- | --- |
| `types.ts` | `ChannelAdapter` contract: `isConfigured`, `verifyWebhookChallenge`, `verifySignature` (timing-safe, raw body), `normalizeInbound` → `NormalizedInboundMessage[]`, `persistMedia` (**must run at webhook time — provider URLs expire**), `sendText`. |
| `registry.ts` | `intakeChannelAdapters` — every registered channel. Currently `[whatsappAdapter]`. |
| `whatsapp/adapter.ts` | The Meta Cloud API adapter: HMAC-SHA256 signature verify, envelope walk (text + image only), hub.challenge handshake. |
| `whatsapp/config.ts` | Env getters for the four `WHATSAPP_*` vars; `isIntakeConfigured()` is the single source of dormancy. |
| `whatsapp/send.ts` | Free-form reply inside the 24h CS window; `[whatsapp:dryrun]` console no-op when unconfigured. |
| `whatsapp/media.ts` | Two-hop Graph download → Supabase `property-images/whatsapp-intake/`; jpeg/png/webp, 5MB cap; null on failure (photos optional). |

### Routes (thin delegates)

- `app/api/whatsapp/webhook/route.ts` — GET = adapter handshake; POST = 503 unconfigured → flag-off ack → 401 bad signature → 400 bad JSON → normalize → persist media → `appendToIntake`. No parsing/decisions here.
- `app/api/cron/process-whatsapp-intakes/route.ts` — Vercel Cron every 2 min (`vercel.json`), `CRON_SECRET` bearer, fail-closed. Delegates to `processSettledIntakes(intakeChannelAdapters)`; returns `{ ok, processed, published, needsInfo, manual }`. URL kept for cron-config stability even though the logic is channel-generic.

### Back office

`app/(dashboard)/back-office/whatsapp-intakes/{page.tsx,actions.ts,intake-actions.tsx}` — triage queue (status/channel badges, sender, photos, failure reason, linked listing) + reject/reprocess actions (`whatsapp_intake_updated` audit). "Reprocess" flips status to `received` for the next cron run.

### Schema / migrations / flags

- `lib/db/schema.ts`: `whatsappIntakes` table (+ `channel` column, default `'whatsapp'`), `whatsappIntakeStatusEnum` (`received|needs_info|published|manual_review|rejected`), `listings.sourceContactName`, audit actions `listing_auto_published` + `whatsapp_intake_updated`.
- Migrations: `0027_whatsapp_intake.sql` (table, applied to prod), `0028_intake_channel.sql` (channel column). Both registered in `run-all-migrations.ts`.
- `lib/feature-flags.ts`: `enableWhatsAppIntake` (default ON), `autoPublishWhatsAppIntakes` (default ON — owner decision), `enableLlmParserFallback` (default OFF).

### Tests

- `tests/unit/{rule-parser,gazetteer,scam}.test.ts` — vitest (`pnpm test:unit`); ~57 table-driven cases: rent shorthands, phone immunity, deposit traps, Sinhala mix, ward numbers/aliases, scam corpus, determinism.
- `e2e/whatsapp-intake.spec.ts` — signed simulated Cloud API payloads; skips without `WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN`/`CRON_SECRET` + `ALLOW_MUTATION`. With `INTAKE_SETTLE_MS=0` on the target it also asserts the full parse→publish path and the needs_info path deterministically.

## Data flow

```
Channel msg (Meta, …) ──POST──▶ /api/{channel}/webhook
                                 │  adapter: verify signature → normalize → download media
                                 ▼
                        whatsapp_intakes row (channel, status=received)
                                 │  (settle 4 min)
                        /api/cron/process-whatsapp-intakes (every 2 min)
                                 │  parseIntake: rules (+LLM fill-ins if flagged) → runIntakeChecks
              ┌──────────────────┼──────────────────────┐
       checks pass          retriable fail          hard fail (scam/dupe)
              ▼                  ▼                        ▼
      create listing       status=needs_info        status=manual_review
      (active|pending)      + reply "need X"          + ops notification
      under Ops identity         │                        │
      + verified contact         └── sender replies ──▶ status=received (reprocess)
              ▼
      reply confirm + ops notify + audit log
```

**Behavior change vs the LLM-only pipeline:** parsing can no longer be "unavailable" — image-only or unparseable messages now get a needs-info reply listing the missing fields instead of silently parking in `manual_review`. `manual_review` remains for suspicion, duplicates, and processing errors.

## Contributor checklist

- **Risks & gotchas:**
  - Feature is DORMANT until `WHATSAPP_*` set + Meta verification. Don't "fix" the 503/no-op.
  - `autoPublishWhatsAppIntakes` ON = strangers' listings go live unreviewed. Kill switch is the flag.
  - Media MUST be downloaded in the webhook (`adapter.persistMedia`) — provider URLs expire in minutes. Moving it to the cron silently breaks photos.
  - The Cloud API number can't also run in the normal WhatsApp app. `NEXT_PUBLIC_WHATSAPP_SUPPORT` (the number every concierge CTA and the footer point at) IS the intake number by design — which means all "support" chats hit the bot; see `docs/whatsapp-golive-runbook.md` → Known limitations.
  - Settle window: new intakes don't process instantly. Tests either backdate `last_message_at` or run the target with `INTAKE_SETTLE_MS=0`.
  - `pnpm db:migrate-all:local` targets port 54323 — that is the WRONG (unrelated) local Supabase; this repo's stack is on 54341–49.
- **To add a parsed field:** extend `ParsedIntake` + `rule-parser.ts` (and the LLM system prompt if the fallback should fill it), then map it in the `listings` insert in `process.ts`. Add to `REQUIRED_FIELDS` only if it should block publish. Add unit cases.
- **To add a check:** `lib/intake/checks.ts`; decide retriable (ask sender) vs non-retriable (ops).
- **To add a channel:** implement `ChannelAdapter` in `lib/intake/channels/<name>/adapter.ts`, add a thin `app/api/<name>/webhook/route.ts`, register in `registry.ts`. The `channel` column keeps sessions and queues isolated per channel.
- **Verification:** `pnpm test:unit` → `pnpm build` → migration on schema touches → `pnpm exec playwright test whatsapp-intake` (with test env; add `INTAKE_SETTLE_MS=0` on the target for full-path assertions) → dormancy check (unset `WHATSAPP_*` → webhook 503, sends dry-run).

## Design patterns

- **Thin webhook / fat worker:** the webhook only persists; the cron reasons. Survives Meta retries and slow processing.
- **Adapter isolation:** all provider wire concerns live in the adapter; the core never sees a Cloud API payload.
- **Rules-first parsing:** deterministic and unit-testable; the LLM is an optional gap-filler, never the authority (rule values win on merge).
- **State machine on a status column:** `whatsapp_intakes.status` drives every decision and the ops queue.
- **Fail closed everywhere:** unconfigured → 503/no-op; bad signature → 401; missing cron secret → 401; processing error → `manual_review` with `failureReason` (never silently dropped).
- **System-identity ownership:** "Easy Rent Operations" owns concierge listings; the real owner is surfaced via `listings.sourceContactName` and a verified contact number.

## 2026-07-28 go-live hardening (pre-Meta-launch review)

An adversarial review before wiring the real number (+94770711939) confirmed 22 defects; all fixed:

- **Parser (`rulesVersion: 2`)**: rent-keyword pass now outranks generic "X per month" (utility amounts can't become rent); daily/nightly/weekly rates, USD amounts, availability years ("from April 2026") and deposit contexts are all excluded from rent; ADDRESS_RE requires number/word separation (ordinals like "1st floor" no longer become addresses) and understands Sinhala combining marks + more street types (drive/crescent/close/පෙදෙස/පටුමග); city matching skips town-named roads ("Negombo Road" ≠ Negombo) and the address-adjacent segment overrides a city mentioned elsewhere; "house with N rooms for rent" stays a house; multi-property messages are detected and routed back to the sender (`multiProperty`) instead of publishing a chimera.
- **Session (`session.ts`)**: all writes serialize under a per-sender `pg_advisory_xact_lock` (album fan-out races lost photos/split sessions); message-id dedup happens BEFORE media download and looks across recent closed sessions (Meta redelivery after publish no longer seeds junk); needs_info sessions reattach for 7 days (was 6h — replies the next morning lost all context); thin follow-ups ("thanks!") within 48h of publish append to the published intake + notify ops instead of spawning a needs_info loop; substantive messages still open a fresh intake (second property).
- **Channels**: document messages with image mime are ingested as photos ("send as file"); video/voice/non-image documents create a session, set `has_unsupported_media` (migration `0029`), and replies append a resend-as-photos note — media-only senders are never met with silence.
- **Robustness**: publish is fail-safe past the point of listing creation (reply/audit/notify failures can no longer flip a published intake to manual_review); failed sender replies notify ops; media/send fetches have AbortSignal timeouts and loud logging; duplicate screen only matches active/pending listings (relisting after expiry is legal); both routes export `maxDuration = 60`.
- **Test seam**: `WHATSAPP_GRAPH_API_BASE` env (like `INTAKE_SETTLE_MS`) lets e2e point media/send at a mock Graph server — the full image path and outbound payloads are now assertable locally. Never set in prod.

## 2026-08-02 live-launch follow-up (`rulesVersion: 3`)

First real production intake exposed a parser gap: a large share of Sri Lankan addresses have **no street-type word at all** ("220/A, Mackwatte, Asgiriya") and ADDRESS_RE demanded one, trapping the sender in a needs-info loop. `extractAddressFallback` (rule-parser.ts) now accepts *house-number, Place, Place* patterns, guarded so amounts ("rent 4,500, negotiable"), years, five-digit numbers, money-keyword contexts, lone digits, and lowercase chat filler can never fabricate an address; a segment exactly equal to a gazetteer city (new `isCityName`) is treated as the city, and "Asgiriya Gampaha"-style tails keep their local part.

## 2026-08-02 (later) — photo follow-ups + download resilience

Live usage exposed two photo problems:

1. **Photos after publish spawned a junk intake.** The publish reply says "Reply here anytime to update it", but a photo album sent after the 🎉 counted as "substantive" → new intake → "we still need: everything". Now: a message with photos but NO new-property text, within 48h of the sender's published intake, **appends the photos to that live listing's gallery** (`attach_media` outcome; session phase 3 also updates `listings.photos` under the sender lock) and replies "📸 Added N photos to <title>". Photos WITH substantive text (caption-style) still open a new intake — that's a second property.
2. **Album downloads failed silently for the sender** (live: 2 of 5 lost). `persistWhatsAppMedia` now retries each Graph hop once (fresh AbortSignal per attempt, 15s/20s timeouts), `appendToIntake` reports `mediaStored`/`mediaFailed`, and the webhook notifies ops on any failure — plus tells the sender when attach-path photos didn't come through (never silent loss).

_Updated by the rule-parser + channel-adapter refactor, 2026-07-13; go-live hardening 2026-07-28; live-launch follow-ups 2026-08-02. Original deep-dive generated 2026-07-10._
