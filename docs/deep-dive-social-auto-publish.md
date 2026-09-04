# Social auto-publish

Posting a published listing to **Easy Rent's own** Facebook Page, Instagram and
TikTok accounts, with the landlord's per-listing consent.

Everything here is gated behind `enableSocialAutoPublish`, which defaults **OFF**.

---

## What can and cannot be automated

This is the part that decides the design, so it comes first.

| Target | Publish | Delete | Notes |
|---|---|---|---|
| **Facebook Page** | ✅ API | ✅ API | The only target we can also take down programmatically. |
| **Instagram** | ✅ API | ❌ none | Carousel, up to 10 images. Takedown is a manual job. |
| **TikTok** | ⚠️ API, gated | ❌ none | Unaudited apps post **SELF_ONLY** (private), ≤5 creators/24h. |
| **Facebook Group** | ❌ **impossible** | — | Meta removed the Groups API on **2024-04-22**. |

**Facebook Groups cannot be posted to by any application.** The Groups API and
the `publish_to_groups` permission were removed in Graph API v19.0 and deleted
from all versions 90 days later. Browser-extension tools that still claim to do
it drive a logged-in session and breach the platform terms. Group posts are
therefore modelled as **drafts**: the worker builds the caption, stores it with
status `skipped`, and notifies ops to paste it. Modelling it as an adapter rather
than a special case keeps the worker uniform and keeps the Group post tracked,
attributed and auditable like the rest.

Two further platform constraints shape the image handling:

1. **Instagram accepts JPEG only.** Our derived photos are WebP
   (`lib/images/store.ts` writes `…-w.webp`).
2. **TikTok only pulls images from a domain verified in its developer portal.**
   `*.supabase.co` is not ours to verify.

Both are solved by one thing: **`app/api/social/img/[listingId]/[index]`**, a
public route on our own domain that transcodes to JPEG on the fly. Its prefix,
`https://<domain>/api/social/img/`, is what gets verified with TikTok.

It also normalises every image to a single **1080×1350 (4:5)** canvas, letterboxed
on brand dark `#062C2B`. That is not cosmetic: Instagram rejects ratios outside
4:5–1.91:1 **and applies the first carousel image's ratio to every slide**, so
without one fixed canvas the publish either fails or crops houses out of frame.
`contain` over `cover` because letterboxing a property photo beats cropping it.

The route serves **`active` listings only** — a pending, held or archived
listing's photos are never reachable through it, even by a platform that already
has the URL.

---

## Consent

Asked **per listing**, never remembered. A landlord may be happy to advertise an
empty annex widely and not the house they still live in.

`socialPromptedAt` is a **delivery record**, not an intent record — stamped only
when a prompt actually reached the landlord. That is what lets
`reconcileMissedSocialPrompts` tell "we never managed to ask" from "we asked and
they ignored it", the same distinction migration `0035` introduced for go-live
announcements after a real incident.

### WhatsApp landlords

The prompt is a **separate message** sent right after the 🎉 go-live text, and
only if that text actually sent. Buttons when `enableWhatsAppRichReplies` is on,
plain "Reply YES" text otherwise — the copy carries both, so the text path is
both the flag-off path and the send-failure fallback.

The reply is handled by a new `confirm_social` conversation state.
`intake_conversations.state` is a plain `text` column, so this needed no
migration.

> **`confirm_social` is the only pending state that FALLS THROUGH.**
>
> Every other pending state (`delete_pick`, `delete_confirm`, `confirm_city`)
> returns unconditionally once it matches, which is correct for a mid-task
> prompt — any reply belongs to it. The consent question is different: it is
> unsolicited, it arrives seconds after "your listing is live", and it stays open
> for **24h** (vs. the 15-minute `PENDING_TTL_MS` used for destructive prompts).
> Returning on anything but yes/no would swallow DELETE, HELP and LINK for that
> whole window and break the promise `deleteDoneMessage` makes to every landlord.
>
> So an unrecognised reply clears the prompt and falls through to
> `detectCommand`. **Silence declines** — the safe default for permission to
> publish. `tests/unit/social-consent.test.ts` pins this.

Known limitation: `intake_conversations` holds one row per (channel, sender). A
landlord who types DELETE while a consent prompt is pending loses the prompt.
That is the correct trade — deletion always wins — and the consent simply lapses.

### Web landlords

WhatsApp is not an option: only intake landlords have a verified `wa_phone`, and
Meta's 24-hour customer-service window (error `131047`) has long closed for
someone who signed up on the website. Instead:

1. A **checkbox on the listing form** (`shareOnSocial`), default unchecked. Since
   the form is filled per listing, this satisfies "ask every listing" — but note
   it lands at *creation*, before publish. Consent is stored and the posts are
   queued later by `enqueueIfAlreadyConsented`.
2. A **one-click CTA** on the go-live in-app notification for anyone who left it
   unticked.

Both go through `POST /api/listings/[id]/social-consent` (owner or ops only).

### Every path that publishes must offer

A listing first goes live in three places, and all three call the offer:

- `lib/moderation/notify.ts` — the moderation sweeper
- `app/api/listings/[id]/route.ts` PATCH — ops manual approve
- `app/(dashboard)/back-office/moderation/actions.ts` — `publishAnywayAction`

Plus `POST /api/listings` for a listing created straight into `active`, which
never passes through a publish transition at all.

---

## The queue

`listing_social_posts`, **one row per (listing, platform)**. Not a JSON map on
`listings`: each network has its own lifecycle, remote id, retry budget and
failure mode, and concurrent workers claiming a shared JSON column would lose
updates. The unique `(listing_id, platform)` index **is** the enqueue
idempotency — a replayed webhook or a second consent is a no-op.

The sweeper (`/api/cron/publish-social`, every 5 min) copies
`lib/moderation/engine.ts`: `FOR UPDATE SKIP LOCKED` + a 5-minute lease, so
overlapping runs never double-post and a killed run self-heals with no reaper.
`SOCIAL_MAX_ATTEMPTS = 3`, plus a wall-clock run budget.

> **Gotcha, and it bit during development:** a raw `db.execute` returns the
> database's own **snake_case** column names. `RETURNING *` cast to the row type
> gives `undefined` for every camelCase field. Claim with `RETURNING id` and
> re-read through the query builder — exactly what `claimListings` does.

Failure handling:

| Failure | Behaviour |
|---|---|
| Token expired (Graph `190`) | Non-retriable → `failed` + one ops notification |
| Permission missing (`200`/`294`) | Non-retriable — no retry fixes an unreviewed permission |
| Rate limited | Row returns to `queued` and the attempt is **refunded** |
| IG 24h quota | Checked via `content_publishing_limit` *before* building containers |
| Listing no longer `active` | `skipped` — never publish a URL that 404s |

Audit rows use `logAudit` with `userId: … ?? undefined`, **not**
`logListingAction(…, ?? 0)`. `audit_logs.user_id` is nullable but FK-constrained,
so the usual `?? 0` fallback violates the FK and the row is silently dropped —
which would leave no audit trail for intake listings, the exact ones this feature
targets.

---

## Takedown

A landlord who removes their listing must not stay on our Instagram. Every exit
from `active` calls `pullDownForListing`:

- the WhatsApp DELETE flow (`app/api/whatsapp/webhook`)
- ops status changes (`PATCH /api/listings/[id]`)
- the purge cron — **before** the row is deleted, since
  `listing_social_posts` cascades and the remote ids would be lost forever

Facebook is deleted outright. Instagram and TikTok have no delete endpoint, so
the row is marked `pulled` with `REMOVE BY HAND` and ops get a notification plus
the permalink. **The UI says so explicitly** — claiming a takedown we did not
perform would be worse than not offering the button at all.

---

## Captions

`lib/social/caption.ts` is pure and unit-tested. Per-platform shaping: Instagram
caps at 2,200 chars / 30 hashtags **and renders URLs as unclickable text**, so it
gets "Link in bio — search EZR{id}" instead of a bare URL. TikTok titles cap at
~90 chars.

> **A caption must never carry a phone number.** The product routes renters to
> the listing page, where contact numbers are verified, rate-limited and revealed
> deliberately. Publishing a landlord's personal number to a public feed is
> permanent, reaches an audience they never agreed to, and bypasses every one of
> those controls. `stripContactDigits` scrubs the landlord's free-text
> description (the realistic source of a stray number) and is deliberately
> blunt — a false positive costs a number in a caption, a false negative leaks a
> mobile. `tests/unit/social-caption.test.ts` asserts no dialable digit run
> survives on any platform.

---

## Setup

Code-side setup is just env vars (see `.env.example`). The long poles are not
code and should be started first — expect weeks:

- **Meta**: app + Business Verification + App Review for `pages_manage_posts` and
  `instagram_business_content_publish`; Instagram converted to a Professional
  account and linked to the Page.
- **TikTok**: developer app, Content Posting API access, **URL-prefix
  verification** for `https://<domain>/api/social/img/`, the **redirect URI**
  registered for `/api/social/tiktok/callback`, and the audit submission (needs
  a demo video). Then link the account with **Connect TikTok** in Back Office →
  Social. Keep `socialPublishTikTok` OFF until the audit clears — before then
  every post is private.

### TikTok is the only platform a deploy cannot finish

Meta's credentials **are** env vars: paste `FACEBOOK_PAGE_ACCESS_TOKEN` and the
platform is live. TikTok's tokens rotate (access ~24h, refresh replaced on every
use), so they cannot live in the environment — the app has to be able to rewrite
them. They are obtained once through OAuth, stored in `social_accounts`, and
refreshed in place by the adapter from then on.

That makes linking the account a **human click**, not a deploy step:

> **Back Office → Social → Platform configuration → Connect TikTok**

which starts the admin-only flow at `/api/social/tiktok/connect`. Before it can
succeed, the redirect URI shown next to that button must be registered verbatim
in the TikTok developer portal — the panel prints it precisely because a
mismatch here is the classic setup failure, and TikTok reports it only as a
rejected authorization code.

**PKCE is mandatory, and TikTok's flavour of it is non-standard.** Omitting
`code_challenge` fails the authorize call outright — `errCode=10007`,
`error_type=code_challenge` — before a consent screen is ever shown (observed
against the live endpoint 2026-09-04). And the challenge is the SHA-256 of the
verifier **hex-encoded**, not base64url as RFC 7636 and every other provider
use. `pkce()` in the connect route does this deliberately; do not "correct" it.

**Two expiries, and only one of them is an ops concern.** The access token
(~24h) is refreshed by `currentToken()` on every publish; surfacing it would
alarm ops daily about something that heals itself. The refresh token (~365d) is
the one with no way back — once it lapses there is nothing left to refresh from,
publishing stops, and only re-authorising restores it. That is the expiry
`checkTikTok()` reports, and a lapsed grant renders as **broken, never "live"**,
for the same reason the Facebook Page token check exists at all.

## Posting by hand: Back Office → Social → Post to TikTok

The cron sweeper remains the product — landlord consents over WhatsApp, the
queue posts on its own. Alongside it, `/back-office/social/post/[listingId]`
(reached from the share icon on any active row in Back Office → Listings) lets
ops review and post one listing themselves.

It exists because TikTok's **Direct Post** rules ask for something a cron
structurally cannot give: the creator seeing exactly what goes out, choosing the
privacy level, and pressing the button. Easy Rent owns the account, so ops is
the creator. Concretely:

- **Nothing is pre-selected.** A sensible-looking default IS the app choosing,
  which is the thing the rule forbids. Post stays disabled until ops picks.
- **The options come from a live `creator_info` query**, never a hardcoded list,
  so every choice offered is one TikTok has just said this account can use.
  While the app is unaudited that list is `['SELF_ONLY']` and the screen says so.
- **An unavailable choice fails the publish** rather than being substituted —
  substituting up is a privacy breach, substituting down lies to the operator.
  Pinned in `tests/unit/social-tiktok-privacy.test.ts`.
- **What is previewed is the real payload**: the same `buildCaption` and
  `socialImageUrls` the worker calls, not a mock-up of them.

It routes through `publishNow` → the same `publishOne` as the sweeper, so the
recording rules (dry-run note, `skipped` when a listing went inactive, the audit
entry) cannot drift between the two paths. It claims the row under the same
lease, so a concurrent cron tick cannot double-post, and it refuses a listing
already `posted`.

## Testing without live accounts

Every adapter **dry-runs** when its credentials are absent — it logs the exact
payload and returns `dryrun-<platform>-<listingId>`, mirroring the intake
pipeline's `isIntakeConfigured()` dormancy. That exercises consent → enqueue →
claim → caption → proxy → record end to end with no social accounts at all.

To exercise the TikTok adapter end to end without sandbox credentials, point
`TIKTOK_API_BASE` at a local stub: the adapter reads its base URL from env, so
`creator_info`, `content/init` and the status poll all run for real against it.
(The authorize URL is hardcoded to tiktok.com on purpose — that leg is TikTok's
own consent screen and must not be stubbable in production code.)

```bash
pnpm db:migrate-all:local        # then run it TWICE — the runner replays forever
curl -I localhost:3000/api/social/img/1/0.jpg                        # image/jpeg, 1080x1350
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/publish-social
curl localhost:3000/api/cron/publish-social                          # expect 401
```
