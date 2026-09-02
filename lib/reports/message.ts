/**
 * Composing the report a landlord actually reads.
 *
 * THE TEMPLATE TEXT IS THE CONTRACT. `REPORT_TEMPLATE_TEXT` below is not
 * documentation — it is the exact body that must be registered and approved in
 * the WhatsApp Manager, because Meta matches on the approved text and a
 * template whose variable count drifts from this file starts failing for every
 * recipient at once, with no local error to catch it. `reportTemplateParams`
 * returns exactly `REPORT_TEMPLATE_PARAM_COUNT` values, and a unit test holds
 * the two in agreement.
 *
 * EVERY PARAMETER IS ALWAYS PRESENT. Meta rejects a template send that omits a
 * declared variable, so there is no "leave the top-performer line out when
 * there are no active listings" — the empty case gets a sentence of its own.
 * That is why the layout is one label-per-line rather than optional blocks.
 */

import { isFeatureEnabled } from '@/lib/feature-flags';
import type { LandlordReportData, ReportListingRow } from './data';
import type { ReportPeriod } from './period';

/**
 * Register EXACTLY this body in the WhatsApp Manager, category **Utility**.
 *
 * Category matters: a report a landlord opted into about their own property is
 * a utility message, and Utility is both cheaper and far less likely to be
 * blocked than Marketing. If Meta reclassifies it as Marketing, the upsell
 * sentence in the nudge is the reason — see `buildNudge`, which drops every
 * promotional line while paid visibility is switched off.
 */
export const REPORT_TEMPLATE_TEXT = `📊 Easy Rent — your listing report

Hi {{1}}, here's how you did over {{2}}.

👁 Views: {{3}}
📈 Trend: {{4}}
🏠 Listings: {{5}}
⭐ Best performer: {{6}}

💡 {{7}}

Reply STOP to turn these reports off.`;

export const REPORT_TEMPLATE_PARAM_COUNT = 7;

/**
 * A greeting is not a byline. `publisherDisplayName` deliberately falls through
 * to the email address for a nameless landlord, which is right on a listing
 * page and wrong in a WhatsApp message addressed to that person — "Hi
 * gayan@example.com" reads as a mailmerge failure. A nameless landlord gets
 * "Hi there".
 */
export function greetingName(user: { name?: string | null }): string {
  const name = user.name?.trim();
  if (!name) return 'there';
  // First name only: "Hi Nimal" not "Hi Nimal Perera Jayawardena".
  return name.split(/\s+/)[0];
}

function formatTrend(data: LandlordReportData, period: ReportPeriod): string {
  if (data.changePct === null) {
    return data.totalViews > 0 ? 'first report — no comparison yet' : 'no views to compare yet';
  }
  if (data.changePct === 0) return `flat vs the previous ${periodNoun(period)}`;
  const direction = data.changePct > 0 ? 'up' : 'down';
  return `${direction} ${Math.abs(data.changePct)}% vs the previous ${periodNoun(period)}`;
}

/** "the last 7 days" → "7 days", so "vs the previous 7 days" reads correctly. */
function periodNoun(period: ReportPeriod): string {
  return period.label.replace(/^the last /, '');
}

function formatListings(data: LandlordReportData): string {
  if (data.totalListings === 0) return 'none yet';
  const parts = [`${data.activeListings} active`];
  if (data.expiringSoon > 0) {
    parts.push(`${data.expiringSoon} expiring within 7 days`);
  }
  if (data.expiredListings > 0) {
    parts.push(`${data.expiredListings} expired`);
  }
  return parts.join(', ');
}

function formatTopListing(top: ReportListingRow | null): string {
  if (!top) return 'no active listings yet';
  if (top.views === 0) return `${top.title} (no views yet)`;
  return `${top.title} (${top.views} view${top.views === 1 ? '' : 's'})`;
}

/**
 * The one line worth reading twice.
 *
 * Ordered by what the landlord can act on TODAY, not by what is most
 * impressive: an expiring listing is a property about to vanish from search, so
 * it outranks a nice trend number every time. Only one nudge is ever shown —
 * three pieces of advice in a WhatsApp bubble is zero pieces of advice.
 *
 * `marketAvgRent` is optional and may be null; the pricing nudge is skipped
 * rather than softened when there is nothing solid to compare against.
 */
export function buildNudge(
  data: LandlordReportData,
  marketAvgRent: number | null
): string {
  // While paid visibility is off the platform presents as fully free, so no
  // nudge may point at a product nobody can buy. This is the same rule the
  // pricing section and every upgrade CTA follow.
  const canSell = isFeatureEnabled('enablePricingSection');

  if (data.totalListings === 0) {
    return 'You have no listings yet — post one free and renters can find you today.';
  }

  if (data.expiringSoon > 0) {
    const n = data.expiringSoon;
    return `${n} listing${n === 1 ? '' : 's'} expire${n === 1 ? 's' : ''} within 7 days. Renew to stay in search results.`;
  }

  if (data.expiredListings > 0 && data.activeListings === 0) {
    return 'All your listings have expired. Renewing takes one tap and puts them back in search.';
  }

  const top = data.topListing;
  if (top && marketAvgRent && marketAvgRent > 0) {
    const overPct = Math.round((top.rentPerMonth / marketAvgRent - 1) * 100);
    if (overPct >= 15) {
      return `Similar ${top.bedrooms}BR homes in ${top.city} average LKR ${marketAvgRent.toLocaleString('en-LK')} — yours is ${overPct}% above, which is the usual reason views stay low.`;
    }
  }

  if (data.zeroViewActive > 0) {
    const n = data.zeroViewActive;
    return `${n} of your active listing${n === 1 ? ' got' : 's got'} no views. Listings with 6+ photos and a filled-in description get found far more often.`;
  }

  if (data.changePct !== null && data.changePct <= -25) {
    return canSell
      ? 'Views dropped sharply this period. A Boost puts your listing back at the top of search for 7 days.'
      : 'Views dropped sharply this period. Refreshing your photos and description usually brings them back.';
  }

  if (data.changePct !== null && data.changePct >= 25) {
    return 'Views are climbing — reply quickly to callers while interest is high.';
  }

  if (data.totalViews === 0) {
    return 'No views this period. Check that your rent, photos and location are all filled in — those three decide whether renters open a listing.';
  }

  return 'Renters contact landlords who answer fast. Keep your phone handy.';
}

/** The positional {{1}}…{{7}} values, in template order. */
export function reportTemplateParams(args: {
  name: string;
  data: LandlordReportData;
  period: ReportPeriod;
  marketAvgRent: number | null;
}): string[] {
  const { name, data, period, marketAvgRent } = args;
  return [
    name,
    period.label,
    String(data.totalViews),
    formatTrend(data, period),
    formatListings(data),
    formatTopListing(data.topListing),
    buildNudge(data, marketAvgRent),
  ];
}

/**
 * The same report as plain text — for the in-app notification body, the
 * dry-run log, and anywhere a template is not the delivery mechanism.
 *
 * Rendered from the SAME params as the template so the two can never drift
 * into telling a landlord different numbers.
 */
export function renderReportText(params: string[]): string {
  const [name, periodLabel, views, trend, listingsLine, top, nudge] = params;
  return [
    `📊 Easy Rent — your listing report`,
    ``,
    `Hi ${name}, here's how you did over ${periodLabel}.`,
    ``,
    `👁 Views: ${views}`,
    `📈 Trend: ${trend}`,
    `🏠 Listings: ${listingsLine}`,
    `⭐ Best performer: ${top}`,
    ``,
    `💡 ${nudge}`,
  ].join('\n');
}

/** Short enough for the notification-centre title column (varchar 200). */
export function reportNotificationTitle(data: LandlordReportData, period: ReportPeriod): string {
  return `${data.totalViews} view${data.totalViews === 1 ? '' : 's'} on your listings over ${period.label}`;
}
