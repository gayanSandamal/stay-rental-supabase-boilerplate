---
name: Day One Monetization Strategy
overview: "Refined revenue strategy: 3-listing free tier, Boost (LKR 250/7d), landlord plans (Basic LKR 500, Premium LKR 1,250, Agency LKR 3,500), staged launch. Landlord monetization is the main launch engine; renter Premium is secondary."
todos: []
isProject: false
---

# Refined Day-One Monetization Strategy

## Executive Summary

Easy Rent should monetize from launch through **three primary landlord-side levers** and **one secondary renter-side lever**:

1. **Free Landlord Tier** to acquire supply fast
2. **Boost Listing** to monetize visibility without forcing a subscription
3. **Landlord Plans** to monetize portfolio growth and higher intent
4. **Renter Premium** as an existing add-on, but not the main launch revenue driver

The goal is simple:

- Get as many quality landlords onboarded as possible
- Keep the first paywall soft
- Monetize visibility and scale
- Preserve trust through verification and Sri Lanka-specific rental features

This keeps the business easy to understand while still generating revenue from day one.

---

## Strategic Positioning

Easy Rent should not try to beat ikman.lk or Lanka Property Web by being cheaper alone. It should win by being:

- **Rental-first**
- **Trust-first**
- **Verification-led**
- **Sri Lanka-specific**
- **Easier for landlords to convert leads into WhatsApp calls and site visits**

That is already the strongest part of the positioning and should stay central in the messaging.

---

## Final Recommended Pricing Structure

### 1) Free

**Price:** LKR 0  
**Who it is for:** Individual landlords and first-time posters

Includes:

- Up to **3 active listings**
- Standard search visibility
- Phone and WhatsApp contact
- Manual verification / approval workflow
- 30-day listing duration

Purpose:

- Remove friction
- Build inventory quickly
- Give every landlord a working reason to try the platform

### 2) Basic

**Price:** **LKR 500/month total**  
**Who it is for:** Landlords who need more than 3 active listings

Includes:

- Up to **5 active listings**
- Higher ranking than Free
- Renewal reminders
- Better listing management visibility

Purpose:

- First upgrade step
- Cleanest conversion path when user hits the Free limit

### 3) Premium

**Price:** **LKR 1,250/month**  
**Who it is for:** Serious landlords who want stronger lead flow

Includes:

- Up to **10 active listings**
- Featured placement in search/results
- Basic analytics
- Faster review / approval priority
- "Verified landlord" trust emphasis in UI

Purpose:

- Monetize landlords who care about speed and visibility, not just capacity

### 4) Agency / Subscription

**Price:** **LKR 3,500/month**  
**Who it is for:** Agents and larger portfolio owners

Includes:

- **Unlimited** active listings
- Featured placement
- Full analytics
- Priority support
- Agency badge
- Lead export / better dashboard workflow later

Purpose:

- Capture higher-value customers without promising true unlimited from day one

Agency tier offers unlimited listings for agents and large portfolio owners.

### 5) Boost Listing

**Price:** **LKR 250 for 7 days**  
**Who it is for:** Mainly Free and Basic landlords, though anyone can use it

Includes:

- Temporary featured placement
- Better ranking for one listing
- Clear expiry date

Purpose:

- Lowest-friction monetization
- Easy upsell
- Great for urgent vacancies

### 6) Renter Premium

**Price:** **LKR 300/month**  
**Who it is for:** Frequent renters or high-intent seekers

Includes:

- Early access to new listings
- Unlimited alerts
- Premium search/filter tools
- Saved searches and notification priority

Purpose:

- Secondary launch revenue stream
- More valuable once listing volume and demand are stronger

---

## Recommended Launch Order

### True Day-One Monetization

Launch only these as active monetization products:

- Free
- Basic
- Boost
- Existing Renter Premium

### Launch After First Traction

Release after first landlord activity is proven:

- Premium
- Agency / Subscription
- Advanced analytics
- Priority support workflows

This is cleaner than launching every monetization layer at once.

---

## Ranking Logic

Recommended sort order:

1. `boostedUntil > now`
2. `planTierWeight DESC`
3. `isVerified DESC`
4. `listingCompletenessScore DESC`
5. `createdAt DESC`

That gives you:

- A monetization lever
- A trust lever
- A quality lever
- A freshness lever

This is better than just "featured, then plan tier, then createdAt."

---

## Conversion Triggers

The pricing only works if the upgrade prompts appear at the right moment.

### Free → Basic

Trigger when:

- Landlord tries to publish a 4th active listing
- Landlord sees decent views but low visibility
- Landlord receives "limit reached" on dashboard

Message:

> You've reached your free limit of 3 active listings. Upgrade to Basic for LKR 500/month and publish up to 5 listings.

### Free / Basic → Boost

Trigger when:

- Listing has been live for 3–5 days with low views
- Landlord marks listing as urgent
- Landlord opens listing dashboard

Message:

> Need faster results? Boost this listing for 7 days for LKR 250.

### Basic → Premium

Trigger when:

- Landlord has 5 active listings and tries to add more
- Landlord wants stronger ranking
- Landlord wants analytics

Message:

> Upgrade to Premium for featured visibility, analytics, and up to 10 active listings.

### Premium → Agency

Trigger when:

- Landlord consistently exceeds 10 listings
- Landlord is an agent or broker
- Landlord needs faster support and bulk management

---

## Revenue Model

At launch, the healthiest split is:

- **40–50%** from landlord subscriptions
- **25–35%** from Boost
- **10–20%** from renter premium
- Later, additional revenue from ads, partner services, or paid verification

That mix protects you from depending only on subscriptions.

---

## Refined Revenue Projection


| Month | Free | Basic | Premium | Agency | Boosts | Renter Premium | Total           |
| ----- | ---- | ----- | ------- | ------ | ------ | -------------- | --------------- |
| 1     | 80   | 10    | 3       | 0      | 15     | 12             | **LKR 16,100**  |
| 3     | 220  | 30    | 8       | 2      | 60     | 45             | **LKR 60,500**  |
| 6     | 500  | 80    | 20      | 6      | 180    | 120            | **LKR 167,000** |


Assumptions:

- Basic = 500
- Premium = 1,250
- Agency = 3,500
- Boost = 250
- Renter Premium = 300

---

## MVP Payment Operations

### Recommended MVP payment setup

- Bank transfer / payment slip confirmation
- Manual admin activation for paid plans
- Manual admin boost approval
- Expiry date stored in database
- Admin override panel for plans and boosts

### Add later

- Payment gateway
- Auto-renew
- Self-serve checkout
- Invoices / receipts
- Failed-payment handling

This reduces engineering effort and lets you validate willingness to pay first.

---

## Product Rules

### Listing limits

- Free: 3 active
- Basic: 5 active
- Premium: 10 active
- Agency: unlimited

### Listing expiry

- All tiers: 30 days initially
- Free can later move to 14 or 21 days if you need a stronger upgrade lever

### Boost rules

- One active boost per listing
- No stacking
- Re-boost allowed after expiry
- Boost never bypasses approval or verification rules

**Payment should improve visibility, not weaken trust.**

---

## Refined Implementation Roadmap

### Phase 1 — Launch essentials

- Landlord plan tier fields
- Plan expiry fields
- Listing boost fields
- Listing-limit enforcement
- Ranking logic
- Admin plan activation
- Admin boost activation
- Dashboard upgrade prompts

### Phase 2 — Monetization UX

- Pricing page rewrite
- Upgrade CTA on dashboard
- Boost CTA on each listing
- Plan badges
- Boosted-until badge
- Expiry reminders

### Phase 3 — Premium value

- Listing views tracking
- Simple analytics
- Landlord performance summary
- Lead stats

### Phase 4 — Scale features

- Self-serve checkout
- Invoices
- Auto-renewals
- Agent workflows
- Partner upsells

---

## Copy Changes

### Homepage / landlord CTA

> List your first 3 properties free. Need more visibility? Boost from LKR 250.

### Pricing page

> Start free. Upgrade only when you need more listings or better exposure.

### Dashboard paywall

> You've reached your free limit. Upgrade to Basic for LKR 500/month.

### Boost CTA

> Get more views for 7 days. Boost this listing for LKR 250.

---

## Final Recommendation

Ship this model:

- **Free:** 3 listings
- **Basic:** LKR 500/month, 5 listings
- **Premium:** LKR 1,250/month, 10 listings
- **Agency:** LKR 3,500/month, unlimited listings
- **Boost:** LKR 250 / 7 days
- **Renter Premium:** Keep live, but do not depend on it for launch revenue

That gives you:

- Low-friction inventory growth
- A clear first paid upgrade
- A high-conversion microtransaction
- A cleaner path to premium plans

The next step is to align the product logic, pricing page, admin activation flow, and dashboard CTAs to this structure.