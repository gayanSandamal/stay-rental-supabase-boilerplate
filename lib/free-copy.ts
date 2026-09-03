import { isFeatureEnabled } from '@/lib/feature-flags';

/**
 * The "100% free of charge" positioning, in one place.
 *
 * Easy Rent's wedge is not that it is *cheaper* than ikman or Lanka Property
 * Web — it is that listing and renting here cost nothing at all. "Affordable"
 * invites a price comparison; "free of charge" ends the conversation. Every
 * public surface should say the second thing.
 *
 * ── Why this is gated ──────────────────────────────────────────────────────
 * `enablePricingSection` is the master switch for paid visibility, and it is
 * OFF by default and off in production: while it is off there are no renter
 * plans, no landlord plans, no Boost/Featured/Urgent purchase, and nothing
 * anywhere on the platform costs money. The loud copy is therefore literally
 * true today.
 *
 * If someone turns that flag on, "100% free of charge" would sit directly above
 * an LKR 500 Featured card — the single most damaging thing a pricing page can
 * do. So every headline here is read through `isPlatformFullyFree()`, and the
 * `*_PAID` variants are what renders instead: still leading with free listings
 * (they stay free and unlimited on every tier by design — `LISTING_LIMITS` is
 * 999999 in lib/landlord-plans.ts), but never claiming the whole platform is.
 *
 * Do not inline these strings at call sites. The phrase appears on roughly a
 * dozen surfaces and its whole value is that it reads identically on all of
 * them.
 */

/** True when nothing on the platform is for sale — see the note above. */
export function isPlatformFullyFree(): boolean {
  return !isFeatureEnabled('enablePricingSection');
}

/** Short pill/badge text. Uppercased by the badge component itself. */
export const FREE_BADGE = '100% Free of Charge';

/** Badge text when paid visibility is live — listings are still free. */
export const FREE_BADGE_PAID = 'Free to List';

/** One-line promise for heroes and section subtitles. */
export const FREE_PROMISE =
  'No listing fees, no commission, no subscription — not now, not later.';

export const FREE_PROMISE_PAID =
  'Listing is free and unlimited. Pay only if you want extra visibility.';

/** Renter-facing line: browsing and contacting never cost anything. */
export const FREE_RENTER_LINE =
  'Browsing, searching and contacting owners is 100% free of charge.';

/** Landlord-facing line, for when paid visibility is live. */
export const FREE_LANDLORD_LINE_PAID =
  'Listing your property is free and unlimited, with no commission when you find a tenant.';
