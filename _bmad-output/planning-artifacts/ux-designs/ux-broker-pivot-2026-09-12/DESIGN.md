---
name: Broker Pivot Surfaces
description: Visual identity for the broker-pivot surfaces (self-serve business accounts, property grouping, lead routing) — inherits the existing marketplace design system rather than introducing a new one.
status: draft
project: stay-rental-supabase
updated: 2026-09-12
inherits: Tailwind 4 + shadcn-style primitives in components/ui/ — the SAME system the public marketplace and landlord dashboard already use. No new tokens introduced; this file documents which of the existing tokens the new broker surfaces use and why, plus the two new semantic colors these surfaces needed (amber for "unverified/undisclosed" states) that did not previously have a dedicated home outside status-badge contexts.
colors:
  canvas: '#f9fafb'
  surface: '#ffffff'
  border: '#e2e8f0'
  ink: '#111827'
  ink-muted: '#6b7280'
  accent: '#0f766e'
  accent-hover: '#0e6b62'
  accent-wash: '#f0fdfa'
  success-bg: '#d1fae5'
  success-ink: '#065f46'
  caution-surface: '#fffbeb'
  caution-border: '#fde68a'
  caution-ink: '#78350f'
  danger-ink: '#dc2626'
typography:
  font-family: 'system default (Tailwind sans stack) — matches every existing marketplace surface, not reinvented here'
  scale:
    page-title: 'text-2xl font-bold'
    section-title: 'text-sm font-semibold'
    body: 'text-sm'
    caption: 'text-xs'
rounded:
  card: 'rounded-lg'
  button: 'rounded-lg'
  chip: 'rounded (badge-scale)'
spacing:
  page-max-width: 'max-w-2xl (dashboard forms/lists) / max-w-xl (public request form)'
  section-gap: 'space-y-4 to space-y-6'
  card-padding: 'p-3 to p-4 (pt-4/pt-6 variants used by existing Card components)'
components:
  - Card / CardHeader / CardTitle / CardContent (components/ui/card.tsx) — reused unmodified
  - FormBuilder (components/form-builder.tsx) — reused for business-account creation and team invites; the public lead-request form is plain HTML inputs (see Do's and Don'ts)
  - VerificationBadges (components/verification-badges.tsx) — unmodified; now also fed by businessAccounts.kycVerified on the business publisher path
  - New: SiblingAgents panel (amber caution surface)
  - New: ClaimLeadButton (teal primary action -> revealed-contact state)
---

## Brand & Style

These surfaces do not introduce a new brand voice. They inherit Easy Rent's existing
marketplace tone — direct, unembellished, numbers-first — because a broker or landlord
managing a business account is the same audience as the existing dashboard, using the
same chrome (`app/(dashboard)/dashboard/layout.tsx`'s sidebar nav). The one deliberate
departure is the **caution/undisclosed state**, new to this surface: nothing in the
existing design system previously needed to say "we don't know this yet" as a first-class
visual state, because every other dashboard card shows a fact. A sibling-agent's
undisclosed fee and an unclaimed lead both need to read as *pending information*, not as
an error and not as a normal fact — hence the amber caution surface, borrowed from the
existing `caution-surface`/`caution-border`/`caution-ink` tokens already defined in the
back-office DESIGN.md (`ux-stay-rental-supabase-2026-08-29/DESIGN.md`) but not previously
used on marketplace-facing (non-back-office) pages.

## Colors

No new hex values beyond what the back-office spine already tokenized. The broker
surfaces pull:
- `accent` (`#0f766e`, teal-700) for every primary action — "Claim this lead", "Post my
  request", "Invite a team member" — matching every existing CTA in
  `components/hero-section.tsx` and `components/for-landlords-section.tsx`.
- `success-bg`/`success-ink` (emerald) for confirmation states: a submitted lead request,
  an added team member.
- `caution-surface`/`caution-border`/`caution-ink` (amber) for the one new semantic need:
  **undisclosed or unverified information**, never for errors (errors stay `danger-ink`,
  plain red text, matching the existing `text-red-600` convention in
  `self-serve-forms.tsx` and `claim-lead-button.tsx`).

[ASSUMPTION] No dark-mode variant is specified — the existing dashboard has none, and
extending one is out of scope for this pass.

## Typography

Unchanged from the existing dashboard: page titles at `text-2xl font-bold text-gray-900`,
section headers at `text-sm font-semibold`, body copy at `text-sm text-gray-600`, captions
(dates, counts, fee notes) at `text-xs text-gray-500` or the caution-ink equivalent inside
an amber panel. No new type scale was needed.

## Layout & Spacing

- Dashboard pages (`/dashboard/business-account`, `/dashboard/leads`) use `max-w-2xl`,
  matching the existing `/dashboard/general` and `/dashboard/analytics` pages — a single
  reading column, no multi-panel layout, because none of these screens have enough
  simultaneous information to justify one.
- The public `/request` page uses `max-w-xl mx-auto py-12 px-4`, matching
  `list-your-property`'s single-column public form pattern rather than the dashboard's
  sidebar-plus-content shell (it has no sidebar — a renter posting a request is not signed
  into the dashboard chrome).
- Cards stack vertically with `space-y-4`; nothing here needed a grid.

## Elevation & Depth

No new elevation system. Cards use the existing `Card` component's default border +
`bg-white`, no shadow escalation — consistent with the flat, dense back-office aesthetic
this sits alongside rather than the marketing homepage's heavier `ScrollReveal` treatment.

## Shapes

`rounded-lg` throughout (cards, buttons, form inputs), matching every existing dashboard
surface. No new shape language.

## Components

- **SiblingAgents panel** (`components/sibling-agents.tsx`): an amber-bordered card
  listing other agents attached to the same property, each with a link to their listing
  and either their disclosed fee or "Fee not disclosed" in caution-ink. Renders nothing
  when there is nothing to show — no empty state, because an empty sibling-agents panel
  on every single-agent listing (i.e. all of them, until Gate 1 passes) would be constant
  visual noise for zero information.
- **ClaimLeadButton** (`app/(dashboard)/dashboard/leads/claim-lead-button.tsx`): a single
  teal button that transforms, on success, into the revealed phone number as a `tel:`
  link in teal-800 semibold — the transformation IS the reward, so no separate
  confirmation toast was added.
- **Business-account membership row**: plain text row, role shown as a muted suffix
  (`· owner`), a text-only "Remove" action in `text-red-600` for owner/admin viewers only
  — matches the existing back-office team-members list styling
  (`app/(dashboard)/back-office/team-members/page.tsx`) rather than inventing a new
  member-card component.

## Do's and Don'ts

- **Do** reuse `FormBuilder` + existing `lib/forms/*` configs wherever a form config
  already exists (business account creation, team invites) — do not hand-roll a form for
  something the config-driven builder already covers.
- **Don't** hand-roll a form builder config for the public lead-request form. It is six
  plain fields with no config-driven reuse pressure (nothing else in the app needs "post a
  rental requirement" fields), and forcing it through the builder would be overhead, not
  consistency — a judgment call, not an oversight.
- **Do** keep the amber caution surface reserved for "we don't know this yet" states only.
  Reusing it for errors or for a generic warning would blur the one distinction it exists
  to make.
- **Don't** add a dark badge/gradient treatment to any of these surfaces — they are
  utility screens (an internal list, a settings page, a plain form), not marketing
  surfaces, and should read as functional rather than promotional.
