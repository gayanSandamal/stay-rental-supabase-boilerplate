# Broker Pivot — Pressure Test

**Date:** 2026-09-12 · Forged against three concepts, per the user's instruction:
incorporate and facilitate brokers; do not copy an agent directory; do not hire agents as
labour. Each concept below must survive four hostile questions and a pre-mortem, in
writing, before Phase 1 build work is justified.

---

## Concept 1 — Free broker back-office

**The pitch:** a broker forwards a landlord's WhatsApp photos/details to Easy Rent's
existing intake pipeline; gets a portfolio dashboard, expiry reminders, bulk renew, and
WhatsApp performance reports — all switched on, none of it paid.

**Q1 — Why would a broker give their inventory to a site with 33 lifetime page views?**
Not for traffic — there isn't any. The honest answer is *free tooling that replaces a
worse status quo*: a broker today tracks listings by memory, WhatsApp chat history, and
whichever portal's admin panel they happen to be logged into. `getPortfolioInsights`
(views/impressions/contact-clicks, 5 queries flat regardless of portfolio size),
`bulk-renew`, and the WhatsApp performance report are real, working software a broker
cannot get from ikman or LPW at any price. **Survives** — but only if the pitch is made
honestly as "better tooling," never "more reach." Any onboarding copy that implies traffic
is the draw is a lie the broker discovers in one week.

**Q2 — What stops a broker from listing on Easy Rent *and* ikman *and* LPW?**
Nothing, and nothing should. Non-exclusivity is the default assumption for this whole
pivot. A broker who cross-posts is not a failure mode — cross-posting is how they always
work, and the WhatsApp-forward mechanic is designed to cost them nothing extra: the same
message that gets forwarded to Easy Rent can be the same one already sent to a dozen
Facebook groups. **Survives**, with a caveat that flows into Concept 2: a broker
cross-posting means the *same property* will independently arrive via WhatsApp intake and
possibly via a landlord's own listing too — this is where dedup (currently exact-address-
match only, and absent entirely from the Facebook import path) becomes load-bearing, not
optional.

**Q3 — If fee disclosure is optional, brokers who hide fees out-compete those who show
them. If mandatory, brokers leave.**
This question targets Concept 3 (positioning) more than Concept 1, but it bears on
onboarding: Concept 1's dashboard should *not* attempt fee disclosure. Bolting fee UI onto
the free back-office pitch turns a "here's free software" offer into "here's free software,
plus tell renters what you charge" — a materially worse deal for the broker, adopted at
the exact moment they're evaluating whether to bother. **Resolution: defer fee disclosure
entirely out of Concept 1.** It belongs, if anywhere, in Concept 2's property page, where
it's structurally tied to something the broker is already getting (co-listing on a
property page), not tacked onto a free tool with no offsetting benefit.

**Q4 — Who adjudicates when two brokers claim the same property?**
Doesn't apply to Concept 1 as scoped — each broker's dashboard is scoped to listings they
submitted (`businessAccountId` / `createdBy`), with no shared-property concept yet. This
question is Concept 2's, not Concept 1's, and Concept 1 should stay that way deliberately —
adding property-identity logic here is scope creep the free-tool pitch doesn't need.

**Pre-mortem — 12 months on, this failed. Why?**
Most likely: it never launched past a handful of brokers because there was no active
recruitment. The infrastructure being "80% built" is not the same as brokers knowing it
exists — someone still has to find brokers (ikman ad phone numbers, Facebook groups, LPW's
own agent directory) and pitch them individually. The MONETIZATION_REVIEW's own warning
applies here too: switching on eight built systems is easy to mistake for progress; the
actual bottleneck was never engineering capacity.

**Verdict: proceed to Phase 1.** Lowest cost, no dependency on unproven demand, and it's
the necessary precondition for the other two concepts to mean anything.

---

## Concept 2 — One property, every agent on it

**The pitch:** a property is the canonical unit, not the ad. One page per house; every
broker (and the owner) attached to it, each with their own fee disclosed; the renter picks
who to call.

**Q1 — Why would a broker attach to a shared property page instead of just posting their
own ad?**
Because it's the only place a renter can compare who's offering the best terms on the same
unit *without leaving the site* — which cuts both ways: it's also the only place a renter
can see a competitor undercutting them. A broker who is confident in their price/service
has a reason to be there; a broker relying on being the only listing a renter finds does
not. **This is not a universal draw — it selects for brokers willing to compete on
disclosed terms**, which may be a minority. Not fatal, but the pitch must be honest about
who it's for.

**Q2 — Non-exclusivity, again.** Same as Concept 1: nothing stops cross-posting elsewhere.
Doesn't change here.

**Q3 — Fee disclosure, optional vs. mandatory.**
This is the concept's central unresolved tension, restated from Concept 1: if disclosure is
optional, the page can't promise "no surprise fees" (an undisclosed-fee broker sits
alongside disclosed ones with no visible difference) — the promise collapses to nothing. If
mandatory, a broker who profits from ambiguity elsewhere has a reason not to attach here at
all, which caps adoption to brokers who were already going to be transparent. **Not
resolved by this pass.** The honest framing: mandatory disclosure is a **filter**, not a
neutral feature — it deliberately excludes non-transparent brokers, and that is the point,
not a flaw to engineer around. Concept 2 should be built, if at all, explicitly as "the
place where the transparent brokers differentiate themselves," not as a universal broker
tool.

**Q4 — Adjudication: who owns the property record when two brokers both claim it?**
No answer exists today, and none is invented here — this is exactly the identity decision
the plan flags as unresolved and defers to actual build time, after Gate 1, when real
overlapping claims can inform the rule rather than a hypothetical one. Two directions worth
naming without picking: (a) first-claim-wins with a dispute/merge flow, mirroring how
`enableDuplicateDetection`'s 409 already works for exact matches; or (b) no single owner —
the property record itself is neutral, agents are strictly attachments, and there's nothing
to "win." (b) avoids the adjudication problem entirely by not creating anything to
adjudicate, at the cost of not being able to show a single authoritative "listed by."
Worth deciding with real cases in hand, not in the abstract.

**Pre-mortem — 12 months on, this failed. Why?**
Most likely failure: nobody attached, because Q1's selection effect was stronger than
expected — most brokers in this market compete by being the *only* option a renter sees,
not by disclosing better terms next to a rival's. If that's true, Concept 2 isn't a broker
feature at all; it's a renter-trust feature that a minority of brokers tolerate. Worth
naming now: **this concept may end up serving renters more than brokers**, which is fine,
but the pitch to brokers needs to stop pretending otherwise.

**Verdict: correct as the eventual differentiator, wrong to build now.** Its value is
mechanically zero with one active listing — there is nothing to collapse. Held behind
Gate 1 (≥2 brokers, ≥40 listings/city) as the plan specifies. The unresolved Q3/Q4 tensions
are real work, not administrative gaps, and should be designed against actual overlapping
listings once Gate 1 produces them — not against a hypothetical.

---

## Concept 3 — Qualified lead routing

**The pitch:** a renter states requirements once; matching brokers receive the lead.

**Q1 — Why would a broker pay for or want a routed lead over the ad-driven inquiries they
already get?**
Untestable from here — there is no data on SL rental lead value anywhere in the desk
research (see RESEARCH.md §4). This is the thinnest evidence base of the three concepts by
a wide margin.

**Q2 — Non-exclusivity.** Same structural issue, sharper here: a routed lead is worth less
if the same renter's requirements are also sitting in five other portals' forms
simultaneously — lead routing usually depends on some exclusivity or first-response
advantage that this pivot has no mechanism to create.

**Q3/Q4 — Not reachable.** Fee disclosure and adjudication both presuppose the routing
system has volume; there's no volume to reason about yet.

**Pre-mortem — 12 months on, this failed. Why?**
Overwhelmingly likely: it never had leads to route. Zero saved searches, 33 lifetime views.
A lead-routing feature built before demand exists is building a marketplace matcher with
one side of the market absent — the classic two-sided cold-start failure, and this platform
is currently colder than usual on both sides at once.

**Verdict: last, and correctly last.** The plan's Phase 3 blocker (no search-query log,
no zero-result tracking) is the right first fix — not routing logic, but instrumentation to
even learn what demand exists before designing a system to route it.

---

## Cross-cutting risk the plan already names

`MONETIZATION_REVIEW_2026-08.md` §11: *"a ninth workstream is the path of least
resistance… this is the modal outcome, not the tail risk."* All three concepts here are
buildable, all three are switched-off-or-adjacent infrastructure, and building all three
without the demand-side data to justify them would be exactly that failure mode with a
broker theme instead of a token-wallet theme. The gates in the plan (Gate 0→1: a written
answer on day-one broker value; Gate 1→2: ≥2 brokers + ≥40 listings/city) exist specifically
to stop that.

## Gate 0 → 1 answer

**What does a broker get on day one, and why is it worth their inventory?**

Free portfolio software — bulk renew, view/contact analytics per listing, WhatsApp
performance reports, expiry tracking — that replaces tracking-by-memory-and-chat-history,
delivered through the WhatsApp-forward mechanic they may already be using to cross-post
elsewhere, at zero cost and zero exclusivity commitment. **Not** traffic — there is none to
offer honestly. This answer is not "traffic," so per the plan's own gate, Phase 1 proceeds.
