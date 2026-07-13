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
| `process.ts` | The "brain": `processSettledIntakes(adapters)` + `processIntake(intake, adapter)`. Parse → checks → publish/needs_info/manual_review state machine. `SETTLE_MS` (10 min; `INTAKE_SETTLE_MS` env is a test seam) batches multi-message bursts. |
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
- `app/api/cron/process-whatsapp-intakes/route.ts` — Vercel Cron every 10 min (`vercel.json`), `CRON_SECRET` bearer, fail-closed. Delegates to `processSettledIntakes(intakeChannelAdapters)`; returns `{ ok, processed, published, needsInfo, manual }`. URL kept for cron-config stability even though the logic is channel-generic.

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
                                 │  (settle 10 min)
                        /api/cron/process-whatsapp-intakes (every 10 min)
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
  - The Cloud API number can't also run in the normal WhatsApp app — intake number ≠ `NEXT_PUBLIC_WHATSAPP_SUPPORT`.
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

_Updated by the rule-parser + channel-adapter refactor, 2026-07-13. Original deep-dive generated 2026-07-10._
