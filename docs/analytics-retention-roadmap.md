# Landlord Analytics — Retention Roadmap

**Created:** 2026-08-31
**Status:** D1, D2 and items 1, 2, 3, 4, 6 and 8 are BUILT — see the "Landlord
analytics" section of `CLAUDE.md`. Items 5 and 7 are NOT, and cannot be as
written: both extend a WhatsApp landlord *report* (`lib/reports/**`,
`sendWhatsAppTemplate`, `whatsappTemplateName`) that does not exist in this
repository. The "report integration" sub-sections of items 1 and 2, and the
`buildNudge` read side of item 8, are unbuilt for the same reason; item 8's
write side and an analytics-page reader shipped instead.
**Migration numbers below are one ahead of reality** — this was written assuming
a `0045` that does not exist, so the files landed as `0045`–`0048`.
**Companion:** `docs/whatsapp-golive-runbook.md`

An implementation plan for turning Easy Rent's landlord analytics into something
that brings landlords back. Written to be picked up cold: every item names the
files it touches, the migration it needs, and what "done" means.

Ordered by retention unlocked per unit of work. **Items 1 and 2 are the
difference between a report a landlord reads and one they mute** — do those
before anything else in this list.

---

## Where things stand

### What a landlord can see today

| Surface | Shows | Who sees it |
|---|---|---|
| `/dashboard` | Active listings, verified listings (counts only) | All landlords |
| `/dashboard/activity` | Recent listing events — approvals, edits, status changes | All landlords |
| `/dashboard/analytics` | Portfolio counts; per-listing rent comparison; total views, views last 7d, percentile | **Paid tiers only** |
| WhatsApp report | Views, trend, portfolio line, best performer, one nudge | All landlords with a verified `wa_phone` |

There are **no view counts anywhere outside the paywalled analytics page.**

### The data ceiling

Everything above derives from one table:

```
listing_views ( id, listing_id, viewed_at )
```

Three columns. That is the whole analytics substrate. Consequences worth
holding in mind while reading the rest of this plan:

- **No viewer identity** — two views are indistinguishable from one person
  twice. A landlord refreshing their own listing inflates their own numbers.
  The only guard is a 30/min per-IP rate limit in `lib/rate-limit.ts`.
- **No source** — a view from search, from a shared WhatsApp link, and from a
  social post are the same row.
- **No contact tracking at all** — the Call and WhatsApp buttons on
  `app/(dashboard)/listings/[id]/page.tsx` are plain `<a href="tel:…">` and
  `<a href="https://wa.me/…">` anchors. Nothing records a tap.

### Market-density caveat

As of 2026-08-27 production had **zero active listings and three users.** Every
comparative statistic — market average rent, the percentile, "beats X% of
similar listings" — needs supply density before it means anything. This plan
targets the first fifty landlords, not the first five thousand. Item 4 exists
specifically because of this.

---

## Known defects to fix first

Neither is part of the roadmap proper; both are bugs in code that already
shipped, and both are cheap.

### D1 — Landlords on `pro` are locked out of analytics

`app/(dashboard)/dashboard/analytics/page.tsx`:

```ts
if (tier !== 'premium' && tier !== 'agency') { /* upgrade card */ }
```

`premium` is the **legacy** alias. Per CLAUDE.md the current tiers are
`free | starter | pro | agency`, with `basic`→starter and `premium`→pro. So a
landlord on `pro` — the current name for the tier that includes analytics — is
shown the upgrade card instead of their data.

**Fix:** use `isLandlordPremiumOrAbove(landlord)` from `lib/landlord-plans.ts`,
which already covers `pro | premium | agency`. Then grep for other direct tier
string comparisons and fix any that share the bug. Leave the
`tier === 'agency'` gate on `BulkRenewButton` — that one is genuinely
agency-only.

**Done when:** a unit test asserts a `pro` landlord passes the gate and
`free`/`starter` do not.

### D2 — The analytics page fans out concurrent queries per listing

`app/(dashboard)/dashboard/analytics/page.tsx` has an outer `Promise.all` over
the portfolio, each iteration containing an inner `Promise.all`:

```ts
await Promise.all(portfolio.listings.map(async (listing) => {
  const [rentComp, perf] = await Promise.all([
    getRentComparisonForListing(listing.id),
    getListingPerformanceData(listing.id),
  ]);
```

`getRentComparisonForListing` is ~2 queries; `getListingPerformanceData` is ~5
(it has its own inner `Promise.all`). A ten-listing landlord fires roughly 70
mostly-concurrent queries.

On Vercel the pool is `max: 1` (`lib/db/drizzle.ts`) against Supabase's
transaction pooler, and pipelining concurrent queries onto that single
PgBouncer-backed connection **wedges the request until the platform kills it.**
This is exactly what commit `a3ac4f9` removed from the back office; the
analytics page was missed. An agency landlord is both the most likely to hit it
and the most likely to be paying.

**Fix:** replace the fan-out with set-based queries over the whole portfolio —
one grouped `count(*) filter (where …)` aggregate for views, one for the market
comparison across the distinct `(city, bedrooms)` pairs. `lib/reports/data.ts`
(`getLandlordReportData`) is the model, including its `ts()` helper for binding
Dates inside raw `sql` fragments.

**Also check:** `app/(dashboard)/dashboard/listings/page.tsx` has the same
pattern (a `Promise.all` over listings fetching business accounts per row).

**Done when:** rendered output is unchanged and the page issues a fixed number
of queries regardless of portfolio size.

---

## 1 — Track contact clicks

**Effort:** small · **Unblocks:** items 6, and honest Boost pricing

The highest-value missing metric in the product. A view measures curiosity; a
tapped *Call* or *WhatsApp* button is the closest thing to a lead this
marketplace has — and "did anyone actually call?" is what landlords ask instead
of asking about views.

It also gives the WhatsApp report a number worth opening for, produces a real
conversion rate (views → contacts), and gives paid visibility its first honest
justification: what a Boost is worth in *leads*, not impressions.

### Schema — migration `0046_listing_contact_events.sql`

A separate table rather than a `type` column on `listing_views`. Views are
high-volume and disposable; contact events are low-volume and are the thing
you will actually query, join and chart. Mixing them makes every existing view
query filter on a column it does not care about.

```sql
CREATE TABLE IF NOT EXISTS listing_contact_events (
  id            serial PRIMARY KEY,
  listing_id    integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  -- 'call' | 'whatsapp' — which button. Kept separate because the split
  -- is itself the insight: a Sri Lankan renter who WhatsApps rather than
  -- calls behaves differently, and landlords answer differently too.
  channel       varchar(16) NOT NULL,
  -- Which of the listing's numbers was tapped, when it is one of ours.
  -- Nullable: the publisher-phone fallback path has no contact_numbers row.
  contact_number_id integer REFERENCES listing_contact_numbers(id) ON DELETE SET NULL,
  occurred_at   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_contact_events_listing_idx
  ON listing_contact_events (listing_id, occurred_at);
```

Register it in the `MIGRATIONS` array in `lib/db/run-all-migrations.ts` and add
the table to `lib/db/schema.ts`. **Plain `IF NOT EXISTS` DDL, no `DO` block** —
see the `splitStatements` warning in CLAUDE.md.

### Route — `app/api/listings/[id]/contact/route.ts`

Model it on `app/api/listings/[id]/view/route.ts`, which already has the right
shape: rate-limit by IP, verify the listing is `active`, silently `{ ok: true }`
otherwise. Add a normalised route key in `lib/rate-limit.ts` alongside the
existing `POST:/api/listings/:id/view` one — without normalisation every
listing id lands in its own bucket and the limit does nothing.

Rate limit lower than views: a genuine contact tap is rare. Start at 10/min.

### Client

The buttons are in `app/(dashboard)/listings/[id]/page.tsx` (~line 600). They
must **keep working when the beacon fails** — never gate the `href` behind a
fetch. Use `navigator.sendBeacon` in an `onClick`, which fires and forgets
without delaying navigation, with a `fetch(..., { keepalive: true })` fallback.

Wrap this in a small client component (`components/contact-click-tracker.tsx`)
so the listing detail page stays a server component.

### Report integration

Add `contactsThisPeriod` / `contactsPrevious` to `LandlordReportData` in
`lib/reports/data.ts` — the same bounded-join `FILTER` aggregate shape as views,
so it stays **one query**, not two. Then rework the template:

> ⚠️ Changing the report template's variable count means **re-registering and
> re-approving the template with Meta**. Do it as one deliberate change — see
> CLAUDE.md. Consider folding contacts into the existing views parameter
> (`"42 views · 6 contacts"`) to avoid a re-approval cycle entirely.

**Done when:** a tapped Call button writes a row; the analytics page shows
contacts per listing; the report can state them; and blocking the beacon
endpoint entirely still leaves the phone dialer working.

---

## 2 — Make views honest (deduplicate)

**Effort:** small · **Pairs with:** item 4

Credibility work, not vanity work. The moment a landlord notices their own
refreshes counted, every other number becomes suspect — including the accurate
ones.

### Schema — migration `0047_listing_view_visitor.sql`

```sql
ALTER TABLE listing_views
  ADD COLUMN IF NOT EXISTS visitor_hash varchar(64);

-- Drives "unique viewers in period" without scanning the whole history.
CREATE INDEX IF NOT EXISTS listing_views_visitor_idx
  ON listing_views (listing_id, viewed_at, visitor_hash);
```

Nullable, because every existing row predates it. Any "unique viewers" figure
must therefore be labelled as starting from the deploy date, or fall back to
raw views for periods before it — silently reporting a lower number for
historical weeks looks like a traffic collapse.

### Hashing

In the view route, derive:

```
sha256( ip + user-agent + VIEW_HASH_SALT + yyyy-mm-dd )
```

The **date component is what makes this privacy-preserving and what makes it
work**: the hash rotates every day, so nothing tracks a person across days and
"unique viewers this week" means "unique per day, summed" rather than a
cross-day identity. Put `VIEW_HASH_SALT` in the env (never `NEXT_PUBLIC_*`).

`getClientIp` already exists in `lib/rate-limit.ts`.

### Surfacing

Report both numbers, never silently swap them — `120 views from 34 people` is
more useful and more honest than either alone. Update:

- `getListingPerformanceData` in `lib/db/queries.ts`
- `getLandlordReportData` in `lib/reports/data.ts` (add a
  `count(distinct visitor_hash) filter (…)` to the existing aggregate — still
  one query)

**Done when:** reloading a listing ten times in a minute adds ten views and one
unique viewer, and periods before the deploy are labelled rather than
under-reported.

---

## 3 — Give free landlords a number at all

**Effort:** small · **Reaches:** every landlord

Today a landlord outside the paid tiers sees inventory counts and nothing else.
That is backwards for a platform whose entire model is **free unlimited
listings and paid visibility** — the product withholds the evidence that
listing here works at all.

Keep the deep comparisons paid. The *existence* of numbers should not be.

### What to build

A 30-day view sparkline plus a 7-day total on each listing card in
`/dashboard/listings`, for every tier.

One grouped query for the whole page:

```sql
SELECT listing_id, date_trunc('day', viewed_at) AS day, count(*)
FROM listing_views
WHERE listing_id = ANY($1) AND viewed_at > now() - interval '30 days'
GROUP BY 1, 2
```

Render inline SVG in a server component — no chart library, no client JS. See
the `dataviz` conventions if the sparkline grows into a real chart.

Do **not** reuse `getListingPerformanceData` per card — that is defect D2 in a
new place.

### Also

Unlock the WhatsApp report copy that mentions the dashboard, and consider a
"See full analytics" upsell under the sparkline, gated on
`enablePricingSection` like every other paid CTA.

**Done when:** a free landlord opens `/dashboard/listings` and sees movement,
and the page issues one view query regardless of listing count.

---

## 4 — Suppress statistics that lack the sample size

**Effort:** tiny · **Do alongside:** item 2

"Beats 80% of similar listings" computed against four comparable homes is noise
wearing the costume of insight. Given current market density this is the
cheapest trust win available.

`lib/reports/data.ts` already does this correctly for pricing:

```ts
const MIN_COMPARABLES_FOR_PRICING_NUDGE = 3;
```

Apply the same floor to the percentile in `getListingPerformanceData`
(`lib/db/queries.ts`), and to the rent comparison on the analytics page. Promote
the constant to a shared module so there is one threshold, not three.

Below the floor, say so plainly — *"Not enough similar listings in Horana yet to
compare"* — rather than printing a number or hiding the row without explanation.

Consider raising the floor to 5 for the percentile specifically; a percentile
over 3 samples can only return 0, 33, 67 or 100.

**Done when:** a listing in a thin market shows an explanation instead of a
number, and a test covers the boundary.

---

## 5 — One-tap renewal from the report

**Effort:** small · **Reuses:** `lib/auth/access-links.ts`

An expiring listing is already the report's highest-priority nudge, because it
is a property about to vanish from search. Right now the nudge ends at telling
them — the landlord has to find the dashboard, sign in, and locate the listing.

### What to build

Add a **dynamic URL button** to the report template pointing at a signed access
link for the expiring listing.

`mintAccessLink` already exists, links are reusable, and only the sha256 is
stored — a Supabase magic-link token is single-use and can never be the link we
send (see CLAUDE.md).

`sendWhatsAppTemplate` in `lib/intake/channels/whatsapp/send.ts` already
supports `urlButtonParam` for exactly this: the template declares a URL with a
`{{1}}` suffix and the parameter supplies the token.

### Constraints

- **Never mutate on GET from a link** (CLAUDE.md). The link opens a renewal
  *page* with a button; it does not renew on load.
- Mint the link only when there is actually something expiring, so a routine
  report is not carrying a live credential for no reason.
- Template change ⇒ **Meta re-approval**. Batch this with any other template
  change (see item 1).

**Done when:** a landlord with a listing expiring in 3 days can renew it from
the WhatsApp report in two taps without typing a password.

---

## 6 — Search impressions, and the ratio they unlock

**Effort:** medium · **Depends on:** item 1

Record which listing IDs a results page actually served. Impressions plus opens
gives a click-through rate, and that ratio is what makes every other nudge
diagnostic instead of vague:

| Signal | Diagnosis |
|---|---|
| Low impressions | Location, price band, or filter problem |
| High impressions, low opens | Photo, title, or price problem |
| High opens, no contacts | Description or trust problem |

It is also the only way to show what paid visibility bought: not *"you got a
Boost"* but *"your listing went from 40 impressions to 300."* That is the
number that makes the Boost renewable.

### Where

`getActiveListings` in `lib/db/queries.ts` is the single ranking path — every
results page goes through it. That makes it the one place to record
impressions, and also the one place where getting it wrong slows down every
search.

### The hard constraint

**Do not write a row per listing per search.** At 20 results per page that is
20 inserts on the critical path of the most-hit query in the product, on a
`max: 1` pool. Options, in preference order:

1. **Aggregate in memory, flush periodically** — an in-process counter
   (`Map<listingId, count>`) flushed by the existing cron infrastructure. Same
   per-instance caveat as `lib/rate-limit.ts`: counts are lost on deploy.
   Acceptable for a trend metric; document it.
2. **A daily rollup table** (`listing_impressions(listing_id, day, count)`) with
   an upsert `ON CONFLICT … DO UPDATE SET count = count + n`, one statement per
   flush rather than per listing.

Do **not** log impressions from the client — an ad-blocker-shaped beacon on
every search result is both unreliable and slow.

### Schema — migration `0048_listing_impressions.sql`

```sql
CREATE TABLE IF NOT EXISTS listing_impressions (
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day        date NOT NULL,
  count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, day)
);
```

**Done when:** a search records impressions without measurably slowing
`getActiveListings`, and the analytics page shows impressions → opens →
contacts as a funnel.

---

## 7 — Report in Sinhala and Tamil

**Effort:** medium · **Reuses:** `lib/intake/i18n`

The intake pipeline already answers landlords in the language they wrote in,
and landlords writing in Sinhala is exactly what proved that work necessary
(see the intake conversation-memory post-mortem in CLAUDE.md). The report is
English-only purely because **each template language needs its own Meta
approval and its own registered name.**

Highest-leverage localisation on the platform; the translation layer exists.

### What to build

1. Extend `whatsappTemplateName()` in
   `lib/intake/channels/whatsapp/send.ts` to resolve per language —
   `WHATSAPP_REPORT_TEMPLATE_SI`, `_TA`, falling back to the English template
   when a language's template is unset or unapproved. **Falling back must be
   silent and safe**; never send a Sinhala landlord nothing.
2. Add report keys to `lib/intake/i18n/si.ts` and `ta.ts` following the existing
   pattern: English literals stay the default path, translations are additive,
   a missing key falls back to English.
3. Resolve the language from `users.preferred_language` via `resolveReplyLang`
   (`lib/intake/language.ts`) in `lib/reports/send.ts`.
4. Register both templates with Meta.

### Constraints

- **Operative tokens survive translation.** The report says "Reply STOP"; STOP
  is matched by `lib/intake/command-words.ts` and must appear in Latin caps in
  every translation, exactly as the delete/cancel copy already does.
  `tests/unit/intake-i18n.test.ts` asserts this pattern — extend it.
- The Sinhala and Tamil intake copy is **a draft awaiting native review**,
  which is why `enableLocalizedReplies` is off. Do not ship report translations
  ahead of that review.

**Done when:** a landlord whose `preferred_language` is `si` gets a Sinhala
report, an unapproved template silently falls back to English, and STOP still
works in every language.

---

## 8 — Rent positioning over time

**Effort:** medium · **Value:** compounds — start writing early

The rent comparison is a snapshot, so it can only say where a landlord sits
today. Storing a weekly market snapshot lets the report say the thing a
snapshot never can: **the market moved and you didn't.**

That is the most actionable pricing message available, and it is impossible to
compute from live data alone — which is why the snapshot has to start being
written long before it can be used. **This item's cost is nearly all in
waiting**, so consider landing the write side early even if the read side comes
much later.

### Schema — migration `0049_market_rent_snapshots.sql`

```sql
CREATE TABLE IF NOT EXISTS market_rent_snapshots (
  id          serial PRIMARY KEY,
  city        varchar(100) NOT NULL,
  bedrooms    integer NOT NULL,
  avg_rent    integer NOT NULL,
  median_rent integer,
  sample_size integer NOT NULL,
  captured_on date NOT NULL,
  UNIQUE (city, bedrooms, captured_on)
);
```

`sample_size` is not optional bookkeeping — it is what lets a later reader
discard a snapshot taken when the market was too thin to mean anything (item 4).

### Job

A weekly cron writing one row per `(city, bedrooms)` pair that has at least
`MIN_COMPARABLES` active listings. One grouped query over `listings`, one
multi-row insert. Add to `vercel.json`; secure with `CRON_SECRET`, failing
closed like every other job.

### Read side

Compare the landlord's rent against the same pair 4 and 12 weeks back. Wire into
`buildNudge` in `lib/reports/message.ts` — it already has a priority ladder, and
this slots in beside the existing pricing nudge. Keep **one nudge per report**;
three pieces of advice in a WhatsApp bubble is zero.

**Done when:** snapshots accumulate weekly, and after ~8 weeks the report can
say *"3BR homes in Nugegoda are up 8% since June — your rent hasn't moved."*

---

## Sequencing

```
D1 ─┐
D2 ─┤ (defects — do first, both cheap)
    │
 1 ─┼─ contact clicks ──────────┐
 2 ─┤  dedupe views             │
 4 ─┘  sample-size floors       │
    │                           │
 3 ─── free-tier sparkline      │
 5 ─── one-tap renewal          │
    │                           │
 6 ─── impressions ◄────────────┘  (needs contacts to complete the funnel)
 7 ─── si / ta reports              (independent — can run in parallel)
 8 ─── market snapshots              (start the WRITE side any time)
```

**Batch every template change.** Items 1, 5 and 7 all touch the WhatsApp
template, and each change costs a Meta re-approval cycle. Decide the final
template shape once, then register it.

---

## Checklist for every item here

From CLAUDE.md — these bite hard in this codebase:

- [ ] Schema change ⇒ update `lib/db/schema.ts` **and** add a numbered SQL file
      **and** register it in the `MIGRATIONS` array in `run-all-migrations.ts`.
- [ ] Plain `IF NOT EXISTS` DDL. **No `DO` block** — `splitStatements()`
      mis-parses `END $$;` and swallows the rest of the file on replay.
- [ ] Migrations replay on **every** invocation, forever. No `DROP COLUMN` on a
      column holding data, no `TRUNCATE`, no unguarded `UPDATE`/`DELETE`.
- [ ] Run `pnpm db:migrate-all` against production **before** the deploy lands —
      Drizzle names every column explicitly, so a column in `schema.ts` that is
      missing from the database takes down *every read of that table*.
- [ ] Then prove it with `pnpm db:check-drift`. "Done" from the migration runner
      is not proof; it swallows `already exists` errors.
- [ ] **No `Promise.all` over database queries.** `max: 1` pool on a transaction
      pooler — concurrent queries wedge the request (commit `a3ac4f9`).
- [ ] Raw `sql` fragments must cast Dates — see `ts()` in `lib/reports/data.ts`.
      Drizzle's own operators bind them; hand-written fragments throw at bind
      time inside the driver, with nothing in the type system to catch it.
- [ ] New consequential admin action ⇒ add an `audit_action` enum value and log
      it.
- [ ] Gate anything new or experimental behind a feature flag in
      `lib/feature-flags.ts`, with metadata, and make flag-gated pages
      `force-dynamic`.
- [ ] Never advertise a paid product while `enablePricingSection` is off.
