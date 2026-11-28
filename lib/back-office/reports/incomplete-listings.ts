/** Listings that would do better with something only the owner can give us. */
import { and, eq, gt, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { parsePhotos } from '@/lib/images/manifest';
import { colomboTimestamp } from './csv';
import {
  CONTACT_COLUMNS,
  LINK_COLUMNS,
  listingCells,
  loadContacts,
  loadListings,
} from './listing-rows';
import type { ReportDefinition } from './types';

export const MIN_PHOTOS = 3;
/** The length the search ranking already treats as a real description. */
export const MIN_DESCRIPTION = 50;

export interface DetailInput {
  photoCount: number;
  description: string | null;
  propertyType: string | null;
  contactCount: number;
  bathrooms: number | null;
  areaSqft: number | null;
  waterSource: string | null;
  depositMonths: number | null;
  keyMoney: string | null;
}

/** What renters decide on, and what merely helps them filter. */
export function missingListingDetails(row: DetailInput): { key: string[]; other: string[] } {
  const key: string[] = [];
  if (row.photoCount === 0) key.push('photos');
  else if (row.photoCount < MIN_PHOTOS) key.push(`more photos (has ${row.photoCount})`);
  // Same test as the ranking: LENGTH(description) > 50.
  const length = row.description?.trim().length ?? 0;
  if (length === 0) key.push('description');
  else if (length <= MIN_DESCRIPTION) key.push('longer description');
  if (!row.propertyType) key.push('property type');
  if (row.contactCount === 0) key.push('contact number');

  const other: string[] = [];
  if (row.bathrooms == null) other.push('bathrooms');
  if (row.areaSqft == null) other.push('floor area');
  if (!row.waterSource) other.push('water source');
  // 0 months is an answer ("no deposit"); null with no key money is not.
  if (row.depositMonths == null && row.keyMoney == null) other.push('deposit or key money');
  return { key, other };
}

export const incompleteListingsReport: ReportDefinition = {
  id: 'incomplete-listings',
  title: 'Incomplete listings',
  description: `Listings missing photos (under ${MIN_PHOTOS}), a proper description, a property type or a contact number, and what else to ask the owner for on the same call.`,
  group: 'Listings',
  dateLabel: 'Created',
  views: [
    { key: 'live', label: 'Live, key details' },
    { key: 'live-any', label: 'Live, anything' },
    { key: 'pending', label: 'Waiting for approval' },
  ],
  columns: [
    { key: 'id', label: 'Listing #' },
    { key: 'missing', label: 'Ask the owner for', wide: true },
    { key: 'alsoMissing', label: 'Also missing', wide: true },
    ...CONTACT_COLUMNS,
    { key: 'title', label: 'Title', wide: true },
    { key: 'city', label: 'Town' },
    { key: 'rent', label: 'Rent (LKR/month)' },
    { key: 'photos', label: 'Photos' },
    { key: 'createdAt', label: 'Created' },
    ...LINK_COLUMNS,
  ],
  isAvailable: () => true,

  async load({ view, from, to }) {
    const now = new Date();
    const rows = await loadListings(
      and(
        view === 'pending'
          ? eq(listings.status, 'pending')
          : and(
              eq(listings.status, 'active'),
              or(isNull(listings.expiresAt), gt(listings.expiresAt, now))
            ),
        from ? gte(listings.createdAt, from) : undefined,
        to ? lt(listings.createdAt, to) : undefined
      ),
      'newest'
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const details = await db
      .select({
        id: listings.id,
        photos: listings.photos,
        description: listings.description,
        propertyType: listings.propertyType,
        bathrooms: listings.bathrooms,
        areaSqft: listings.areaSqft,
        waterSource: listings.waterSource,
        depositMonths: listings.depositMonths,
        keyMoney: listings.keyMoney,
      })
      .from(listings)
      .where(inArray(listings.id, ids));
    const contacts = await loadContacts(ids);
    const byId = new Map(details.map((d) => [d.id, d]));

    return rows.flatMap((row) => {
      const detail = byId.get(row.id);
      // Deleted between the two queries.
      if (!detail) return [];
      const numbers = contacts.get(row.id) ?? [];
      const photoCount = parsePhotos(detail.photos).length;
      const missing = missingListingDetails({ ...detail, photoCount, contactCount: numbers.length });
      const wanted =
        view === 'live' ? missing.key.length > 0 : missing.key.length + missing.other.length > 0;
      if (!wanted) return [];
      return [
        {
          ...listingCells(row, numbers),
          missing: missing.key.join(', ') || null,
          alsoMissing: missing.other.join(', ') || null,
          photos: photoCount,
          createdAt: colomboTimestamp(row.createdAt),
        },
      ];
    });
  },

  summarize(rows) {
    const asks = (text: string) =>
      String(rows.filter((r) => String(r.missing ?? '').includes(text)).length);
    return [
      { label: 'Listings', value: String(rows.length) },
      { label: 'Need photos', value: asks('photos') },
      { label: 'Need a description', value: asks('description') },
      { label: 'No contact number', value: asks('contact number') },
    ];
  },
};
