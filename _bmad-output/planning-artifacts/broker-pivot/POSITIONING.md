# Broker Pivot — Positioning Spec: "No Surprise Fees"

**Date:** 2026-09-12 · Status: spec for Phase 1 copy work, not yet applied to source.

## The split

Two promises currently live in the same copy and must be pulled apart, because a broker
pivot affects them oppositely.

| Claim | Fate | Reason |
|---|---|---|
| "Easy Rent takes no commission / no listing fee" | **Keep, scope to Easy Rent** | Real, checkable wedge vs. ikman (free under LKR 10,000/mo rent, paid above — RESEARCH.md §3). Nothing about brokers changes what *Easy Rent* charges. |
| "No middleman / no agents / deal directly with the owner" | **Retire, replace** | Structurally false the moment a broker account exists; also targets a cost research suggests the renter rarely pays directly (landlord pays ~1 month, RESEARCH.md §1). |

New line to replace the second: **"No surprise fees."** Not "no fees" — transparency, not
absence. It only has teeth where a fee is actually disclosed (Concept 2, gated), so until
Gate 1 passes, use the weaker, still-true form: **"You know who you're dealing with, and
what it costs, before you call."**

## Rewrite table — surfaces that must change

| File:line | Current | Direction |
|---|---|---|
| `app/(dashboard)/rentals/[area]/page.tsx:134` | "you speak to the owner directly — no agents, no commission" | Drop "no agents." Keep "no commission" scoped: "…free to browse and free to contact — Easy Rent never takes a commission." |
| `app/(dashboard)/how-to-use/page.tsx:112` | "no account, no agent in the middle, nothing to pay" | Drop "no agent in the middle." |
| `components/how-it-works.tsx:27,391` | "No sign-in, no middlemen, and no charge" / "no middlemen, no hidden fees" | Drop "middlemen." "No hidden fees" survives unchanged — it's the "no surprise fees" claim already. |
| `components/key-differentiators.tsx:62` | "No middlemen, no booking fees — just you and the property owner" | Drop "just you and the property owner" (false once brokers list); keep "no booking fees." |
| `components/trust-signals.tsx:60` | "Phone & WhatsApp, no middlemen" | Replace with "Phone & WhatsApp, verified." |
| `components/for-landlords-section.tsx:56` | "Tenants call or WhatsApp you directly—no middleman" | Drop "no middleman." |
| `app/(dashboard)/list-your-property/page.tsx:64,214,323` | Three "no middleman" variants | Same treatment; this page is landlord-facing so "no commission" claims stay untouched. |
| `app/(dashboard)/listings/page.tsx:52` | "direct contact with the owner, no middlemen and no fees" | "direct contact with the owner or their agent" + drop "no middlemen"; "no fees" stays (refers to Easy Rent's fees). |

**Leave untouched** — these assert "no commission," not "no middleman," and survive as-is:
`lib/free-copy.ts:42-54`, `components/free-promise-section.tsx:33`,
`components/founding-landlord-cta.tsx:34`, `app/layout.tsx:39`.

**Do not touch, test-pinned:** `lib/imports/message.ts:100` — the literal string
`'never take a commission'` is asserted by `tests/unit/import-template.test.ts:154` and is a
registered Meta template; a wording change there requires re-registration and a
`RULES_VERSION`-style bump, out of scope for this pass.

## What "no surprise fees" requires before it can ship as a headline claim

It is a promise about disclosure. Shipping it as hero copy before any fee is actually
disclosed anywhere (i.e. before Concept 2 exists) would repeat exactly the mistake
`components/founding-landlord-cta.tsx`'s own code comments warn against — a promise with
"no cap, no counter, no per-landlord record" that "could not be honoured selectively or
even audited." So:

- **Now (Phase 1):** drop the false "no middleman" claims; do not yet add "no surprise
  fees" as a headline. Use the weaker, true-today form above, or simply omit the claim on
  surfaces where "no middleman" is removed.
- **After Gate 1, when Concept 2 ships fee disclosure on multi-agent property pages:**
  promote "no surprise fees" to a headline, scoped explicitly to properties that show it —
  same discipline as `lib/free-copy.ts`'s `isPlatformFullyFree()` gate: the claim is true
  only where the mechanism backing it actually exists.

## Scope note

`lib/free-copy.ts` centralizes only 6 of the ~40 free/anti-broker strings in the codebase;
the rest are hardcoded at ~15 call sites, and SEO metadata is a static export that cannot
read a feature flag at all. This rewrite is a copy pass across those ~15 files, not a
single-file change.
