/**
 * Caption building. Pure — no I/O, no DB, no env beyond the base URL passed in.
 * Everything here is unit-tested in tests/unit/social-caption.test.ts.
 *
 * One hard rule, enforced by `stripContactDigits` and asserted in the tests:
 * A CAPTION MUST NEVER CARRY A PHONE NUMBER.
 * The whole product routes renters to the listing page, where contact numbers
 * are rate-limited, verified and revealed deliberately. Publishing a landlord's
 * personal number to a public social account would leak it permanently, to an
 * audience they never agreed to, and bypass every one of those controls. The
 * landlord's own free-text description is the realistic source of a stray
 * number, so it is scrubbed rather than trusted.
 */

import type { SocialPlatform } from './types';

/** What the builders need. A structural subset of the listings row. */
export interface CaptionListing {
  id: number;
  title: string;
  description?: string | null;
  city: string;
  district?: string | null;
  propertyType?: string | null;
  bedrooms: number;
  bathrooms?: number | null;
  areaSqft?: number | null;
  rentPerMonth: string | number;
  depositMonths?: number | null;
  powerBackup?: string | null;
  waterSource?: string | null;
  hasFiber?: boolean | null;
  parking?: boolean | null;
  petsAllowed?: boolean | null;
  acUnits?: number | null;
  isGated?: boolean | null;
  hasGuard?: boolean | null;
}

/** Instagram's documented ceilings. */
export const IG_CAPTION_MAX = 2_200;
export const IG_HASHTAG_MAX = 30;
/** TikTok's title field is short; the body goes in the description. */
export const TIKTOK_TITLE_MAX = 90;
/** Facebook allows far more than we would ever write. */
export const FB_CAPTION_MAX = 5_000;

/** Count by code points so an emoji is never split in half (cf. send.ts). */
function clip(value: string, max: number): string {
  const points = [...value];
  if (points.length <= max) return value;
  // Leave room for the ellipsis so the result is never over the cap.
  return points.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
}

/**
 * Remove anything that could be a Sri Lankan phone number.
 *
 * Deliberately blunt: any run of 7+ digits (ignoring spaces, dots and dashes
 * used as separators) is replaced, as are +94 forms. False positives cost us a
 * number in a caption; a false negative publishes someone's mobile to a public
 * feed. The asymmetry decides the aggressiveness.
 */
export function stripContactDigits(text: string): string {
  return text
    // +94 77 123 4567 / 0094-77-1234567
    .replace(/(?:\+|00)\s*94[\s.\-()]*\d[\d\s.\-()]{6,}/g, ' ')
    // 0771234567 / 077 123 4567 / 077-123-4567
    .replace(/\d[\d\s.\-()]{5,}\d/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 7 ? ' ' : match;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** "125,000" — LKR is written with thousands separators everywhere in the app. */
export function formatLkr(amount: string | number): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return String(amount);
  return Math.round(value).toLocaleString('en-US');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "3-bedroom house" / "Studio apartment" — the human summary line. */
function propertyLine(listing: CaptionListing): string {
  const type = listing.propertyType ? listing.propertyType.toLowerCase() : 'property';
  const beds = listing.bedrooms > 0 ? `${listing.bedrooms}-bedroom ` : '';
  return titleCase(`${beds}${type}`.trim());
}

function locationLine(listing: CaptionListing): string {
  return listing.district && listing.district !== listing.city
    ? `${listing.city}, ${listing.district}`
    : listing.city;
}

/**
 * The resilience fields. These are the whole point of the product in the Sri
 * Lankan market — power cuts and water supply decide whether a house is livable
 * — so they get their own line rather than being buried in the description.
 */
export function featureBullets(listing: CaptionListing): string[] {
  const out: string[] = [];
  if (listing.bathrooms) out.push(`🚿 ${listing.bathrooms} bath`);
  if (listing.areaSqft) out.push(`📐 ${listing.areaSqft.toLocaleString('en-US')} sqft`);
  if (listing.powerBackup && listing.powerBackup.toLowerCase() !== 'none') {
    out.push(`⚡ ${titleCase(listing.powerBackup)} backup`);
  }
  if (listing.waterSource) out.push(`💧 ${titleCase(listing.waterSource)} water`);
  if (listing.hasFiber) out.push('🌐 Fiber ready');
  if (listing.acUnits) out.push(`❄️ ${listing.acUnits} A/C`);
  if (listing.parking) out.push('🚗 Parking');
  if (listing.isGated || listing.hasGuard) out.push('🔒 Gated/secured');
  if (listing.petsAllowed) out.push('🐾 Pets OK');
  return out;
}

export function hashtagsFor(listing: CaptionListing): string[] {
  const citySlug = listing.city.replace(/[^A-Za-z0-9]/g, '');
  const tags = [
    '#EasyRentLK',
    '#SriLanka',
    '#HouseForRent',
    '#RentSriLanka',
    citySlug ? `#${citySlug}` : '',
    citySlug ? `#${citySlug}Rentals` : '',
    listing.propertyType ? `#${titleCase(listing.propertyType.replace(/[^A-Za-z0-9]/g, ''))}ForRent` : '',
    '#LongTermRental',
  ].filter(Boolean);
  // De-duplicate while preserving order — "Colombo" + propertyType can collide.
  return [...new Set(tags)].slice(0, IG_HASHTAG_MAX);
}

/** A short reference a renter can search on site when the URL isn't clickable. */
export function referenceCode(listingId: number): string {
  return `EZR${listingId}`;
}

interface BuildOptions {
  baseUrl: string;
  /** How much of the landlord's own description to carry over. */
  descriptionMax?: number;
}

/** The shared body every platform starts from. */
function coreLines(listing: CaptionListing, opts: BuildOptions): string[] {
  const lines: string[] = [];
  lines.push(`🏠 ${propertyLine(listing)} for rent in ${locationLine(listing)}`);
  lines.push('');
  lines.push(`💰 LKR ${formatLkr(listing.rentPerMonth)}/month`);
  if (listing.depositMonths) {
    lines.push(`🔐 ${listing.depositMonths} month${listing.depositMonths === 1 ? '' : 's'} deposit`);
  }

  const features = featureBullets(listing);
  if (features.length) {
    lines.push('');
    lines.push(features.join('  ·  '));
  }

  const description = (listing.description ?? '').trim();
  if (description) {
    const safe = stripContactDigits(description);
    if (safe) {
      lines.push('');
      lines.push(clip(safe, opts.descriptionMax ?? 300));
    }
  }
  return lines;
}

export function buildFacebookCaption(listing: CaptionListing, opts: BuildOptions): string {
  const lines = coreLines(listing, opts);
  lines.push('');
  lines.push(`👉 View photos & contact the owner: ${opts.baseUrl}/listings/${listing.id}`);
  lines.push('');
  lines.push(hashtagsFor(listing).join(' '));
  return clip(lines.join('\n'), FB_CAPTION_MAX);
}

/**
 * Instagram renders URLs as plain, unclickable text, so a bare link is just
 * noise the reader has to retype. Point at the bio and give them a code they
 * can paste into the site's search instead.
 */
export function buildInstagramCaption(listing: CaptionListing, opts: BuildOptions): string {
  const lines = coreLines(listing, { ...opts, descriptionMax: 220 });
  lines.push('');
  lines.push(`👉 Link in bio — search ${referenceCode(listing.id)}`);
  lines.push('');
  lines.push(hashtagsFor(listing).join(' '));
  return clip(lines.join('\n'), IG_CAPTION_MAX);
}

export function buildTikTokTitle(listing: CaptionListing): string {
  return clip(
    `${propertyLine(listing)} in ${locationLine(listing)} — LKR ${formatLkr(listing.rentPerMonth)}/mo`,
    TIKTOK_TITLE_MAX
  );
}

export function buildTikTokCaption(listing: CaptionListing, opts: BuildOptions): string {
  const lines = coreLines(listing, { ...opts, descriptionMax: 200 });
  lines.push('');
  lines.push(`👉 ${opts.baseUrl}/listings/${listing.id}`);
  lines.push('');
  lines.push(hashtagsFor(listing).join(' '));
  return lines.join('\n');
}

/**
 * The Facebook Group draft. A human pastes this by hand — Meta removed the
 * Groups API in April 2024 — so it reads as a complete post with no assumptions
 * about what the poster adds.
 */
export function buildFacebookGroupDraft(listing: CaptionListing, opts: BuildOptions): string {
  return buildFacebookCaption(listing, opts);
}

export function buildCaption(
  platform: SocialPlatform,
  listing: CaptionListing,
  opts: BuildOptions
): string {
  switch (platform) {
    case 'facebook_page':
      return buildFacebookCaption(listing, opts);
    case 'instagram':
      return buildInstagramCaption(listing, opts);
    case 'tiktok':
      return buildTikTokCaption(listing, opts);
    case 'facebook_group':
      return buildFacebookGroupDraft(listing, opts);
  }
}
