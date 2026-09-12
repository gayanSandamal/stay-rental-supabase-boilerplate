# Broker Pivot — Domain & Market Research

**Date:** 2026-09-12 · **Method:** Desk research only (no broker interviews — see the
flagged gap in FORGE.md and the plan). Sources are cited inline; where the open web had
nothing, that absence is stated rather than filled with inference.

---

## 1. Sri Lankan broker fee norms

- **Standard practice: the landlord pays the broker, ~1 month's rent**, often shared with
  the tenant. Confirmed independently by the user's own market experience this session.
  [Colombo Realtors FAQ](https://colomborealtors.lk/frequently-asked-questions/)
- **The Rent Act makes this illegal on a subset of properties.** Where the Act applies, "if
  a landlord receives or recovers any premium, commission, gratuity or other like payment
  or pecuniary consideration in addition to the proportionate rent, the landlord shall be
  guilty of an offence" — and the same for a tenant who pays one. No premium, commission or
  gratuity may be a condition of granting, renewing or continuing a Rent Act tenancy.
  [Rent Act — Laws of Sri Lanka](https://www.srilankalaw.lk/revised-statutes/volume-vii/1032-rent-act.html)
- **Most of the market Easy Rent targets sits outside the Act.** The Act applies to a
  defined, largely older/rent-controlled housing stock; where it doesn't apply, "the amount
  of security deposit is freely negotiable between the landlord and tenant"
  ([Just Landed — Sri Lankan rental process](https://www.justlanded.com/english/Sri-Lanka/Sri-Lanka-Guide/Housing-Rentals/Sri-Lankan-rental-process)),
  and by extension so is a broker's fee. **This is not a research gap to close — it is a
  legal fact that changes what "fee disclosure" is allowed to claim.** A disclosure feature
  must not imply every fee is negotiable or always legal; on the (smaller, older) Rent-Act
  slice of the market, a disclosed commission is itself evidence of an offence. Positioning
  and product copy in Phase 0.3 should not force a determination of Rent-Act status per
  listing — that is a legal question beyond what a rental marketplace can safely assert.

**Gap, stated plainly:** nothing on the open web describes *how* Sri Lankan brokers work
day to day — how many properties they typically carry, whether they operate solo or in
loose networks, how they currently advertise (which platforms, WhatsApp groups, print),
or how they'd react to a fee-disclosure requirement. This is exactly the kind of thing 10
free phone calls would answer and desk research cannot. Flagged again in FORGE.md.

---

## 2. Duplicate-listing landscape across portals (the evidence base for "one property, every agent")

Desk research (via `WebFetch`) confirms the shape but not hard duplicate-rate numbers:

- **LankaPropertyWeb has a dedicated, populated agent ecosystem**: agent/company name,
  logo, service categories, coverage area, and a **"VERIFIED"** badge on roughly a quarter
  of agents sampled (7–8 of 30 on page 1 of the rentals directory). Three pages of rental
  agents (~60+ total) are listed. [LPW rental agents](https://www.lankapropertyweb.com/agents/estate_agents.php?agent_type=Rentals)
- LPW's own claimed scale: **8,240+ listings (3,230+ Colombo apartments)** per the prior
  `MONETIZATION_REVIEW_2026-08.md` verification — this is the inventory base against which
  any Easy Rent dedup/aggregation claim would be judged, not something Easy Rent can match
  by volume.
- **No hard data exists publicly on duplicate-listing rates** (the same physical property
  appearing under multiple broker ads on the same or different portals). This is an
  observable fact pattern — not a survey question — and is exactly the kind of evidence a
  same-day teardown could produce: pick 10–15 rental ads in one neighbourhood (e.g. Nugegoda
  or Colombo 5) across ikman, LPW and a public Facebook property group, and check by address
  string and photos whether the same unit recurs. **This teardown was not run in this pass**
  (budget/scope) and should be the first concrete task if Phase 2 is ever greenlit — it is
  the single piece of evidence that would confirm or kill the premise that duplicate broker
  listings are common enough to be worth collapsing.

---

## 3. ikman's rental fee structure (the wedge, quantified)

- **Free tier**: rental ads for houses/commercial/rooms-annexes are free up to
  **LKR 10,000/month rent**; apartment rentals free up to an **LKR 8 million** value
  threshold (sale-side framing bleeding into the rental fee page — the ikman source
  conflates value and rent thresholds inconsistently, so treat the LKR 10,000 rent figure
  as the reliable one for the "rentals" category specifically).
  [ikman: Post your ad absolutely FREE](https://blog.ikman.lk/post-your-ad-absolutely-free-on-ikman-marketplace/)
- **Above the free threshold, ikman charges a listing fee**, and separately sells visibility
  **Boost Ads starting at LKR 150**. [ikman: Sell or Rent your Property](https://ikman.lk/en/sell-property)
- This confirms the wedge already encoded in `lib/free-copy.ts`: *"free to list the
  properties ikman charges you to list"* is a checkable, specific claim, not marketing
  filler — most Colombo rentals worth advertising sit above LKR 10,000/month and would cost
  something on ikman.

---

## 4. What this means for the three concepts

| Concept | What research supports | What research cannot yet confirm |
|---|---|---|
| Free broker back-office | The free-vs-ikman's-paid-tier wedge is real and quantified | Whether brokers will actually switch tools for it — untested |
| One property, every agent | LPW's agent ecosystem is real, sizeable, and the natural comparison point | Actual duplicate-listing prevalence — no teardown run |
| Qualified lead routing | Nothing — no public data on SL rental lead value or broker willingness to pay for leads | Everything — this concept has the thinnest evidence base of the three |

**Consequence for sequencing:** research reinforces, rather than changes, the plan's forced
order (back-office → multi-agent property → lead routing). Concept 3 in particular should
not receive design investment until Concept 1 has generated enough real leads to make the
question answerable at all.
