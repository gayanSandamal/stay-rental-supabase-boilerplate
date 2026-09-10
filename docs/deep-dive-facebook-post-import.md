# Facebook post import

Ops and admin paste a Facebook group/page post URL. The system extracts what it
can, and an operator reviews it — but pressing the button no longer publishes
anything. It **asks the owner** over WhatsApp whether we may list their
property, with a link to preview exactly what would go live. Their reply is
what creates the listing, or deletes everything we extracted.

Built 2026-09-07, then rebuilt from opt-out to **opt-in** on 2026-09-09 once it
became clear the opt-out's escape hatch never actually reached anyone. **Status
as of 2026-09-10**, read directly from production:

| Flag | Production value | Gates |
|---|---|---|
| `enableFacebookImport` | **true** | The Imports screens and every server action |
| `notifyImportedOwners` | **true** | Whether the consent ask AND the go-live notice are attempted at all |
| `enableListingModeration` | **true** | Whether an imported listing needs a sweeper pass before it is public |

Two Meta templates gate delivery, both category **Marketing** (see
[Template registration](#template-registration)):

| Template | Env var | Sent | Purpose |
|---|---|---|---|
| `listing_consent_request` | `WHATSAPP_CONSENT_TEMPLATE` | Before anything is public | "May we list your property?" — the ask |
| `listing_imported_notice` | `WHATSAPP_IMPORT_TEMPLATE` | After a YES, once the listing goes live | "It's live" — the go-live notice |

`WHATSAPP_IMPORT_TEMPLATE` was submitted and its registration is documented
below; `WHATSAPP_CONSENT_TEMPLATE`'s registration is **not yet written up** in
[`whatsapp-golive-runbook.md`](./whatsapp-golive-runbook.md) — that runbook
still only names the go-live notice. Whoever registers the consent template
should follow the same walkthrough and expect the same Marketing-not-Utility
result, since the underlying reason (the recipient is not yet a customer)
applies at least as strongly to a first-contact ask as to a go-live notice.

Without either template set, both steps compose, log `[imports:dryrun] …`, and
record their outcome as `dry_run` — importing and reviewing still work, nothing
is ever silently marked as sent.

Rollout steps and ops signals are in
[`whatsapp-golive-runbook.md`](./whatsapp-golive-runbook.md). The invariants are
recorded in `CLAUDE.md` under "Facebook post import (2026-09-07)".

---

## Why it exists

Sri Lankan rental supply lives in Facebook groups. Getting one of those ads onto
Easy Rent previously meant an operator retyping it — roughly ten minutes per
listing, which is the whole reason the supply side stayed thin.

---

## The importer is opt-in (2026-09-09 redesign)

This is the change that matters most in the feature's history, so it comes
before the mechanics.

### What was wrong with opt-out

The original design (#92) published the listing on operator review and told the
owner afterwards, with "reply REMOVE" as the escape hatch — defensible only as
long as removal really was one tap away for everyone it happened to. It was not:
the owner-notice function was wired into exactly **one** of the (eventually)
four paths that make a listing `active` (see [#100 below](#every-path-to-active-owes-the-owner-their-notice-pr-100)),
so an operator approving an import by hand — the normal case — published the
property and told the owner **nothing, permanently**. `post_imports.notified_at`
stayed null forever; no job ever re-read the row. An opt-out model whose opt-out
never arrives is just publishing someone's property without asking.

### The redesign (PR #101)

An operator's review no longer publishes anything. It sends the owner
`listing_consent_request` — a WhatsApp template asking whether we may list
their property and share it on Easy Rent's own Facebook, Instagram and TikTok
pages, with a link to a read-only preview of exactly what would go live. **Their
YES is what creates the listing.**

- **Silence is a no, with no timeout that publishes anyway.** An unanswered
  import stays `awaiting_consent` forever, and that is the *expected* terminal
  state for most of them — people do not reply to businesses they have never
  heard of. The importer stopped being a way to seed the marketplace in bulk
  and became a way to recruit landlords who actively said yes.
- **`post_imports.consent_granted_at` is the sole authorisation**, and
  `assertImportConsent` in `lib/imports/consent.ts` is the single gate —
  checked inside `publishImport`, the one function that inserts the listing
  row, rather than spread across the four screens that can reach it. The bug
  this replaced was a *missing call site*; a permission check spread across
  callers fails the identical way, except the failure publishes a stranger's
  property instead of staying silent about it. It **throws** (`ImportConsentError`)
  rather than returning a boolean, so a caller that ignores the result still
  cannot publish.
- **One reply covers the website and social both**, because the template names
  all three platforms by name. That is what makes a single YES real consent,
  and it is why `socialConsentSource` is now `'whatsapp'`, not `'ops'` — `'ops'`
  was the honest label only while nobody had actually been asked.
- **The preview link mints no session.** `/l/<token>` resolves **consent**
  tokens before access tokens (the approved template's button base is baked in
  at Meta and cannot differ), and forwards to `/preview/<token>`
  (`app/preview/[token]/page.tsx`), which renders straight from `post_imports`
  — **never** from `listings`, because no listing row exists yet and nothing
  the marketplace queries can surface it. Signing someone in before they have
  agreed to anything would be the wrong default. The token stops resolving the
  instant they answer either way, so a stale link in a chat thread 404s rather
  than lingering as a view of a decision already made.
- **A NO really deletes.** `declineImportConsent` wipes `raw_text`,
  `parsed_payload`, `photo_urls` and `owner_name` — the message promised "we
  will delete everything we hold", so it has to be true. The row survives only
  as a tombstone (`status: 'declined'`), which is what makes `already_asked`
  possible: the same advert cannot be re-imported and the same person cannot be
  asked twice.
- **The consent reply is free-form; the go-live notice stays a template.**
  The YES message itself is the landlord opening the 24-hour service window —
  we are inside it by definition when the webhook handles it. The go-live
  notice that follows may not be: moderation can hold the listing for hours
  after the YES, so it stays an approved template on every path that can send
  it.

### The consent state machine

`lib/intake/commands.ts` adds `confirm_import` next to the existing
`confirm_social`, with the same fall-through rule: an unrecognised reply clears
the pending state and falls through to ordinary command handling (`DELETE`,
`HELP`, …) rather than swallowing it, because this person has never messaged us
before and holding their thread hostage to an unsolicited question would be the
wrong trade.

The asymmetry between the two answers is deliberate:

- **YES must be unambiguous** (`isAffirmative`, the same strict check the social
  prompt uses) — it creates a real listing from someone's advert.
- **NO or silence both land in the same place.** A no costs only a listing that
  was never ours to make, so there is no reason to demand a precise "no" the
  way a "yes" is demanded.

`lib/imports/consent.ts` — the module:

```ts
export const IMPORT_CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class ImportConsentError extends Error {}
export function assertImportConsent(record): void
export async function requestImportConsent(record, opsUserId): Promise<{ outcome; previewUrl }>
export async function resolveConsentToken(token): Promise<PostImport | null>
export async function grantImportConsent(importId): Promise<PostImport | null>  // idempotent
export async function declineImportConsent(importId): Promise<void>
```

Thirty days, not the social prompt's 24 hours — deliberately far longer,
because it can afford to be: silence never publishes anything, so a stale
pending state costs nothing, while an *expired* one costs a genuine yes typed a
fortnight late. Past the TTL a reply falls through to ordinary intake handling
and an operator picks it up from the queue instead.

**Webhook wiring** (`app/api/whatsapp/webhook/route.ts`): on `import_consent_granted`,
`grantImportConsent` stamps the permission (idempotent — a double tap or a Meta
redelivery is a no-op, logged and silently ignored) and, on success,
`publishImport` runs synchronously in the same request, with the reply message
varying on whether the listing went live immediately or is queued for
moderation. **If `publishImport` throws after consent was granted, the
permission still stands** — it was freely given and must not be silently
discarded — ops gets a notification to finish it by hand, and the owner is told
their listing is being processed. On `import_consent_declined`,
`declineImportConsent` wipes the row and a confirmation goes out.

### The preview page

`app/preview/[token]/page.tsx` — `dynamic = 'force-dynamic'`, `robots: { index:
false, follow: false, nocache: true }`. Renders title, rent, bedrooms,
bathrooms, location and up to 6 photos straight from the unpublished
`post_imports` row, plus a fixed explanation of what listing means (direct
tenant contact, possible social sharing, free, removable any time by replying
REMOVE). It mutates nothing on GET — same rule as the access-link route it sits
next to.

### Why the invite-comment path exists alongside this

`lib/imports/invite.ts`, added the next day (#102), is a second, better route to
the same consent — see [The invite comment](#the-invite-comment-the-actual-answer)
below. The push-a-template ask above was worth building anyway because it works
for posts an operator has already captured text and photos from by pasting; the
invite comment is worth having *in addition* because a Marketing template
silently reaches nobody who has opted out of marketing messages, while someone
who messages first has opted in unmistakably.

---

## What can and cannot be fetched

This is the part that decided the whole extraction design, so it comes early.
Verified against the live site on 2026-09-07, and re-confirmed against a real
multi-photo post from the first live run on 2026-09-08.

| Source | Result | `resolved_via` |
|---|---|---|
| **Our own Page** (`FACEBOOK_PAGE_ID`) | Full text + every attached photo | `graph` |
| Some public page posts | OpenGraph preview: **first line only**, one image | `og` |
| **Group posts** | **Login wall. Nothing.** | `manual` |
| Most third-party page posts | Login wall. Nothing. | `manual` |

Meta removed the Groups API on **2024-04-22** (the same removal that makes
outbound Group posting impossible — see
[`deep-dive-social-auto-publish.md`](./deep-dive-social-auto-publish.md)), and
reading a third-party Page's posts needs App Review plus Business Verification
we have not been through.

The first live run confirmed this the hard way: pasting a live group-post URL
returned `og:title` holding only the post's first line, `og:description` empty,
the post body absent from a 346 KB response entirely, and exactly **one** image
URL in the whole page. `metaContentAll` has collected every `og:image` in
document order since #97, and a real multi-photo post *still* yielded exactly
one — confirming the limit is Facebook's, not a parsing bug (see
[Extraction-losses fixes](#extraction-losses-pr-102) for the three real bugs
that made the limit look worse than it is).

**So `resolved_via = 'manual'` is the NORMAL outcome, not an error.** The review
screen is a **listing editor that happens to come pre-filled**, not a
confirm-what-we-found form. It leads with the post-text box and the uploader,
and explains what happened rather than showing empty fields with no reason.

### Do not "fix" this with a session cookie

The obvious repair — drive a logged-in Facebook session so the HTML is
readable — is wrong twice over. The cookie rotates, so it breaks constantly; and
scraping while authenticated breaches Meta's terms, with **our own publishing
Page** as the thing at risk. The paste path is not a fallback settled for, it is
the supported path — and since #102, so is the invite-comment path below, which
sidesteps the scrape question entirely by asking the owner to send the advert
themselves.

---

## SSRF guards, plural

`lib/imports/facebook/url.ts` is a guard before it is a parser: an operator
pastes a string and **the server dereferences it**. Two separate allowlists now
exist, added at different times for different inputs:

- **The post-URL allowlist** (#92) — exact-match hostnames
  (`facebook.com`, `www.facebook.com`, …), never `endsWith`, which would accept
  `facebook.com.evil.com`. Credentials in the authority (`user@host`) are
  refused as ambiguous. `fetchAllowlisted` re-vets **every redirect hop** —
  `redirect: 'follow'` would let a facebook.com URL bounce to an internal
  address.
- **The photo-CDN allowlist** (#102) — added because #102 let an operator
  **paste image URLs directly**, and Facebook's photo CDN spreads across
  per-datacentre hostnames (`scontent-lhr8-1.xx.fbcdn.net`,
  `scontent.fcmb1-2.fna.fbcdn.net`, …) that an exact-match list cannot cover.
  The suffix test is deliberately `.fbcdn.net` **with the leading dot** —
  `endsWith('fbcdn.net')` alone would accept `evil-fbcdn.net`. Pasted-URL
  fetches go through `fetchPastedImage`, which allowlists this and re-vets
  redirects the same way; `fetchOriginal` (a bare `fetch` with
  `redirect: 'follow'`) stays safe to use elsewhere only because its inputs
  always came from an already-allowlisted document, never operator-typed text.

Both response bodies are read under a byte cap, so a huge document cannot
exhaust memory. No new dependency for either: the OpenGraph reader is a scoped
regex over the document prefix.

---

## `users.wa_phone` no longer means "verified"

The single most consequential change from the original build, and still the
one to understand before touching anything that messages a landlord.

Until this feature the intake pipeline was the **only** writer of
`users.wa_phone`, and it only ever wrote numbers Meta had proven possession of.
So `wa_phone IS NOT NULL` was a fair stand-in for "verified", and
`lib/reports/send.ts` relied on exactly that to decide who may be sent a
performance report about their property.

The importer is a **second writer**. It stores the number an owner printed in
their own public advert — genuinely useful for matching their reply, and no
proof of anything on its own. Left on the old test, the reports job would have
mailed a landlord's traffic figures to whoever actually holds a number a
stranger typed into an ad.

Migration `0057` adds **`users.wa_phone_verified_at`**:

| | `wa_phone` | `wa_phone_verified_at` |
|---|---|---|
| WhatsApp intake landlord | set | set — Meta delivered a message from it |
| **Imported owner** | set | **NULL** — nobody has proven it, until they reply |

`getOrCreateWhatsAppLandlord` gained `phoneVerified?: boolean`, defaulting to
**true** so every existing call site is unchanged; the importer passes `false`.
The imported owner's `user_contact_numbers` row is `verified: false` — the
verified badge is a trust signal the marketplace is built on.

### The claim moment

The number becomes verified at the only moment it honestly can: **when it sends
us a WhatsApp message.** Since the opt-in redesign, that moment now arrives
*before* any listing exists — the consent reply itself lands in
`getOrCreateWhatsAppLandlord`'s existing-user branch (via `publishImport`) and
stamps it. So an imported owner who says YES **claims the account already
waiting for them** rather than getting a second one. No merge, no duplicate.

**Anything that messages a landlord must gate on `wa_phone_verified_at`, not on
`wa_phone`.**

---

## Template registration

Templates live in a different console from the one that sends them, worth being
explicit about because it looks redundant at a glance:

| Console | What lives there |
|---|---|
| **developers.facebook.com** | The Meta **app** — access token, phone number ID, app secret, webhook URL. `lib/intake/channels/whatsapp/config.ts` reads this. |
| **business.facebook.com → WhatsApp Manager** | The **WABA** — phone numbers, quality rating, and **message templates**. Both `listing_consent_request` and `listing_imported_notice` were registered here. |
| **graph.facebook.com** | The API that actually sends. Every message this codebase sends — free-form intake replies and both approved templates alike — goes to the same endpoint, `{GRAPH_API_BASE}/{PHONE_NUMBER_ID}/messages`, with the same `WHATSAPP_ACCESS_TOKEN`. Nothing about the send path differs between templates and free-form replies. |

Templates are a property of the WABA, not of the app. The WABA id is
`2259893277953812`; a template could be created via
`POST /{WABA_ID}/message_templates` instead of the console, but the console
runs a **pre-submit category classifier** that the API does not — which is what
caught the next problem before submission rather than days later.

### Utility was refused, twice — for `listing_imported_notice`

The go-live notice was first built for category **Utility**, reasoning that it
concerns the recipient's own property. Meta's classifier refused it outright —
*"This message template will be rejected"* — recommending Marketing.

Two lines thought most likely to read as promotional were cut on the
assumption they were the trigger (*"Listing is completely free — we never
charge for it"*, *"We never take a commission"*), and it was **resubmitted as
Utility with those lines removed, and refused again**, word for word the same
warning. That second result is the useful one: it proves the objection was
never the wording. Meta defines Utility as a message *"about an existing order
or account"*, and the recipient has neither — that they are not yet a customer
is the entire premise of importing their ad. No rewrite fixes a category
mismatch that is structural, and the same reasoning applies to
`listing_consent_request` — if anything more strongly, since it is a
first-contact message.

**Submitted as Marketing**, accepted for review with no warning. Registered
2026-09-09 as `listing_imported_notice`, English, one **Dynamic** "Visit
website" button based on `https://easyrent.lk/l/` taking the access token as
its `{{1}}` suffix.

The registered body:

```
🏠 Easy Rent — your property is now listed

Hi {{1}}, we saw your rental ad for {{2}} in {{3}} on Facebook and listed it on
Easy Rent, a rental marketplace in Sri Lanka.

Tenants will contact you directly on {{4}}.

Tap below to edit the details or take it down — no password needed. Or reply
REMOVE and we'll delete it.
```

### `listing_consent_request` — the ask, three variables not four

Added with the opt-in redesign. `CONSENT_TEMPLATE_TEXT` in `lib/imports/message.ts`
declares **three** variables, not four, even though it is structurally the same
shape as the notice: `composeTitle()` already writes the town into the title
(*"3BR House in Nugegoda"*), so a separate `{{city}}` variable would have
rendered *"…for 3BR House in Nugegoda in Nugegoda"* — a real send would have
duplicated the town. The title alone identifies the property to the one person
who wrote the advert, so the redundant variable is gone rather than
deduplicated in code: a variable that only *sometimes* duplicates another is a
bug waiting for the title format to change underneath it.

```
🏠 Easy Rent — may we list your property, free of charge?

Hi {{1}}, we found your rental advert for {{2}} on Facebook. We would like to
list it on Easy Rent, a rental marketplace in Sri Lanka, and share it on our
Facebook, Instagram and TikTok pages.

It is completely free. We never charge landlords anything, and we never take
a commission.

Nothing is published yet — tap below to see exactly how your listing would
look.

Reply YES and we will publish it. Reply NO and we will delete everything we
hold. If you do not reply, we will not publish it.

Tenants would contact you directly on {{3}}. Your number is never shown on our
social posts.
```

Same button base as the notice (`https://easyrent.lk/l/` + token) — the route
is shared, but a **consent** token resolves to the read-only preview and mints
no session, while an **access** token signs the landlord in.

Note this template *keeps* the two lines cut from the notice — *"It is
completely free… we never take a commission"* — because at the ask stage they
are simply true and reassuring rather than promotional-sounding filler; Meta's
classifier objected to the notice on structural grounds (Utility vs Marketing),
never to that specific copy. There is no record yet of this template having
been through registration; its category should be assumed Marketing by default
per the reasoning above, and confirmed when it is actually submitted.

### What Marketing costs, and the honest alternative

Marketing is dearer per message than Utility would have been, and — the real
cost — **a recipient who has switched off marketing messages never receives
it, with no error**, because Meta accepted the send. That is precisely the
person these messages exist to reach. A rejected Utility template would have
reached nobody at all, so Marketing is the better of two options, not a good
one.

The honest alternative — stop cold-messaging entirely, post the claim link as
a Facebook comment and let the owner message *us* first — was sketched as
"not built" in this document's previous version. **It is built now**: see
[The invite comment](#the-invite-comment-the-actual-answer).

---

## Publishing

`lib/imports/publish.ts` mirrors the insert block in `lib/intake/process.ts` —
the codebase's pattern for creating a listing without going through
`POST /api/listings`. `publishImport` is now called from exactly one place in
the whole codebase: the webhook, after a YES.

```ts
export async function publishImport(record: PostImport, opsUserId: number): Promise<PublishResult>
```

1. `assertImportConsent(record)` — throws `ImportPublishError` if
   `record.status === 'published'` already, or `ImportConsentError` if
   `consentGrantedAt` is unset. **This is the first line of the function.**
2. Required-field check (title, city, bedrooms, rent, phone) — re-validated
   here even though `publishImportAction` (now really "ask" action) checked it
   too, because this is the function the database actually trusts.
3. `getOrCreateWhatsAppLandlord({ phoneVerified: false })`, falling back to the
   ops identity.
4. `user_contact_numbers` row, scoped correctly, `verified: false`.
5. Photo cap applied; manifest built if moderation is armed or photos were
   dropped.
6. The listing insert — `description: importDescription(...)` (see below),
   `status: 'pending'` if moderation is armed else `'active'`, and
   `socialConsentAt`/`socialConsentSource: 'whatsapp'` if `shareOnSocial` was
   ticked — `'whatsapp'`, not `'ops'`, since 0060: the consent template named
   all three platforms, so `assertImportConsent` having already proven the YES
   arrived means the owner really was asked.
7. Best-effort follow-up in a `try/catch`: audit logs, social enqueue if
   already live, the go-live notice if already live (`deferred` if not — the
   sweeper sends it later), and an ops notification.

Where it deliberately still differs from intake, unchanged since #92: the
contact number is `verified: false` (intake marks it true because Meta proved
possession), and the listing never auto-publishes past moderation —
`autoPublishWhatsAppIntakes` is about a landlord submitting their own property,
not a third-party scrape.

**Every query is sequential.** On Vercel the pool is `max: 1` against Supabase's
transaction pooler and concurrent queries wedge the request (commit `a3ac4f9`).
Tests assert `Promise.all` never appears in this file.

### The description is no longer amputated at 400 characters

`importDescription(composed, rawText)` — new in #102. The listing insert used
to run the parsed description through `composeDescription`, which calls
`truncateDescription` in `rule-parser.ts`: a hard 400-character clip with an
ellipsis, sensible for a WhatsApp landlord's own rambling text, silent
amputation for an advert whose `raw_text` is stored **in full**
(`post_imports.raw_text` is unbounded `text`). This is what an operator
reported as "the caption gets cut in the middle."

Fixed in the importer, not the shared parser — `rule-parser.ts` also serves
live WhatsApp intake, so widening the clip there would need a `RULES_VERSION`
bump and a `parser:probe` re-run for a change that only matters here.
`importDescription` prefers the whole advert whenever the composed description
is merely its prefix (detected by string comparison, ellipsis-tolerant); an
operator's own rewrite is recognised the same way and always wins outright,
since they can see the original post and the code cannot.

The fallback to the full text is **scrubbed** with an empty allow-list
(`scrubContactNumbers(full, [])`) — publishing more of the advert means
publishing the part that carries the phone number, an imported number is
`verified: false` by definition, and `moderateListing` only scrubs descriptions
when moderation is *armed*; with it disarmed this insert goes straight to
`active` and nothing else would ever look at the text again.

---

## Bug fixes after the first real run

### Every path to `active` owes the owner their notice (PR #100)

A listing reaches `active` **four** ways: `publishImport` with moderation
disarmed, the moderation sweeper, `publishAnywayAction` in Back Office →
Moderation, and a `PATCH` to `/api/listings/[id]`. Only the first two ever
called `notifyImportedOwnerForListing`. An ops override or a routine PATCH
could publish an imported listing and tell its owner **nothing, permanently** —
`post_imports.notified_at` stays null and no job re-reads the row on its own.

`reconcileMissedAnnouncements` made this worse rather than better: it stamped
`landlord_notified_at` on any listing with **no intake row** and moved on — true
and correct before the importer existed (nobody to tell), false once an
imported owner is owed the approved notice. It now tries the import notice
first, before writing the listing off as one nobody needed telling.

Fixed by adding the same call, `notifyImportedOwnerForListing(listingId)`, to
the two missing paths (`app/(dashboard)/back-office/moderation/actions.ts`,
`app/api/listings/[id]/route.ts`). The function's own `notifiedAt IS NULL`
guard already made it idempotent, so all four call sites can make the
identical call safely. Tests assert the call site exists on each path — the
defect was a *missing call*, which no amount of mocking the notification sender
itself would have caught.

`pnpm imports:notify-owners` (`scripts/notify-imported-owner.ts`) is the
one-off repair tool for listings that were already published without a notice
before this fix landed. It **refuses to run** when `notifyImportedOwners` is
off or the template is unset, rather than dry-running: `notifyImportedOwner`
stamps `notified_at` on *every* outcome including `dry_run`, so running the
backfill in that state would mark every affected owner as told while sending
nobody anything — with no second chance, since the stamp is what stops the tool
finding the row again. It resolves flags straight from the `feature_flags`
table rather than importing `lib/feature-flags-store.ts`, because that module
pulls in `server-only`, which throws in a plain `tsx` process. List mode (no
arguments) is read-only.

### Two public tables, and the premature-notification bug (PR #95)

*(Predates the opt-in redesign; kept for history.)*

- `impersonation_sessions` and `post_imports` had RLS disabled with full `anon`
  DML grants and zero policies — measured against production, 25 of 27 tables
  had RLS on, these two did not. Migration `0058` enables it and revokes the
  grants, with no policies added, since neither table is reachable from the
  browser by design.
- `persist()` in `lib/moderation/engine.ts` handed `notifyModerationOutcome`
  its own stale function parameter — the listing row as claimed, status still
  `pending`, from before the transaction that made it `active`. Every
  downstream status check inside the notifier saw `pending`, so the social
  consent enqueue never fired at go-live. Fixed by re-reading the listing after
  the transaction commits.

### Paste-first rework (PR #97)

*(Predates the opt-in redesign; still accurate for the review-screen UX.)*

- `og:title` kept Facebook's `| Facebook` suffix — stripped.
- `og:image` was read by a single-value regex — now collects every match in
  document order via `metaContentAll`.
- Re-read used to overwrite `parsedPayload` wholesale, discarding operator
  edits while the button claimed to keep them — now fills only empty fields.
- Owner name became optional and clearly labelled — Facebook never gives an
  author on the `og` path, and an anonymous post has none.
- A non-blocking sale-ad warning was added (`detectSaleAd`), since
  `publishImport` never runs the intake checks and a property "for sale" would
  otherwise publish as a rental.
- The source badge (`lib/imports/origin.ts` / `origin-label.ts`,
  `<ImportOriginBadge>`) was added to the listing detail page, the moderation
  queue and the back-office listings table, with a batched per-page lookup
  backed by a new index (`post_imports_listing_idx`, migration `0059`).

### Extraction losses (PR #102)

Reported again on 2026-09-10: an import of a multi-photo post still gave one
photo, a caption cut mid-sentence, no phone number, no owner name. **Three of
those four are the OpenGraph limit above, confirmed still true, not a
regression.** The fourth, and the reason the other three looked worse than they
are, was three bugs of our own stacked on top of Facebook's real limit.

#### The paste was silently discarded

The single biggest fix. The post-text `<textarea>` lived inside the
**re-extract** `<form>`; Save and Publish submitted a **different** form, and
neither wrote `rawText`. An operator who pasted the whole advert and pressed
**Save draft** — a completely natural sequence — lost every word of it, and the
phone-candidate chips (recomputed from the *stored* `rawText` on every render)
stayed empty too. It read as extraction failing; it was the paste never being
saved. **This single bug reproduced three of the four reported symptoms at
once.**

Fixed with a hidden `rawText` mirror carried into the Save/Publish form.
`keepRawText` — the helper that decides what to write — uses `||`, not `??`, so
a submission that omits the field (an older client, a partial POST) can never
blank text that is already stored. `tests/unit/import-extraction-losses.test.ts`
guards the whole chain.

#### A meta tag died on an apostrophe

`metaContent`'s regex was `content=["']([^"']*)["']`, which stops at the
**first** quote character inside the value — so an og:description reading *"the
owner's annex"* truncated exactly at the apostrophe. `metaContent` now
delegates to `metaContentAll` so the single-value and multi-value readers
cannot drift apart again — they already had, twice, which is why one function
now backs both.

#### `PHONE_PATTERNS` had diverged from the parser's own copy

`lib/moderation/contact-scrub.ts`'s comment always allowed for this
duplication, and it had grown out of step: dots, parentheses, Unicode dashes
and the `00`-prefix form now read, and digit-boundary assertions stop
`0771234567890` from being confidently misread as `+94771234567`. The
**two-character separator cap is load-bearing** — an unbounded separator run
would turn `"Rs. 25,000 - 0112345678"` into a single fabricated
`+94000112345`. Widening this further is a separate change that needs its own
probe pass, same rule as the shared rule-parser.

`preferMobile` now picks which extracted number becomes the consent recipient,
rather than written order: a Sri Lankan advert lists a landline first about as
often as a mobile, and the consent ask can only ever travel over WhatsApp —
`already_asked` refuses a second attempt, so spending the one ask on a number
that structurally cannot receive WhatsApp wastes it permanently.

#### Photos: choosable cover, and the cap moved to publish time

Pasted image URLs now go through `ingestPastedImageUrls` /
`fetchPastedImage`, using the `.fbcdn.net` allowlist described above rather
than a bare follow-any-redirect fetch. The listing photo cap moved from ingest
time to publish time: `ingestRemoteImages` used a bare `break` once the cap was
hit, so over-cap photos were never stored, never reached the manifest, and
vanished with nothing recording that they had — and which photos survived
depended on arrival order, not on anything an operator chose. The review screen
now lets an operator pick the cover photo, and `INGEST_HARD_LIMIT` is an abuse
ceiling on ingest (deliberately generous), separate from the product-facing
photo cap enforced at publish.

`extractOwnerName` (`lib/imports/extract.ts`) also reads a name from labelled
text in the pasted advert ("Owner: Nimal", "Contact: Nimal") when the OpenGraph
path gave none.

#### The invite comment: the actual answer

`lib/imports/invite.ts`. Given that no amount of extraction recovers bytes
Facebook never sends, the real fix is to stop trying to take the advert and
ask for it instead.

```ts
export function inviteReference(importId: number): string        // "FB-41"
export function parseInviteReference(text): number | null
export function inviteWhatsAppLink(importId): string | null       // prefilled wa.me link
export function inviteCommentText(importId): string                // the comment to paste
```

An operator pastes `inviteCommentText(importId)` as a **comment on the original
Facebook post** — composed here, posted by hand, because commenting on a
post we do not own hits the identical App Review gate as reading one, and this
follows the same "Facebook Group draft" pattern already established for
outbound social posting (see `deep-dive-social-auto-publish.md`). The comment
is written to be read by the advert's own prospective tenants: it says who Easy
Rent is, what it wants and what it costs, in the first two lines, and it never
implies anything has already been done with the property.

The reference is deliberately **not a secret** — `FB-41` is short enough to
survive being read off a phone screen and retyped, and it authorises nothing on
its own; it only lets ops match an inbound "this is my property" message to the
draft it makes redundant. `app/api/whatsapp/webhook/route.ts` parses
`INVITE_REFERENCE_RE` out of an inbound message and, when found, only
**notifies ops** — it must never swallow the message itself, because the
message *is* the real submission, arriving through the ordinary intake pipeline
with full text, every photo, a real name, and a phone number Meta has now
proven. This channel produces everything the scrape cannot, by the only route
that actually gets it, and it is better consent than the template push: a
recipient who messages first has opted in unmistakably, opens the real 24-hour
window, and costs nothing per message — none of which is true of a Marketing
template someone may never even see.

---

## The migration replay hazard

`db:migrate-all` **replays every numbered file on every invocation** — there is
no applied-migrations ledger. A migration must be safe to re-run against a
populated production database forever.

`0057`'s backfill had to stamp every pre-existing `wa_phone` row as verified,
without ever promoting a row this feature itself creates:

```sql
UPDATE users SET wa_phone_verified_at = coalesce(updated_at, created_at)
 WHERE wa_phone IS NOT NULL
   AND wa_phone_verified_at IS NULL
   AND created_at < '2026-09-07'::timestamp;   -- authoring date; never widens
```

`0060` inherits the same discipline for a different fact: it must never claim
consent that was never given. Its own comment states the rule directly —
rows published under the old opt-out model keep `consent_granted_at` **NULL**,
which correctly reads as "never asked." Recording anything else there would be
a lie the column exists specifically to prevent, and the publish *gate* only
guards new inserts, so leaving existing rows alone disturbs nothing already
live.

`0057` through `0060` all contain **no `DO` block**, per the `splitStatements`
note in `CLAUDE.md`: the runner only closes a dollar block on a line that is
exactly `$$;`, so `END $$;` collapses the rest of the file into one statement.
Plain `IF NOT EXISTS` DDL throughout.

---

## File inventory

### `lib/imports/`

| Path | Role |
|---|---|
| `facebook/url.ts` | Post-URL SSRF allowlist + `.fbcdn.net` photo-CDN allowlist + URL classifier |
| `facebook/fetch.ts` | Redirect-vetting fetch, `metaContentAll` (every `og:*` tag, apostrophe-safe, document order), `metaContent` now delegates to it, Graph reader |
| `facebook/resolve.ts` | `resolvePost` — graph → og → manual, never throws on refusal |
| `extract.ts` | `parseIntake` + phone sweep + `extractOwnerName` + `ingestRemoteImages` + `ingestPastedImageUrls`/`fetchPastedImage` |
| `message.ts` | `IMPORT_TEMPLATE_TEXT` + `CONSENT_TEMPLATE_TEXT` — both registered Meta contracts, plus their param builders |
| `consent.ts` | `assertImportConsent`, `requestImportConsent`, `resolveConsentToken`, `grantImportConsent`, `declineImportConsent` — the opt-in gate |
| `notify.ts` | `notifyImportedOwnerForListing` — the single resolver every go-live path calls |
| `publish.ts` | `publishImport` (consent-gated), `importDescription` (full-text fallback, scrubbed) |
| `origin.ts` / `origin-label.ts` | Server-only batched lookup / pure client-safe types for the source badge |
| `invite.ts` | The Facebook-comment invite: reference id, wa.me link, comment text |

### Other new/changed files, by PR

| PR | Path | Change |
|---|---|---|
| #100 | `app/(dashboard)/back-office/moderation/actions.ts` | `publishAnywayAction` now calls `notifyImportedOwnerForListing` |
| #100 | `app/api/listings/[id]/route.ts` | PATCH-to-active now calls it too |
| #100 | `lib/moderation/notify.ts` | `reconcileMissedAnnouncements` tries the import notice before writing a listing off |
| #100 | `scripts/notify-imported-owner.ts` | `pnpm imports:notify-owners` — one-off repair tool, refuses to dry-run |
| #101 | `lib/db/migrations/0060_import_owner_consent.sql` | `awaiting_consent`/`declined` statuses, 5 consent columns, partial index |
| #101 | `app/l/[...slug]/route.ts` | Resolves consent tokens before access tokens |
| #101 | `app/preview/[token]/page.tsx` | The read-only, session-less, unindexed preview |
| #101 | `app/api/whatsapp/webhook/route.ts` | `import_consent_granted` / `import_consent_declined` handling |
| #101 | `lib/intake/commands.ts`, `lib/intake/session.ts` | `confirm_import` conversation state, fall-through rule |
| #101 | `lib/intake/messages.ts` | Consent-flow reply copy |
| #101 | `lib/reserved-slugs.ts` | `/preview` reserved |
| #102 | `app/(dashboard)/back-office/imports/[id]/review-form.tsx` | The `rawText` fix, cover-photo choice, invite-comment UI (copy button) |
| #102 | `app/(dashboard)/back-office/imports/actions.ts` | `addPhotoUrlsAction` (pasted image URLs), `keepRawText` |
| #102 | `lib/moderation/contact-scrub.ts` | `PHONE_PATTERNS` hardened, `preferMobile` |

### Reused, not rebuilt

`parseIntake` · `getOrCreateWhatsAppLandlord` · `getOrCreateOpsIdentity` ·
`mintAccessLink` · `photoCap`/`capPhotos`/`capRejectEntries` ·
`manifestFromLegacyPhotos`/`serializeManifest` · `fetchOriginal` ·
`normalizePhone` · `detectSaleAd` · `scrubContactNumbers` · `isAffirmative`/
`isCancel` (the confirm_social pattern, reused verbatim for confirm_import) ·
`ImageUploader` · the whole `components/back-office/**` kit.

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
extractFromText → parseIntake + extractPhoneNumbers + extractOwnerName
ingestRemoteImages / ingestPastedImageUrls → storeImportedImage
        │
        ▼
post_imports row (status: draft)
        │
        ▼
REVIEW SCREEN ── paste text / paste image URLs / choose cover photo /
        │         confirm phone (preferMobile-ranked) / tick share-on-social /
        │         copy the invite comment to paste under the original post
        ▼
"Publish" button  ⟶  actually calls requestImportConsent
        │
        ▼
listing_consent_request sent  →  status: awaiting_consent  (SILENCE = forever)
        │                                                   no listing exists
        ▼
owner replies "YES" (free-form, opens 24h window)     owner replies "NO"
        │                                                   │
        ▼                                                   ▼
grantImportConsent (idempotent)                    declineImportConsent
        │                                          (wipes raw_text, parsed_payload,
        ▼                                           photo_urls, owner_name — tombstone)
publishImport
   assertImportConsent() ── throws if ungranted
   ├─ getOrCreateWhatsAppLandlord({ phoneVerified: false })   → account
   ├─ user_contact_numbers (verified: false)                  → contact
   ├─ listings (pending + moderation_status queued, if armed) → listing
   ├─ shareOnSocial ticked → socialConsentAt/'whatsapp'       → consent
   ├─ mintAccessLink                                          → edit/delete token
   └─ moderation DISARMED → listing_imported_notice sent now
      moderation ARMED    → deferred; sweeper sends it once the
                             listing passes (notifiedAt IS NULL guard,
                             same call from all 4 go-live paths)

                    OR, bypassing all of the above:

operator pastes inviteCommentText() under the original Facebook post
        │
        ▼
owner messages Easy Rent directly, "FB-41" in the text
        │
        ▼
ordinary WhatsApp intake pipeline — full text, every photo, real name,
Meta-proven number, genuine opt-in, no template needed
```

---

## Verification performed

Cumulative across every PR touching this feature.

| Check | Result |
|---|---|
| Unit suite | **1506 pass** (63 files) as of 2026-09-10 |
| `tsc --noEmit` | clean on every PR |
| `pnpm build` | clean; caught a client-bundle Drizzle leak in #97 before merge |
| `db:migrate-all` (local) | `0057`–`0060` each replay as clean no-ops |
| `db:check-drift` | No drift after every migration |
| Migration replay — `wa_phone_verified_at` | Pre-existing rows backfilled; newly-created unverified rows stay NULL |
| Migration replay — `consent_granted_at` | Pre-0060 published rows correctly stay NULL, never retroactively "consented" |
| RLS fix (#95) | `anon` grants empty on both tables; server reads/writes unaffected |
| Template registration | Utility refused twice by Meta's own classifier for the notice (once with promotional copy already removed); Marketing accepted with no warning |
| Consent idempotency | `grantImportConsent` returns `null` on a second call for the same import; no duplicate listing |
| Production data (2026-09-10) | 1 import genuinely `awaiting_consent`, 5 `published` (pre-0060, opt-out era), 1 `discarded`, 1 `draft` |

### Not verified

**A full opt-in cycle in production with both templates approved.** As of this
writing `WHATSAPP_IMPORT_TEMPLATE` was registered and its approval status is
tracked in the runbook; `WHATSAPP_CONSENT_TEMPLATE`'s registration is not yet
documented anywhere in the repo, so the ask side of the flow is presumed to
still be dry-running in production regardless of the `notifyImportedOwners`
flag being on.

---

## Bugs found along the way, still open

### "Hot water" swallows the rent

`UTILITY_BEFORE_RE` in `lib/intake/parser/rule-parser.ts` lets the word
**water** reach across a line break to a rent figure, so an ad reading "Fully
tiled, hot water / Rent 85k per month" loses the rent entirely.
**This affects live WhatsApp intake, not only the importer.** Needs a
`RULES_VERSION` bump and a `parser:probe` re-run; tracked as separate work.

### `listing_performance_report` was never registered

Found while registering `listing_imported_notice`: WhatsApp Manager showed only
Meta's own `hello_world` sample before this feature's templates were added.
`REPORT_TEMPLATE_TEXT` in `lib/reports/message.ts` has been ready since
2026-08-31, but nobody had submitted it — the weekly landlord performance
reports have been dry-running silently since they shipped. Same registration
process documented above.

### `WHATSAPP_CONSENT_TEMPLATE` registration is undocumented

The runbook covers `listing_imported_notice` in detail and does not yet mention
`listing_consent_request` at all, despite `CLAUDE.md` and the env-var list
already naming it as required. Whoever registers it should expect the same
Marketing-not-Utility outcome for the same structural reason, and should update
the runbook with that template's walkthrough alongside the existing one.

---

## Ops surface

**Back Office → Imports**, tabs now track the opt-in lifecycle: Draft / Awaiting
review / **Awaiting consent** / Published / **Declined** / Discarded.

- Publishing a review now reads as an **ask**, not a publish — the redirect
  after pressing the button is `?asked=<outcome>`, not `?published=<outcome>`.
- `already_asked` error — pressing the button twice on the same import is
  refused, because a second ask is how a stranger's polite silence becomes
  harassment, and it burns WABA quality on a recipient who has already
  effectively declined by not answering.
- The invite-comment text is one click away to copy on the review screen —
  the "actual answer" per #102, available alongside the template ask rather
  than instead of it.
- **owner notice queued** badge (`deferred`) — the listing is `pending`; the
  sweeper will send the go-live notice once it passes.
- **not sent** badge (`dry_run`) — composed and logged, never delivered.
- **send failed** badge — WhatsApp rejected it.
- Audit action `post_import_published` is reused with a `metadata.step`
  discriminator (`consent_requested` / `consent_granted` / `consent_declined`)
  rather than three new enum values — no schema change was needed for the
  consent lifecycle's audit trail.
- A source badge — "Imported · Facebook group/page" — on the listing detail
  page, the moderation queue, and the back-office listings table.

## Rollback

Switch `enableFacebookImport` off. The screens `notFound()`, every action
refuses, and the nav entry disappears immediately. Already-imported listings
keep working, and imported owners keep their accounts and their edit links. An
import stuck in `awaiting_consent` simply stays there — nothing about the flag
being off changes what a consent token resolves to, since `/l/<token>` and the
preview page do not gate on it.

---

## Deployment order — not negotiable

Every migration in this feature (`0057`–`0060`) adds columns `schema.ts` names
explicitly, and Drizzle's relational queries name every column whether the
gating flag is on or off. **If the code ships before the migration, every read
of the affected table 500s — the whole site, not just this feature.** This is
the 2026-08-22 outage pattern, and it applies identically to `0060`'s five new
`post_imports` columns.

1. `pnpm db:migrate-all` against production
2. `pnpm db:check-drift`
3. Deploy
4. Register both templates as **Marketing** (Utility will be refused — see
   [Template registration](#template-registration)); set
   `WHATSAPP_CONSENT_TEMPLATE` and `WHATSAPP_IMPORT_TEMPLATE`; redeploy
5. `enableFacebookImport` on; ask a few with `notifyImportedOwners` still off
   to confirm the review screen and the ask-vs-publish copy read correctly
6. `notifyImportedOwners` on once someone has read both approved templates and
   would be comfortable receiving them — **all three flags are already on in
   production as of 2026-09-10**, so both the ask and the notice are live the
   moment their templates clear review and the env vars are set

---

## Pull requests

| PR | What it did |
|---|---|
| [#92](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/92) | Import a listing from a Facebook post URL — the original build |
| [#93](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/93) | Document the Facebook post import |
| [#94](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/94) | Stop the Imports nav offering a page that 404s |
| [#95](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/95) | Close two public tables, and stop announcing listings that are not live yet |
| [#97](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/97) | Make the importer a paste-first tool, and label what it produces |
| [#98](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/98) | Match the owner notice to what Meta actually approved |
| [#99](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/99) | Bring the deep-dive up to date with #94–#98 |
| [#100](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/100) | Tell an imported owner their listing is live, whichever path published it |
| [#101](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/101) | Ask an advert's owner before listing their property — the opt-in redesign |
| [#102](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/102) | Stop losing the operator's paste, and the rest of the imported advert with it |

(#96, "Stop publishing a listing when someone asks for one," landed alongside
this work and touches the same intake pipeline, but is a WhatsApp
**tenant-search** safety fix rather than importer work.)

---

## What's left

1. **Register `listing_consent_request` with Meta** and document the
   walkthrough in the runbook — currently only the go-live notice is written
   up.
2. **Confirm `listing_imported_notice`'s approval status** and that
   `WHATSAPP_IMPORT_TEMPLATE` is actually set in Vercel.
3. **Run one full opt-in cycle end to end in production** with both templates
   approved — there has not yet been a live test of ask → YES → publish → notice
   with real Meta delivery on both templates.
4. **Register `listing_performance_report`** — unrelated feature, same gap,
   discovered as a side effect of this work.
5. **Fix the "hot water" rent-parsing bug** — affects live WhatsApp intake, not
   only the importer.
6. **Watch consent rates.** If `listing_consent_request` sees poor reply rates
   (the expected failure mode for any Marketing template), the invite-comment
   path is the fallback that was built specifically to route around it — worth
   making more prominent in the ops workflow if that turns out to be the norm
   rather than the exception.
