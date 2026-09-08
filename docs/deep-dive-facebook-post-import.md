# Facebook post import

Ops and admin paste a Facebook group/page post URL, the system extracts what it
can, an operator reviews and publishes, and the post's owner gets a WhatsApp
telling them their property is live with a one-tap link to edit or remove it —
the same ending as the WhatsApp intake flow.

Built 2026-09-07. Shipped behind two flags, **both OFF**:

| Flag | Gates |
|---|---|
| `enableFacebookImport` | The Imports screens and every server action |
| `notifyImportedOwners` | The WhatsApp message to the owner |

Rollout steps, the Meta template registration walkthrough and ops signals are in
[`whatsapp-golive-runbook.md`](./whatsapp-golive-runbook.md). The invariants are
recorded in `CLAUDE.md`.

---

## Why it exists

Sri Lankan rental supply lives in Facebook groups. Getting one of those ads onto
Easy Rent previously meant an operator retyping it — roughly ten minutes per
listing, which is the whole reason the supply side stayed thin.

## The uncomfortable part, stated plainly

This republishes someone else's advert text and photos on a commercial
marketplace before they have agreed to anything. The design mitigates that
rather than ignoring it:

- The notification leads with how to remove the listing, and `REMOVE` is a word
  the intake state machine already understands (`DELETE_RE` in
  `lib/intake/command-words.ts`), so a one-word reply lands in the existing
  delete flow rather than a dead end.
- The access link works with no password, so removal is one tap.
- `enableFacebookImport` ships OFF. Switching it on is a decision, not a default.
- `notifyImportedOwners` is a **separate** flag so the marketplace can be seeded
  without cold-messaging several hundred people. A listing can be unpublished; a
  WhatsApp to a stranger cannot be unsent.

---

## What can and cannot be fetched

This is the part that decides the design, so it comes first. Verified against
the live site on 2026-09-07.

| Source | Result | `resolved_via` |
|---|---|---|
| **Our own Page** (`FACEBOOK_PAGE_ID`) | Full text + every attached photo | `graph` |
| Some public page posts | OpenGraph preview: truncated text, one image | `og` |
| **Group posts** | **Login wall. Nothing.** | `manual` |
| Most third-party page posts | Login wall. Nothing. | `manual` |

Meta removed the Groups API on **2024-04-22** (the same removal that makes
outbound Group posting impossible — see
[`deep-dive-social-auto-publish.md`](./deep-dive-social-auto-publish.md)), and
reading a third-party Page's posts needs App Review plus Business Verification
we have not been through. `oembed_post` needs the same review and returns an
embed iframe, not the post text — useless for extraction either way.

**So `resolved_via = 'manual'` is the NORMAL outcome, not an error.** That single
fact shapes the whole feature: the review screen is a **listing editor that
happens to come pre-filled**, not a confirm-what-we-found form. It always offers
a post-text box and the photo uploader, and it explains what happened rather
than showing empty fields with no reason.

The realistic operator workflow for a group post is:

> paste URL → copy the post text from Facebook → **Re-read text** → check the
> fields → upload the photos → **Publish**

About a minute, against ten for retyping.

### Do not "fix" this with a session cookie

The obvious repair — drive a logged-in Facebook session so the HTML is
readable — is wrong twice over. The cookie rotates, so it breaks constantly; and
scraping while authenticated breaches Meta's terms, with **our own publishing
Page** as the thing at risk. The paste path is not a fallback we settled for, it
is the supported path.

---

## SSRF: `parseFacebookUrl` is a guard before it is a parser

An operator pastes a string and **the server dereferences it**. That is the
exact shape of a server-side request forgery: paste
`http://169.254.169.254/latest/meta-data/` and our own credentialed network
position does the fetching.

`lib/imports/facebook/url.ts`:

- **Exact-match host allowlist**, never `endsWith` — which would happily accept
  `facebook.com.evil.com`.
- **Non-http(s) schemes refused**, so `file:`, `gopher:` and `data:` never reach
  the network layer.
- **Credentials in the authority refused.** Parsers disagree about whether the
  host in `https://facebook.com@evil.com/` is facebook.com or evil.com. An
  ambiguity inside an SSRF guard is a failure, so it is rejected outright.
- Returning `null` is the *only* thing that makes a URL fetchable.

`lib/imports/facebook/fetch.ts` follows redirects **by hand**, re-vetting every
hop through the same allowlist. `redirect: 'follow'` would let a facebook.com URL
bounce us to an internal address — the guard has to apply to where we *end up*,
not only to what was pasted. The response body is read under a byte cap, so a
huge document cannot exhaust memory.

No new dependency: the OpenGraph reader is a scoped regex over the document
prefix. Four `<meta>` tags do not justify adding an HTML parser this repo has
never had.

---

## `users.wa_phone` no longer means "verified"

The single most consequential change in this work, and the one to understand
before touching anything that messages a landlord.

Until now the intake pipeline was the **only** writer of `users.wa_phone`, and it
only ever wrote numbers Meta had proven possession of. So `wa_phone IS NOT NULL`
was a fair stand-in for "verified", and `lib/reports/send.ts` relied on exactly
that to decide who may be sent a performance report about their property.

The importer is a **second writer**. It stores the number an owner printed in
their own public advert — genuinely useful for matching their reply, and no
proof of anything. Left on the old test, the reports job would have mailed a
landlord's traffic figures to whoever actually holds a number a stranger typed
into an ad.

Migration `0057` adds **`users.wa_phone_verified_at`**:

| | `wa_phone` | `wa_phone_verified_at` |
|---|---|---|
| WhatsApp intake landlord | set | set — Meta delivered a message from it |
| **Imported owner** | set | **NULL** — nobody has proven it |

- Both `lib/reports/send.ts` (`findCandidates`) and
  `/api/reports/preferences` gate on the **timestamp**. They must not drift.
- The imported owner's `user_contact_numbers` row is `verified: false` — the
  verified badge is a trust signal the marketplace is built on.
- `getOrCreateWhatsAppLandlord` gained `phoneVerified?: boolean`, defaulting to
  **true** so every existing call site is unchanged. The importer passes `false`.

### The claim moment

The number becomes verified at the only moment it honestly can: **when it sends
us a WhatsApp message.** That arrives through the webhook into
`getOrCreateWhatsAppLandlord`'s existing-user branch, which stamps it.

So an imported owner who replies **claims the account already waiting for them**
rather than getting a second one. No merge, no duplicate, and the WhatsApp reply
that proves the number is the same reply that opens the 24-hour window.

**Anything new that messages a landlord must gate on `wa_phone_verified_at`, not
on `wa_phone`.**

---

## The owner notification is business-initiated

Same rule as the scheduled performance reports, and it bites harder here: the
recipient has **never** messaged us — that is the premise of importing their ad.
There is no 24-hour customer-service window, so free-form text is rejected
outright with Meta error **131047**.

- It goes out as an approved template via `sendWhatsAppTemplate`.
- `IMPORT_TEMPLATE_TEXT` in `lib/imports/message.ts` **is the contract** — the
  exact body registered in WhatsApp Manager. A variable count that drifts from
  that file starts failing for every recipient at once with nothing failing
  locally, so `tests/unit/import-template.test.ts` holds the two in agreement.
- **No free-form fallback.** Outside the window it cannot succeed, and repeated
  failed business-initiated sends degrade the WABA quality rating that *every
  other landlord's* messages depend on.
- Parameters carry no newlines, tabs or 5+ spaces, and no declared variable is
  ever empty — Meta rejects the send otherwise. Hence one label per line in the
  template rather than optional blocks.

`dry_run` (no template configured, or notifications switched off) is counted
**apart from** `failed` (WhatsApp rejected it). Reporting unfinished setup as
failure sends ops hunting an outage that does not exist — the same lie as a
social row reading `posted` for a post that was never made. The back-office list
badges it **not sent**.

---

## Publishing

`lib/imports/publish.ts` mirrors the insert block in `lib/intake/process.ts` —
the codebase's pattern for creating a listing without going through
`POST /api/listings`. The two must stay recognisably the same shape or one of
them will quietly stop enqueueing moderation.

Where it deliberately differs from intake:

- The contact number is **`verified: false`** (intake marks it true because Meta
  proved possession).
- The listing **never auto-publishes past moderation**.
  `autoPublishWhatsAppIntakes` is about a landlord submitting *their own*
  property; these are third-party photos and third-party text, so when
  moderation is armed the listing lands `pending` and the sweeper decides.

**Every query is sequential.** On Vercel the pool is `max: 1` against Supabase's
transaction pooler and concurrent queries wedge the request (commit `a3ac4f9`).
`tests/unit/import-template.test.ts` fails if `Promise.all` appears in that file.

Everything after the listing insert is best-effort inside a `try/catch`: the
listing exists and the import row says published, so an audit write, link mint
or message failure must never bubble out and undo that.

---

## The migration replay hazard

`db:migrate-all` **replays every numbered file on every invocation** — there is
no applied-migrations ledger. A migration must be safe to re-run against a
populated production database forever.

The backfill in `0057` has to stamp every pre-existing `wa_phone` row, or those
landlords silently stop receiving reports the moment the new guard lands. But
the naive form:

```sql
UPDATE users SET wa_phone_verified_at = coalesce(updated_at, created_at)
 WHERE wa_phone IS NOT NULL AND wa_phone_verified_at IS NULL;
```

would, on the **next replay**, stamp the unverified rows this feature creates —
quietly promoting scraped numbers to verified ones and undoing the entire point
of the column. It is bounded by a literal cutoff:

```sql
   AND created_at < '2026-09-07'::timestamp;   -- authoring date; never widens
```

Both directions were proven against a live database before this shipped (see
Verification below). **Never widen that date.**

The file contains **no `DO` block**, per the `splitStatements` note in
`CLAUDE.md`: the runner only closes a dollar block on a line that is exactly
`$$;`, so `END $$;` collapses the rest of the file into one statement. Confirmed
correct — the runner reported 9 separate statements.

---

## File inventory

### New

| Path | Role |
|---|---|
| `lib/db/migrations/0057_facebook_imports.sql` | `post_imports`, `users.wa_phone_verified_at`, 3 audit actions, bounded backfill |
| `lib/imports/facebook/url.ts` | SSRF guard + URL classifier |
| `lib/imports/facebook/fetch.ts` | Redirect-vetting fetch, OpenGraph reader, Graph reader |
| `lib/imports/facebook/resolve.ts` | `resolvePost` — graph → og → manual, never throws on refusal |
| `lib/imports/extract.ts` | `parseIntake` + phone sweep + remote image ingest |
| `lib/imports/message.ts` | `IMPORT_TEMPLATE_TEXT` — the Meta contract |
| `lib/imports/notify.ts` | Template send, dry-run accounting, durable in-app copy |
| `lib/imports/publish.ts` | Import → account + listing + contact + notification |
| `app/(dashboard)/back-office/imports/**` | List, new-import, review screen, server actions |
| `tests/unit/facebook-url.test.ts` | 17 cases, mostly about what is refused |
| `tests/unit/import-extract.test.ts` | Extraction wiring + phone candidates |
| `tests/unit/import-template.test.ts` | Template contract + delivery-rule source scans |

### Modified

| Path | Change |
|---|---|
| `lib/db/schema.ts` | `postImports`, `users.waPhoneVerifiedAt`, 3 audit enum values |
| `lib/intake/landlord-identity.ts` | `phoneVerified` flag; the claim moment |
| `lib/reports/send.ts` | Gate on `waPhoneVerifiedAt`, not `waPhone` |
| `app/api/reports/preferences/route.ts` | Same gate, so the settings card cannot promise undeliverable reports |
| `lib/intake/channels/whatsapp/send.ts` | `whatsappTemplateName('import')` |
| `lib/moderation/contact-scrub.ts` | `extractPhoneNumbers` — the mirror of the scrubber |
| `lib/images/store.ts` | `storeImportedImage` under an `imports/` prefix |
| `lib/admin/user-lifecycle.ts` | Clear `postImports.importedBy` on hard delete |
| `components/ui/badge.tsx` | `draft` / `discarded` in the shared status-tone table |
| `app/(dashboard)/back-office/layout.tsx` | Nav entry (the only registry) |
| `lib/feature-flags.ts` | The two flags + UI descriptions |

### Reused, not rebuilt

`parseIntake` · `getOrCreateWhatsAppLandlord` · `getOrCreateOpsIdentity` ·
`mintAccessLink` · `photoCap` / `capPhotos` / `capRejectEntries` ·
`manifestFromLegacyPhotos` / `serializeManifest` · `fetchOriginal` ·
`normalizePhone` · `ImageUploader` · the whole `components/back-office/**` kit.

---

## Data flow

```
operator pastes URL
        │
        ▼
parseFacebookUrl ──► refused (bad host / scheme / credentials) ──► error banner
        │
        ▼
resolvePost:  graph (own Page)  →  og (public preview)  →  manual (login wall)
        │
        ▼
extractFromText → parseIntake (rules [+ LLM]) + extractPhoneNumbers
ingestRemoteImages → fetchOriginal → storeImportedImage        [Facebook CDN
        │                                                       URLs expire, so
        ▼                                                       copy them NOW]
post_imports row (status: draft)
        │
        ▼
REVIEW SCREEN ── operator edits fields, pastes text, uploads photos,
        │         and MUST confirm the owner's phone number
        ▼
publishImport
   ├─ getOrCreateWhatsAppLandlord({ phoneVerified: false })   → account
   ├─ user_contact_numbers (verified: false)                  → contact
   ├─ listings (pending + moderation_status queued, if armed) → listing
   ├─ mintAccessLink                                          → token
   └─ notifyImportedOwner → template | dry_run | failed
        │
        ▼
owner replies on WhatsApp ──► claim moment: wa_phone_verified_at stamped,
                              SAME account, 24h window now open
```

---

## Verification performed

| Check | Result |
|---|---|
| Unit suite | **1351 pass** (37 new), 54 files |
| `tsc --noEmit` | clean |
| `pnpm build` | clean; all 3 import routes present with `revalidate = 30` |
| `db:migrate-all` (local) | 9 statements, all OK — confirms no `DO`-block collapse |
| `db:check-drift` | No drift, 27 tables |
| Migration replay — forward | Pre-existing WhatsApp landlord **is** backfilled → keeps reports |
| Migration replay — hazard | Newly-created unverified row **stays NULL** → scraped numbers stay unproven |
| Full publish pipeline (local DB) | **22 assertions pass** |
| Live Facebook resolution | Group post → `manual`; third-party page → `manual`; `evil.com` → refused before any network call |

The 22 pipeline assertions cover: account created, role `landlord`,
`wa_phone_verified_at` NULL, landlord row, contact number stored and
**unverified**, listing owned by the owner rather than Ops, city/rent/owner-name
correct, contact linked, import marked published and pointing at the listing,
`notify_outcome = 'dry_run'` (not `failed`), the reports job **not** selecting
the landlord, their reply matching the **same** account, the stamp being
written, and reports becoming permissible only afterwards.

### Not verified

**The back-office screens in a browser.** Local sign-in does not work against
this stack, so they need a pass on a Vercel preview deploy.

---

## Two bugs found along the way

### Fixed — `post_imports.imported_by` would have broken hard delete

Caught by the existing `tests/unit/user-lifecycle.test.ts`, which asserts that
every non-cascading FK to `users` is cleared by the eraser. Without the fix,
`hardDeleteUser` on an operator who had imported a post would have died on a
constraint violation **after already destroying that user's listings**. Cleared
in `lib/admin/user-lifecycle.ts`; the column was added to the guard list.

### Not fixed — "hot water" swallows the rent

`UTILITY_BEFORE_RE` in `lib/intake/parser/rule-parser.ts`:

```js
/(?:electricity|current|water|service\s*charge|…)\b[^\d]{0,20}$/i
```

`[^\d]{0,20}` lets the word **water** reach across `\nRent ` to the amount, so an
ad reading:

```
Fully tiled, hot water
Rent 85k per month
```

loses the rent entirely — `rentPerMonth` comes back `null`. Removing the words
"hot water" returns `85000`.

**This affects the live WhatsApp intake, not just the importer.** "Hot water" is
a standard amenity line in Sri Lankan rental ads, so an affected landlord is
asked for the rent they already sent — precisely the failure the intake
conversation-memory rules exist to prevent.

Left out of scope here: fixing it needs a `RULES_VERSION` bump and a
`parser:probe` re-run, and it is tracked as separate work. It is also a fair
illustration of *why* the importer stops at a human before anything publishes.

---

## Ops surface

**Back Office → Imports**, tabs: Awaiting review / Published / Discarded.

- **not sent** badge — the message was never delivered (no template registered,
  or notifications off). Nothing claims a message that was never sent.
- **send failed** badge — WhatsApp rejected it. The listing is live and the owner
  does not know, so contact them another way.
- Audit actions: `post_import_created`, `post_import_published`,
  `post_import_discarded`, plus `listing_created` carrying
  `source: 'facebook_import'` and the source URL.
- A new account raises the ops notification "New landlord account from an
  imported post … (unverified)".

## Rollback

Switch `enableFacebookImport` off. The screens `notFound()` and every action
refuses. Already-imported listings keep working, and imported owners keep their
accounts and their edit links.

---

## Deployment order — not negotiable

`0057` adds `users.wa_phone_verified_at`, and `schema.ts` now names it. Drizzle's
relational queries spell out every column, and `getUser()` reads `users` on every
authenticated request. **If the code ships before the migration, every read of
that table 500s — the whole site, not just this feature.** The feature flags do
not protect against it: the ORM names the column whether they are on or off.
This is the 2026-08-22 outage pattern exactly.

1. `pnpm db:migrate-all` against production
2. `pnpm db:check-drift` — "Done" is not proof; the runner swallows
   `already exists`
3. Confirm existing `wa_phone` rows came out with a non-NULL
   `wa_phone_verified_at`
4. Deploy
5. Register the Meta template, set `WHATSAPP_IMPORT_TEMPLATE`, redeploy
6. `enableFacebookImport` on; import a few with `notifyImportedOwners` still off
7. `notifyImportedOwners` on once someone has read the copy and would be
   comfortable receiving it

---

## Pull request

[#92 — Import a listing from a Facebook post URL](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/92)
· branch `feat/facebook-post-import` · 33 files, +3181 / −17.
