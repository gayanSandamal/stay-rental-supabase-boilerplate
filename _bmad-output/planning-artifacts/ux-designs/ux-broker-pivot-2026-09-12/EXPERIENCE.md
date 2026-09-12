---
name: Broker Pivot Experience
description: Information architecture and behavior for the broker-pivot surfaces — self-serve business accounts, property grouping, and lead routing. Cross-references {colors.*} and {components.*} tokens from the sibling DESIGN.md in this folder.
status: draft
project: stay-rental-supabase
updated: 2026-09-12
---

## Foundation

**Form factor:** web, desktop-first responsive — same as the rest of the Easy Rent
dashboard and public marketplace. No mobile-specific layout was designed; the existing
dashboard shell's mobile hamburger nav (`app/(dashboard)/dashboard/layout.tsx`) already
covers `/dashboard/business-account` and `/dashboard/leads`, and `/request` is a simple
single-column form that reflows naturally.

**UI system:** shadcn-style primitives (`components/ui/*`) + Tailwind 4, inherited whole
from the existing app — see DESIGN.md's `inherits` field. This document specifies only the
behavioral delta the broker-pivot surfaces add on top of that system.

**Status of the underlying gate:** every screen described here sits behind a feature flag
that defaults OFF (`enableSelfServeBusinessAccounts`, `enablePropertyGrouping`,
`enableLeadRouting` — `lib/feature-flags.ts`). This EXPERIENCE.md describes what the
screens do when the flag is ON; STATUS.md records that Phase 2/3's own gate
(≥2 brokers, ≥40 active listings in one city) was not met in production when these
shipped, and turning the flags on is a separate decision from building the code.

## Information Architecture

```
/dashboard
├── business-account          (self-serve: create, or manage if already a member)
├── leads                     (business-account members only: browse + claim open leads)
/listings/[id]
└── (sibling agents panel, inline — not a separate route)
/request                      (public, unauthenticated: post a rental requirement)
```

Three new surfaces, one existing surface extended:
- `/dashboard/business-account` — new. A landlord's entry point to creating or managing a
  brokerage account. Not linked from anywhere except the dashboard sidebar nav (always
  visible; the page itself explains when the feature isn't turned on, rather than 404ing —
  see Component Patterns).
- `/dashboard/leads` — new. Gated twice: behind the feature flag, and behind
  business-account membership (a plain landlord with no business account is told where to
  go, not shown an empty or broken list).
- `/request` — new, public. No nav entry anywhere yet (deliberate — see Key Flows). 404s
  rather than explaining itself when the flag is off, because there is no signed-in user
  to explain anything to and no route anyone should be linking to yet.
- `/listings/[id]` — extended, not new. The sibling-agents panel is additive: every
  existing information architecture decision on that page (Publisher Information, Contact
  Owner, Similar Listings) is unchanged; the panel slots in only when it has something to
  show.

**Surface closure:** every stated need (a broker wants tooling → business-account page; a
broker wants to compete transparently on a shared property → sibling-agents panel; a
renter wants brokers to come to them → request form + leads inbox) has exactly one surface
that delivers it, and every surface traces back to a concept in FORGE.md. No orphan
screens.

## Voice and Tone

Brand voice is set in DESIGN.md ("direct, unembellished, numbers-first") — these are the
behavioral applications of it:

- **Never oversell the feature's maturity.** The business-account "not turned on yet"
  message and the leads "no open leads right now" empty state both say the plain fact,
  not a placeholder ("Coming soon!") or false enthusiasm. This matches the existing
  codebase's discipline around dry-run badges and unknown-vs-zero (`showPublicViewCounts`)
  — never claim more than is true.
- **The lead-request confirmation names the two real promises, once.** "Brokers on Easy
  Rent can now see your requirement... Easy Rent never takes a commission, and neither
  does posting this request cost anything" — deliberately reuses the exact "no commission"
  language POSITIONING.md preserved, not a new claim invented for this surface.
- **Fee-disclosure copy never implies a fee is illegal or required.** RESEARCH.md's
  finding on the Rent Act's scope means the UI must not state or imply every broker fee is
  negotiable or lawful everywhere — the sibling-agents panel says only "Fee not disclosed"
  or shows what was entered, never a judgment on it.

## Component Patterns

(Visual specs live in DESIGN.md; this section is behavior only.)

- **Gated-page explainer pattern** (`/dashboard/business-account`, `/dashboard/leads`):
  when a flag is off, the page renders its normal title plus one explanatory sentence,
  HTTP 200 — never a 404 or blank page for a signed-in user who navigated via a visible
  nav link. `/request` is the one exception (see Information Architecture) because it has
  no nav link and no signed-in user to address.
- **Claim-and-reveal pattern** (`ClaimLeadButton`): a single action button that, on
  success, replaces itself in place with the revealed result (the phone number as a `tel:`
  link) rather than navigating away or opening a modal. The state is client-local and does
  not persist across a page refresh — refreshing re-fetches the (now `claimed`, and so
  absent from the open list) lead and the revealed number is lost. This is a known rough
  edge (see State Patterns) acceptable for an instrumented first pass, not a finished
  "my claimed leads" feature.
- **Fee disclosure line** (sibling-agents panel): renders `feeNotes` verbatim if present,
  else falls back to `Fee: {payer}`, else `Fee not disclosed` — three explicit states, no
  fee amount is ever inferred or estimated.

## State Patterns

- **Business account membership:** exactly one of three states per user — no membership
  (show create form), member with `owner`/`admin` role (show management: invite, remove),
  member with `member` role (show read-only team list, no invite/remove controls). This
  mirrors the API-level permission split added in `app/api/business-accounts/[id]/route.ts`
  and the members routes — the UI must never offer a control the API will reject.
- **Lead status:** `open` → `claimed` → (`closed`, no UI yet — status exists in the schema
  for a future "mark as let" action, not built this pass). A claimed lead disappears from
  the open list for every other broker the instant one claims it — first-come, not
  "everyone sees who claimed it."
- **Property grouping — the "nothing to show" state is the default, not an edge case.**
  With one active listing in production, the sibling-agents panel renders `null` on every
  page load today. This is correct behavior, not a bug to chase: the panel is dormant
  infrastructure until Gate 1 passes.

## Interaction Primitives

- **Buttons:** single teal primary action per screen where one exists ("Claim this lead",
  "Post my request", "Invite a team member") — no competing primary/secondary pair on any
  of these screens, because none of them have two equally-weighted actions.
- **Forms:** `FormBuilder`-driven where a reusable config exists (business account, team
  invite); a plain controlled `<form>` for the one-off public request form. Both submit
  via `fetch` to the corresponding API route and surface the API's own error string
  directly — no client-side re-wording of server errors, matching the existing
  `self-serve-forms.tsx` pattern copied from the back-office equivalent.
- **Links:** sibling-agent names link to `/listings/{id}` as plain anchor tags, not
  client-side navigation — consistent with every other cross-listing link on the public
  site.

## Accessibility Floor

(Visual contrast lives in DESIGN.md's token choices — all reused from an existing,
presumably-audited system.) Behavioral floor for these surfaces:
- Every icon-only or icon-plus-text button (`ClaimLeadButton`, `RemoveTeamMemberButton`)
  carries visible text, never an icon alone — matches the existing dashboard's convention.
- Form inputs use native `<input>`/`<textarea>` elements with `placeholder` text, not
  floating labels with no static label — [ASSUMPTION] this matches the plain-HTML style of
  the existing quick-list form rather than the full `FormBuilder`'s labeled-field style,
  which is a minor inconsistency worth resolving if `/request` graduates past this
  first-pass form.
- Disabled states (`disabled:opacity-50` on every submit button while a request is in
  flight) prevent double-submission without relying on the user noticing a spinner alone.

## Key Flows

**Priya lists her first brokered property.** Priya runs a two-person letting agency in
Nugegoda. She creates a business account from `/dashboard/business-account` (her tenant
account auto-upgrades to landlord, same rule as first-listing creation), invites her
business partner as an `admin` member, and starts forwarding landlord WhatsApp messages
into the existing intake pipeline under the business account's name. **Climax beat:** the
first listing she publishes shows "Verified business account" instead of no badge at all
— because Easy Rent verified *her business*, not a landlord she doesn't personally have
KYC documents for — closing the "brokerage publishes less trusted than an individual" gap
STATUS.md flagged.

**Kasun posts a requirement instead of scrolling five portals.** Kasun needs a 2BR in
Dehiwala under LKR 60,000, has checked ikman and two Facebook groups, and is tired of
calling numbers that don't answer. He finds `/request` (currently only reachable if someone
sends him the link — see Information Architecture), fills the six fields, and gets back a
confirmation naming the same "no commission" promise the rest of the site makes. **Climax
beat:** nothing happens immediately — his lead sits `open`, waiting for a broker to check
`/dashboard/leads`, because there is no WhatsApp push in this pass. Kasun's flow ends in
uncertainty by design; this is the least-validated of the three concepts and the plan is
explicit that it ships to learn whether that uncertainty is acceptable to real users, not
because it's finished.

**A renter reading a listing spots a second agent quietly undercutting the first.**
Once Gate 1 passes and two brokers have both listed 14 Lotus Road, a renter viewing either
listing sees the amber sibling-agents panel: "Also listed by 1 other agent," with that
agent's disclosed fee (or "Fee not disclosed") next to a link to their listing.
**Climax beat:** the renter now knows to compare before calling — the one thing neither
ikman nor LankaPropertyWeb can show, because duplicate ads are revenue for both of them.
