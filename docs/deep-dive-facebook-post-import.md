# Facebook post import

Ops and admin paste a Facebook group/page post URL, the system extracts what it
can, an operator reviews and publishes, and the post's owner gets a WhatsApp
telling them their property is live with a one-tap link to edit or remove it —
the same ending as the WhatsApp intake flow.

Built 2026-09-07, hardened over the following two days once a real run exposed
what needed fixing. **Status as of 2026-09-09**, read directly from production:

| Flag | Production value | Gates |
|---|---|---|
| `enableFacebookImport` | **true** | The Imports screens and every server action |
| `notifyImportedOwners` | **true** | Whether the owner notice is attempted at all |
| `enableListingModeration` | **true** | Whether an imported listing needs a sweeper pass before it is public |

The Meta template the owner notice depends on (`listing_imported_notice`) was
submitted 2026-09-09 and was **In review** as of writing. Until it is approved
**and** `WHATSAPP_IMPORT_TEMPLATE=listing_imported_notice` is set in Vercel, every
notice composes, logs `[imports:dryrun] …`, and records `notify_outcome =
'dry_run'` — importing and publishing both work regardless. See
[Template registration](#template-registration) for why that took two attempts
and a category change.

Rollout steps and ops signals are in
[`whatsapp-golive-runbook.md`](./whatsapp-golive-runbook.md). The invariants are
recorded in `CLAUDE.md` under "Facebook post import (2026-09-07)".

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
- `enableFacebookImport` shipped OFF and `notifyImportedOwners` is a **separate**
  flag, so the marketplace could be seeded without cold-messaging several hundred
  people before either was ever switched on. A listing can be unpublished; a
  WhatsApp to a stranger cannot be unsent. Both are on in production now, by
  deliberate decision, not by default.

---

## What can and cannot be fetched

This is the part that decided the whole design, so it comes first. Verified
against the live site on 2026-09-07, and re-confirmed against the URL from the
first real run on 2026-09-08.

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
we have not been through. `oembed_post` needs the same review and returns an
embed iframe, not the post text — useless for extraction either way.

The first real run (2026-09-08) confirmed this the hard way: pasting a live
group-post URL returned `og:title` holding only the post's **first line**,
`og:description` empty, the post body absent from the 346 KB response entirely,
and exactly **one** image URL in the whole page. No owner name, no phone number,
and only the cover photo — not because anything was broken, but because that is
genuinely all Facebook serves a logged-out request.

**So `resolved_via = 'manual'` is the NORMAL outcome, not an error.** That single
fact shapes the whole feature: the review screen is a **listing editor that
happens to come pre-filled**, not a confirm-what-we-found form. It always offers
a post-text box and the photo uploader, leads with them (see
[Paste-first rework](#paste-first-rework-pr-97)), and explains what happened
rather than showing empty fields with no reason.

The realistic operator workflow for a group post is:

> paste URL → copy the post text from Facebook → **Fill empty fields** → check
> the fields, confirm the phone → add the other photos → **Publish**

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
badges it **not sent**, and separately as **owner notice queued** (`deferred`)
when a listing is still waiting on a moderation pass.

### Template registration

Templates live in a different console from the one that sends them, which is
worth being explicit about because it looks redundant at first glance:

| Console | What lives there |
|---|---|
| **developers.facebook.com** | The Meta **app** — access token, phone number ID, app secret, verify token, webhook URL. This is what `lib/intake/channels/whatsapp/config.ts` reads. |
| **business.facebook.com → WhatsApp Manager** | The **WABA** (WhatsApp Business Account) — phone numbers, messaging limits, quality rating, and **message templates**. Registering `listing_imported_notice` happened here. |
| **graph.facebook.com** | The API that actually sends. Every message this codebase sends — free-form intake replies and approved templates alike — goes to the same endpoint, `{GRAPH_API_BASE}/{PHONE_NUMBER_ID}/messages`, with the same `WHATSAPP_ACCESS_TOKEN`. Nothing about the send path changed for this feature. |

Templates are a property of the WABA, not of the app, so they had to be
registered in Business Manager even though sending one uses the identical Graph
call as everything else. The template could have been created via the Graph API
(`POST /{WABA_ID}/message_templates`) instead of the console — the WABA id is
`2259893277953812` — but the console runs a **pre-submit category classifier**
that the API does not, which is what caught the next problem before submission
rather than days later.

#### Utility was refused, twice

The template was first built for category **Utility**, on the reasoning that it
concerns the recipient's own property and its main purpose is to offer control
over it. Meta's classifier refused it outright — *"This message template will be
rejected"* — with a recommendation to use Marketing instead.

The two lines most likely to read as promotional were cut on the assumption they
were the trigger:

- *"Listing is completely free — we never charge for it"*
- *"We never take a commission"*

**Resubmitted as Utility with those lines removed, and refused again**, word for
word the same warning. That result is the useful one: it proves the objection was
never the wording. Meta defines Utility as a message *"about an existing order or
account"*, and the recipient of this template has neither — that they are not yet
a customer is the entire premise of importing their ad. No rewrite fixes a
category mismatch that is structural.

**Submitted as Marketing** and accepted for review with no warning. Registered
2026-09-09 as `listing_imported_notice`, English, with one **Dynamic** "Visit
website" button based on `https://easyrent.lk/l/` taking the access token as its
`{{1}}` suffix.

The registered body, matching `IMPORT_TEMPLATE_TEXT` exactly:

```
🏠 Easy Rent — your property is now listed

Hi {{1}}, we saw your rental ad for {{2}} in {{3}} on Facebook and listed it on
Easy Rent, a rental marketplace in Sri Lanka.

Tenants will contact you directly on {{4}}.

Tap below to edit the details or take it down — no password needed. Or reply
REMOVE and we'll delete it.
```

("Sri Lanka's rental marketplace" became "a rental marketplace in Sri Lanka" for
the same promotional-sounding reason as the two cut lines — the possessive reads
as a claim to be the only one.)

#### What Marketing costs, and the honest alternative

Marketing is dearer per message than Utility would have been, and — this is the
real cost — **a recipient who has switched off marketing messages never receives
it, with no error**, because Meta accepted the send. That is precisely the
person this message exists to reach. A rejected Utility template would have
reached nobody at all, so Marketing is the better of two options, not a good one.

If delivery disappoints in practice, the fix is not a cleverer template. It is to
stop cold-messaging entirely: post the claim link as a comment on the original
Facebook ad and let the owner message *us* first. That opens the real 24-hour
customer-service window, needs no template of any category, costs nothing per
message, and is a genuine opt-in rather than a business-initiated guess at
consent. That redesign was sketched (see
[Consent-first alternative](#the-consent-first-alternative-not-built) below) but
not built — Marketing shipped instead because it required no new app code.

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
- The owner notice fires from **whichever route actually makes the listing
  public** — see [The premature-notification bug](#the-premature-notification-bug)
  below for why that is a dedicated code path rather than an afterthought.
- Ticking **share on social** at review time records
  `socialConsentAt` / `socialConsentSource: 'ops'` on the listing — see
  [Share-on-social checkbox](#share-on-social-checkbox-pr-97).

**Every query is sequential.** On Vercel the pool is `max: 1` against Supabase's
transaction pooler and concurrent queries wedge the request (commit `a3ac4f9`).
Tests assert `Promise.all` never appears in this file.

Everything after the listing insert is best-effort inside a `try/catch`: the
listing exists and the import row says published, so an audit write, link mint
or message failure must never bubble out and undo that.

---

## Bug fixes after the first real run

The importer was used against a real Facebook post for the first time on
2026-09-08. Five complaints came back, plus two feature requests. Three fixes
landed as separate PRs before the paste-first rework; this section documents
each because they changed real behaviour, not just the review screen.

### The Imports nav offered a page that 404s (PR #94)

The **Imports** entry was hardcoded into the back-office sidebar layout, so it
rendered for every operator whether or not `enableFacebookImport` was on — and
the pages behind it call `notFound()` when the flag is off. With the flag off
(its shipped default), every operator saw a link to a 404. That is a worse
failure than not shipping the link at all: a missing feature reads as intentional,
a broken link reads as a broken site.

The nav could not read the flag because `layout.tsx` was a `'use client'`
component, and feature flags are server-side by design. Fixed by splitting it:
`layout.tsx` is now a server component that authorizes, loads flags and passes
**one boolean** down; `back-office-shell.tsx` holds the entire client UI
(sidebar toggle, active-route highlighting, mobile overlay) unchanged. Only the
Imports entry is conditional.

Two supporting fixes landed alongside it:

- Pages and actions now read the snapshot `loadFeatureFlags()` **returns**
  instead of calling `isFeatureEnabled()` afterwards — the two can disagree for
  up to 30 seconds, since `isFeatureEnabled` reads a per-instance snapshot that
  is stale by design.
- Toggling `enableFacebookImport` now revalidates the back-office layout, so the
  nav updates on the next navigation rather than up to 30 seconds later.

### Two public tables, and the premature-notification bug (PR #95)

Two unrelated defects, found while reviewing the feature's first days in
production, fixed in one PR.

#### `impersonation_sessions` and `post_imports` were public

Measured against production: Supabase grants `anon` full DML on every table in
`public` and relies on **row level security** to gate it. RLS is not enabled
automatically for a table created by a raw SQL migration. 25 of 27 tables had it
on; `impersonation_sessions` (0051) and `post_imports` (0057) did not, and each
granted `anon` `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` with **zero policies**.
The anon key ships in the client bundle by design, so through PostgREST both
tables were readable and writable by anyone who loaded the site.

`impersonation_sessions` was the serious one — the audit trail for an admin
viewing the app as another user, publicly writable. `post_imports` carries owner
phone numbers never published anywhere on the site.

Migration `0058` enables RLS on both and revokes the blanket grants, with **no
policies added** — neither table is reachable from the browser by design, and
the app connects as `postgres`, which owns both and bypasses RLS. Verified after
applying: an insert/select/delete as the app role still succeeds.

#### The premature-notification bug

`publishImport` sent the owner notice unconditionally, while the template says
the property *"is now listed"* and links to it. With `enableListingModeration`
on — its state in production the whole time — every import lands `pending`, so
every owner was told about a listing they could not yet see, and any listing the
checks went on to **hold** was announced and then never appeared at all.

The intake pipeline already drew this line, between `publishedMessage` and
`pendingReviewMessage`, and states why: the "now live" text and its link would
404 for as long as the checks take. The importer copied the publish path but not
the messaging rule.

Fixed by moving the notice to whichever route actually makes the listing public:
immediately from `publishImport` when moderation is disarmed, otherwise from the
moderation sweeper once the listing passes. Both call one resolver,
`notifyImportedOwnerForListing` in `lib/imports/notify.ts`, so the message, the
access link and the `notifiedAt` bookkeeping cannot drift apart. It guards on
`notifiedAt IS NULL`, because the sweeper re-runs whenever a live listing is
re-checked and an owner must not be told twice.

`publishImport` reports a deferred notice as **`deferred`**, never `dry_run` — a
row reading `dry_run` for a message the sweeper is about to send is the same lie
as one reading `sent` for a message never sent.

### Paste-first rework (PR #97)

Three of the five original complaints — truncated text, no owner name, no phone
number, only one photo — share the one cause documented above: Facebook does not
serve more than a headline and a cover photo to a logged-out request. This PR
made the review screen match that reality instead of implying otherwise, plus
fixed two extraction bugs and one bug in the moderation engine that would have
made the new social checkbox silently do nothing.

**Extraction fixes** (`lib/imports/facebook/fetch.ts`):

- `og:title` kept Facebook's own `| Facebook` suffix, which became part of the
  listing title. Stripped now.
- `og:image` was read by a non-global, single-value regex, so a post exposing
  several images yielded one. Now collected in **document order** — running each
  attribute-order pattern to exhaustion instead would silently reorder an album
  and move the cover photo out of first place.

**Re-read now fills empty fields instead of overwriting.** `reExtractAction`
used to replace `parsedPayload` wholesale, discarding every correction an
operator had made, while the button claimed the opposite. Survivable when
re-reading was a repair step; not once pasting-and-re-reading is the primary
flow. Relabelled "Fill empty fields" so the button says what it does.

**Owner name is now optional and labelled as such.** Facebook never gives the
author on the `og` path, and an anonymous post has none at all — a blank was
never a failure. Publish stays gated on the phone number, which is the field
that matters.

**Sale-ad warning.** `publishImport` never runs the intake checks, so a property
listed *for sale* would publish as a rental with nothing to catch it. The review
screen now runs `detectSaleAd` and shows a non-blocking amber note — advisory
only, since an operator can see the original post and the code cannot.

#### The stale-row bug that would have silently defeated the social checkbox

`persist()` in `lib/moderation/engine.ts` handed `notifyModerationOutcome` its
own function **parameter** — the listing row as it was claimed, status still
`pending`, from *before* the transaction that set it `active`. Every downstream
`listing.status` check inside the notifier therefore saw `pending`, and both
social-consent paths (`enqueueIfAlreadyConsented`, `promptForSocialConsent`) bail
on `status !== 'active'`. The social post was never enqueued at go-live, and
nobody was even asked — the consent prompt only ever appeared on a *later*
re-check, once the listing happened to already be live by then.

Fixed by re-reading the listing after the transaction commits and passing the
fresh row to the notifier, falling back to the stale one only if the re-read
itself fails. This repairs the identical latent bug for **web landlords** using
the pre-existing `shareOnSocial` checkbox on the create form — it was never
specific to the importer.

#### Share-on-social checkbox (PR #97)

Unchecked by default on the review screen. Ticking it records
`socialConsentAt: now, socialConsentSource: 'ops'` on the listing at publish
time — deliberately labelled `ops`, not `web`: an operator decided, and the
property's owner was never asked. The screen says so, and the audit entry
(`listing_social_consent_granted`) carries `ownerAsked: false`, so a decision
taken on someone's behalf is legible afterwards rather than inferred from a
source string.

No new enqueue logic was needed — `offerSocialSharing` already routes any
listing carrying `socialConsentAt` to `enqueueIfAlreadyConsented` once it goes
live, and that only worked correctly once the stale-row bug above was fixed.

#### Source badge on the approval screens (PR #97)

An imported listing is attributed to Easy Rent Operations, so without a label it
reads as though the platform wrote it — misleading for the operator approving
third-party photos and third-party text. `lib/imports/origin.ts` (server-only,
Drizzle) and `lib/imports/origin-label.ts` (pure types + copy, safe for client
components) provide a **batched** `importOriginsFor(listingIds)` lookup — one
query per page, never one per row, backed by a new index
(`post_imports_listing_idx`, migration `0059`) on a column that previously had
none. `<ImportOriginBadge>` renders "Imported · Facebook group" / "· Facebook
page" on the listing detail page's publisher block, the moderation queue row and
drawer, and the back-office listings table.

One build-time lesson from this: the badge is used inside `'use client'`
components, so it must import from `origin-label.ts` and never from `origin.ts`
— importing the latter drags the `postgres` driver into the browser bundle
(`Can't resolve 'fs'`), which the production build caught immediately.

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
[Verification performed](#verification-performed)). **Never widen that date.**

The file contains **no `DO` block**, per the `splitStatements` note in
`CLAUDE.md`: the runner only closes a dollar block on a line that is exactly
`$$;`, so `END $$;` collapses the rest of the file into one statement. `0058`
and `0059` follow the same rule — plain `IF NOT EXISTS` DDL throughout.

---

## File inventory

### New

| Path | Role |
|---|---|
| `lib/db/migrations/0057_facebook_imports.sql` | `post_imports`, `users.wa_phone_verified_at`, 3 audit actions, bounded backfill |
| `lib/db/migrations/0058_enable_rls_on_missed_tables.sql` | RLS + revoked grants on `impersonation_sessions` and `post_imports` |
| `lib/db/migrations/0059_import_social_and_listing_index.sql` | `post_imports.share_on_social`, index on `post_imports.listing_id` |
| `lib/imports/facebook/url.ts` | SSRF guard + URL classifier |
| `lib/imports/facebook/fetch.ts` | Redirect-vetting fetch, OpenGraph reader (all `og:image`, suffix-stripped title), Graph reader |
| `lib/imports/facebook/resolve.ts` | `resolvePost` — graph → og → manual, never throws on refusal |
| `lib/imports/extract.ts` | `parseIntake` + phone sweep + remote image ingest |
| `lib/imports/message.ts` | `IMPORT_TEMPLATE_TEXT` — the registered Meta contract |
| `lib/imports/notify.ts` | Template send, dry-run accounting, durable in-app copy, `notifyImportedOwnerForListing` (the single resolver both publish paths call) |
| `lib/imports/publish.ts` | Import → account + listing + contact + social consent + notification |
| `lib/imports/origin.ts` | Server-only: `importOriginsFor` / `importOriginFor` (batched, Drizzle) |
| `lib/imports/origin-label.ts` | Pure types + copy for the origin badge — safe to import from client components |
| `components/back-office/import-origin-badge.tsx` | The "Imported · Facebook group/page" badge |
| `app/(dashboard)/back-office/imports/**` | List, new-import, review screen, server actions |
| `app/(dashboard)/back-office/back-office-shell.tsx` | The client-side sidebar/nav, split out of `layout.tsx` so it can take a server-resolved boolean |
| `tests/unit/facebook-url.test.ts` | URL/SSRF cases + OpenGraph extraction (suffix stripping, multi-image, entity decoding) |
| `tests/unit/import-extract.test.ts` | Extraction wiring + phone candidates |
| `tests/unit/import-template.test.ts` | Template contract, delivery-rule source scans, and the registered-copy pin (promotional phrases must stay absent) |
| `tests/unit/import-review-and-social.test.ts` | Re-read merge behaviour, social-consent recording, the fresh-row fix, batched origin lookups |
| `tests/unit/facebook-import-availability.test.ts` | Nav/flag/route contract for the Imports screen |
| `tests/unit/facebook-import-feature-flag-route.test.ts` | The flag-toggle route only revalidates back-office nav for this one flag |
| `tests/unit/facebook-import-preservation.test.ts` | Authorization precedence, disabled-state concealment, notification independence |

### Modified

| Path | Change |
|---|---|
| `lib/db/schema.ts` | `postImports` (+ `shareOnSocial`), `users.waPhoneVerifiedAt`, `post_imports_listing_idx`, 3 audit enum values |
| `lib/intake/landlord-identity.ts` | `phoneVerified` flag; the claim moment |
| `lib/reports/send.ts` | Gate on `waPhoneVerifiedAt`, not `waPhone` |
| `app/api/reports/preferences/route.ts` | Same gate, so the settings card cannot promise undeliverable reports |
| `lib/intake/channels/whatsapp/send.ts` | `whatsappTemplateName('import')` |
| `lib/moderation/contact-scrub.ts` | `extractPhoneNumbers` — the mirror of the scrubber |
| `lib/moderation/engine.ts` | Re-reads the listing after commit before calling `notifyModerationOutcome` — the stale-row fix |
| `lib/images/store.ts` | `storeImportedImage` under an `imports/` prefix |
| `lib/admin/user-lifecycle.ts` | Clear `postImports.importedBy` on hard delete |
| `components/ui/badge.tsx` | `draft` / `discarded` in the shared status-tone table |
| `app/(dashboard)/back-office/layout.tsx` | Server component now; loads flags, passes one boolean to `back-office-shell.tsx` |
| `app/api/back-office/feature-flags/route.ts` | Revalidates back-office nav when `enableFacebookImport` changes |
| `lib/feature-flags.ts` | The two flags + UI descriptions |
| `docs/whatsapp-golive-runbook.md` | Rollout steps, template registration walkthrough (Marketing, not Utility), migration/drift gates |

### Reused, not rebuilt

`parseIntake` · `getOrCreateWhatsAppLandlord` · `getOrCreateOpsIdentity` ·
`mintAccessLink` · `photoCap` / `capPhotos` / `capRejectEntries` ·
`manifestFromLegacyPhotos` / `serializeManifest` · `fetchOriginal` ·
`normalizePhone` · `detectSaleAd` · `ImageUploader` · the whole
`components/back-office/**` kit.

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
REVIEW SCREEN ── paste-first: post-text box + uploader lead the page.
        │         Operator fills empty fields, confirms the owner's phone,
        │         optionally ticks "share on social".
        ▼
publishImport
   ├─ getOrCreateWhatsAppLandlord({ phoneVerified: false })   → account
   ├─ user_contact_numbers (verified: false)                  → contact
   ├─ listings (pending + moderation_status queued, if armed) → listing
   ├─ share on social ticked → socialConsentAt/'ops' + audit  → consent
   ├─ mintAccessLink                                          → token
   └─ moderation DISARMED → notifyImportedOwnerForListing now
      moderation ARMED    → notify deferred; sweeper sends it once the
                             listing passes (fresh-row re-read; same
                             resolver; enqueues the social post here too)
        │
        ▼
owner replies on WhatsApp ──► claim moment: wa_phone_verified_at stamped,
                              SAME account, 24h window now open
```

---

## Verification performed

Cumulative across PRs #92, #94, #95, #97, #98.

| Check | Result |
|---|---|
| Unit suite | **1427 pass** across all PRs (76 new tests total) |
| `tsc --noEmit` | clean on every PR |
| `pnpm build` | clean; caught the client-bundle Drizzle leak in #97 before merge |
| `db:migrate-all` (local) | `0057` 9 statements, `0058`/`0059` each replay as clean no-ops |
| `db:check-drift` | No drift, 27 tables, after every migration |
| Migration replay — forward | Pre-existing WhatsApp landlord **is** backfilled → keeps reports |
| Migration replay — hazard | Newly-created unverified row **stays NULL** → scraped numbers stay unproven |
| RLS fix (#95) | `rls=true`, `anon` grants empty on both tables; server insert/select/delete unaffected |
| Full publish pipeline (local DB) | 22 assertions (original) + a further pass confirming `socialConsentAt`/`ops` only when ticked, and never otherwise |
| Live Facebook resolution | Group post → `manual`; third-party page → `manual`; `evil.com` → refused before any network call; live multi-image post still yielded exactly one `og:image` (confirms the fix is defensive, not curative) |
| Template registration | Utility refused twice by Meta's own pre-submit classifier (once with promotional lines already removed); Marketing accepted with no warning |

The 22 original pipeline assertions cover: account created, role `landlord`,
`wa_phone_verified_at` NULL, landlord row, contact number stored and
**unverified**, listing owned by the owner rather than Ops, city/rent/owner-name
correct, contact linked, import marked published and pointing at the listing,
`notify_outcome = 'dry_run'` (not `failed`), the reports job **not** selecting
the landlord, their reply matching the **same** account, the stamp being
written, and reports becoming permissible only afterwards.

### Not verified

**The back-office screens end to end in a real browser session with real Meta
delivery.** The 2026-09-08 run was the first live test and is what surfaced the
bug fixes above; there has not yet been a second live run with the fixes and the
approved template both in place, because the template is still in review.

---

## Bugs found along the way

### Fixed — `post_imports.imported_by` would have broken hard delete

Caught by the existing `tests/unit/user-lifecycle.test.ts`, which asserts that
every non-cascading FK to `users` is cleared by the eraser. Without the fix,
`hardDeleteUser` on an operator who had imported a post would have died on a
constraint violation **after already destroying that user's listings**. Cleared
in `lib/admin/user-lifecycle.ts`; the column was added to the guard list.

### Fixed — two public tables (PR #95)

See [Bug fixes after the first real run](#two-public-tables-and-the-premature-notification-bug-pr-95)
above.

### Fixed — the premature-notification bug (PR #95)

See the same section above.

### Fixed — the stale-row bug defeating social consent (PR #97)

See [Paste-first rework](#the-stale-row-bug-that-would-have-silently-defeated-the-social-checkbox)
above.

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

Still out of scope: fixing it needs a `RULES_VERSION` bump and a `parser:probe`
re-run, and it is tracked as separate work. It is also a fair illustration of
*why* the importer stops at a human before anything publishes.

### Not fixed — `listing_performance_report` was never registered either

Found while registering the import template: the WABA's WhatsApp Manager showed
only `hello_world` (Meta's own sample) before `listing_imported_notice` was
added. `REPORT_TEMPLATE_TEXT` in `lib/reports/message.ts` has been ready since
2026-08-31, but nobody had actually submitted it to Meta — so the weekly
landlord performance reports feature has been dry-running silently the entire
time it has been live, with `enableLandlordReports` presumably reporting
`deliveryConfigured: false` the whole way through. Separate piece of work, same
registration process documented here.

---

## The consent-first alternative (not built)

A different session sketched a redesign during this work: rather than importing
and notifying in one step, an import would sit in a new `awaiting_consent` status
until the owner **sends a claim code first** — `LIST <token>` to a `wa.me` deep
link posted as a comment under their own ad. That inbound message is the opt-in,
it opens the real 24-hour service window, and after that the existing intake flow
takes over unchanged. A migration for it
(`post_imports.claim_token` / `claim_sent_at` / `claimed_at` / `claim_from_number`
plus a `CHECK` making `listing_id` unrepresentable before a claim) was drafted
but never applied — applying it as written would have broken every import in
production, because `publishImport` sets `listing_id` without ever setting
`claimed_at`.

This is a genuinely better design for the consent question, and it would have
sidestepped the entire Marketing-vs-Utility problem, since a reply-triggered
message needs no template at all. It was not built because it is a different
product shape (no listing exists until the owner replies, which kills the
"seed the marketplace in bulk" use case) and needs the Graph API comment step,
which cannot be automated on posts we do not own — a manual step per ad. Revisit
if Marketing delivery rates disappoint in practice; see
[What Marketing costs](#what-marketing-costs-and-the-honest-alternative) above.

---

## Ops surface

**Back Office → Imports**, tabs: Awaiting review / Published / Discarded.

- **owner notice queued** badge (`deferred`) — the listing is still `pending`;
  the sweeper will send the notice once it passes.
- **not sent** badge (`dry_run`) — composed and logged, never delivered: no
  approved template registered, or notifications switched off. Nothing claims a
  message that was never sent.
- **send failed** badge — WhatsApp rejected it. The listing is live and the owner
  does not know, so contact them another way.
- A persistent banner on the Imports list and review screen when
  `isIntakeConfigured() && !whatsappTemplateName('import')`, so the silence has a
  visible reason rather than none.
- A source badge — "Imported · Facebook group/page" — on the listing detail page,
  the moderation queue, and the back-office listings table.
- Audit actions: `post_import_created`, `post_import_published`,
  `post_import_discarded`, `listing_social_consent_granted` (`ownerAsked: false`
  when set from the review screen), plus `listing_created` carrying
  `source: 'facebook_import'` and the source URL.
- A new account raises the ops notification "New landlord account from an
  imported post … (unverified)".

## Rollback

Switch `enableFacebookImport` off. The screens `notFound()`, every action
refuses, and the nav entry disappears immediately (the flag-toggle route
revalidates back-office navigation). Already-imported listings keep working, and
imported owners keep their accounts and their edit links.

---

## Deployment order — not negotiable

`0057` adds `users.wa_phone_verified_at`, and `schema.ts` now names it. Drizzle's
relational queries spell out every column, and `getUser()` reads `users` on every
authenticated request. **If the code ships before the migration, every read of
that table 500s — the whole site, not just this feature.** The feature flags do
not protect against it: the ORM names the column whether they are on or off.
This is the 2026-08-22 outage pattern exactly, and it applies identically to
`0058` (`impersonation_sessions`, `post_imports` RLS) and `0059`
(`post_imports.share_on_social`).

1. `pnpm db:migrate-all` against production
2. `pnpm db:check-drift` — "Done" is not proof; the runner swallows
   `already exists`
3. Confirm existing `wa_phone` rows came out with a non-NULL
   `wa_phone_verified_at`
4. Deploy
5. Register the Meta template as **Marketing** (Utility will be refused — see
   [Template registration](#template-registration)), set
   `WHATSAPP_IMPORT_TEMPLATE`, redeploy
6. `enableFacebookImport` on; import a few with `notifyImportedOwners` still off
7. `notifyImportedOwners` on once someone has read the approved copy and would
   be comfortable receiving it — **both flags are already on in production as of
   2026-09-09**, ahead of the template being approved, so notices are dry-running
   until the template clears review and the env var is set

---

## Pull requests

| PR | What it did |
|---|---|
| [#92](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/92) | Import a listing from a Facebook post URL — the original build |
| [#93](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/93) | Document the Facebook post import — this file's first version |
| [#94](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/94) | Stop the Imports nav offering a page that 404s |
| [#95](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/95) | Close two public tables, and stop announcing listings that are not live yet |
| [#97](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/97) | Make the importer a paste-first tool, and label what it produces |
| [#98](https://github.com/gayanSandamal/stay-rental-supabase-boilerplate/pull/98) | Match the owner notice to what Meta actually approved |

(#96, "Stop publishing a listing when someone asks for one," landed the same day
and touches the same intake pipeline, but is a WhatsApp **tenant-search** safety
fix rather than importer work — see its own PR description.)

---

## What's left

1. **Wait for `listing_imported_notice` to clear Meta review** (submitted
   2026-09-09, Marketing category).
2. **Set `WHATSAPP_IMPORT_TEMPLATE=listing_imported_notice` in Vercel and
   redeploy** once approved.
3. **Verify one real import end to end** with the approved template — the
   2026-09-08 run predates every fix in this document, and there has not yet
   been a second live run.
4. **Register `listing_performance_report`** with Meta — same process, unrelated
   feature, discovered as a side effect of doing this one.
5. **Fix the "hot water" rent-parsing bug** — affects live WhatsApp intake, not
   only the importer.
6. **Reconsider the consent-first design** if Marketing-category delivery rates
   turn out to be poor in practice.
