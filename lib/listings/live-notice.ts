import { greetingName } from '@/lib/imports/message';

/**
 * The WhatsApp notice a landlord gets when ops approve their listing
 * (Approve & Activate, or the status dropdown — PATCH /api/listings/[id]).
 *
 * WHY A TEMPLATE. This used to be free-form text, which WhatsApp only accepts
 * inside the 24-hour window the landlord's own last message opened. Manual
 * review routinely takes longer than that, and re-approving an EXPIRED listing
 * always does — it was published 30+ days ago — so the "now live" message was
 * rejected with 131047 and ops got a "contact the owner manually" alert
 * instead. An approved template is delivered whether or not the window is open.
 *
 * THE TEMPLATE TEXT IS THE CONTRACT. `LIVE_TEMPLATE_TEXT` is the exact body to
 * register in the WhatsApp Manager as `listing_live_notice`, English, category
 * **Utility** (the recipient is an existing customer and this is about their
 * own listing), with one dynamic URL button "View listing" based on
 * `https://easyrent.lk/listings/` taking the listing id as its suffix. A
 * variable count that drifts from this file fails for every recipient at once
 * with nothing failing locally; `tests/unit/live-notice.test.ts` holds them
 * together.
 *
 * Until `WHATSAPP_LIVE_TEMPLATE` is set the route keeps sending the old
 * free-form text, which still works for an approval inside the window — so the
 * code can ship before Meta approves the template. Once it is set there is no
 * free-form fallback: outside the window it cannot succeed, and repeated failed
 * business-initiated sends degrade the WABA quality rating.
 *
 * PARAMETERS CANNOT CONTAIN NEWLINES, tabs or 5+ spaces, and every declared
 * variable must always be non-empty — Meta rejects the send otherwise.
 * `sanitizeTemplateParam` handles the first, the fallbacks below the second.
 * No promotional wording ("free", "no commission"): it is what pushes Meta's
 * classifier from Utility to Marketing, and a Marketing template is silently
 * dropped for anyone who has switched marketing messages off.
 */
export const LIVE_TEMPLATE_TEXT = `✅ Easy Rent — your listing is live

Hi {{1}}, your listing "{{2}}" has been approved and is now live on Easy Rent.

Tenants will contact you directly by phone or WhatsApp. It stays listed for {{3}} days.

Tap below to see it.`;

export const LIVE_TEMPLATE_PARAM_COUNT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LiveNoticeInput {
  ownerName: string | null;
  listingTitle: string;
  expiresAt: Date | null;
  now: Date;
  /** Used when the listing has no expiry to count down from. */
  expirationDays: number;
}

/** Whole days left, never below 1 — "listed for 0 days" reads as a mistake. */
export function daysLive(expiresAt: Date | null, now: Date, expirationDays: number): number {
  if (!expiresAt) {
    return Number.isFinite(expirationDays) && expirationDays > 0 ? Math.round(expirationDays) : 30;
  }
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
}

/** Exactly LIVE_TEMPLATE_PARAM_COUNT values, none ever empty. */
export function liveTemplateParams(input: LiveNoticeInput): string[] {
  return [
    greetingName(input.ownerName),
    input.listingTitle.trim() || 'your property',
    String(daysLive(input.expiresAt, input.now, input.expirationDays)),
  ];
}

/** What the template reads as, for logs and tests. */
export function renderLiveText(params: string[], link: string): string {
  return params
    .reduce((text, value, index) => text.replaceAll(`{{${index + 1}}}`, value), LIVE_TEMPLATE_TEXT)
    .concat(`\n\n${link}`);
}
