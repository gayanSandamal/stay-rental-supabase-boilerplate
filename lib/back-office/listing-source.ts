import { and, isNotNull, isNull, not, sql, type SQL } from 'drizzle-orm';
import { listings } from '@/lib/db/schema';

/**
 * WHERE A LISTING CAME FROM, for Back Office → Listings.
 *
 * Four buckets, mutually exclusive by construction — the filter, the column
 * label and the chip counts all use the same precedence, so a listing is never
 * counted under one chip and shown under another:
 *
 *   imported  → a post_imports row points at it (Facebook / pasted advert)
 *   whatsapp  → a whatsapp_intakes row points at it (WhatsApp concierge)
 *   business  → created under a business account (agency / broker team)
 *   direct    → none of the above: a landlord listed it on the website
 *
 * Import beats WhatsApp beats business because each is the more specific fact
 * about provenance: an imported advert may be owned by a business account, but
 * "who wrote this text" is the question ops is asking.
 */
export const LISTING_SOURCES = ['direct', 'business', 'whatsapp', 'imported'] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

export const LISTING_SOURCE_LABELS: Record<ListingSource, string> = {
  direct: 'Direct',
  business: 'Business account',
  whatsapp: 'WhatsApp',
  imported: 'Imported',
};

export function isListingSource(value: string | undefined): value is ListingSource {
  return !!value && (LISTING_SOURCES as readonly string[]).includes(value);
}

const hasImport = sql<boolean>`exists (select 1 from post_imports pi where pi.listing_id = ${listings.id})`;
const hasIntake = sql<boolean>`exists (select 1 from whatsapp_intakes wi where wi.listing_id = ${listings.id})`;

/** SQL condition selecting exactly one bucket. */
export function sourceCondition(source: ListingSource): SQL {
  switch (source) {
    case 'imported':
      return hasImport;
    case 'whatsapp':
      return and(not(hasImport), hasIntake)!;
    case 'business':
      return and(not(hasImport), not(hasIntake), isNotNull(listings.businessAccountId))!;
    case 'direct':
      return and(not(hasImport), not(hasIntake), isNull(listings.businessAccountId))!;
  }
}

/** The bucket as a selectable column, same precedence as `sourceCondition`. */
export const sourceColumn = sql<ListingSource>`case
  when ${hasImport} then 'imported'
  when ${hasIntake} then 'whatsapp'
  when ${listings.businessAccountId} is not null then 'business'
  else 'direct' end`;

/** Pure version of the precedence, for tests and anything already holding the facts. */
export function classifySource(facts: {
  hasImport: boolean;
  hasIntake: boolean;
  businessAccountId: number | null;
}): ListingSource {
  if (facts.hasImport) return 'imported';
  if (facts.hasIntake) return 'whatsapp';
  if (facts.businessAccountId != null) return 'business';
  return 'direct';
}
