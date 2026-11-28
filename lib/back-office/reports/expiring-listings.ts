/** Listings about to leave the marketplace, or that just did. A call list. */
import { and, eq, gte, inArray, lt, or, type SQL } from 'drizzle-orm';
import { listings } from '@/lib/db/schema';
import { colomboTimestamp } from './csv';
import {
  CONTACT_COLUMNS,
  DAY_MS,
  LINK_COLUMNS,
  days,
  daysUntil,
  listingCells,
  loadContacts,
  loadListings,
} from './listing-rows';
import type { ReportDefinition } from './types';

export const EXPIRING_WITHIN_DAYS = 14;
export const EXPIRED_WITHIN_DAYS = 30;

/** `expiresAt` decides, not status: the sweep that flips status runs later. */
export function expiryFollowUp(expiresAt: Date, now: Date): string {
  const left = daysUntil(expiresAt, now);
  if (expiresAt.getTime() > now.getTime()) {
    return left <= 1
      ? 'Expires within a day - ask if it is still available, then renew'
      : `Expires in ${days(left)} - ask if it is still available, then renew`;
  }
  return -left < 1
    ? 'Expired today - ask if it is still available'
    : `Expired ${days(-left)} ago - ask if it is still available`;
}

export const expiringListingsReport: ReportDefinition = {
  id: 'expiring-listings',
  title: 'Expiring and expired listings',
  description: `Live listings that end in the next ${EXPIRING_WITHIN_DAYS} days and listings that ended in the last ${EXPIRED_WITHIN_DAYS}, with the owner’s numbers. Choose dates to look further.`,
  group: 'Listings',
  dateLabel: 'Expires',
  views: [
    { key: 'expiring', label: 'Expiring' },
    { key: 'expired', label: 'Expired' },
    { key: 'all', label: 'Both' },
  ],
  columns: [
    { key: 'id', label: 'Listing #' },
    { key: 'followUp', label: 'Follow-up', wide: true },
    ...CONTACT_COLUMNS,
    { key: 'title', label: 'Title', wide: true },
    { key: 'city', label: 'Town' },
    { key: 'rent', label: 'Rent (LKR/month)' },
    { key: 'expiresAt', label: 'Expires' },
    { key: 'status', label: 'Status' },
    ...LINK_COLUMNS,
  ],
  isAvailable: () => true,

  async load({ view, from, to }) {
    const now = new Date();
    const dated = from || to;
    const soonest = dated ? from : new Date(now.getTime() - EXPIRED_WITHIN_DAYS * DAY_MS);
    const latest = dated ? to : new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY_MS);

    const expiring = and(eq(listings.status, 'active'), gte(listings.expiresAt, now));
    // Rented, archived and rejected listings are finished, whatever their date.
    const expired = and(
      inArray(listings.status, ['active', 'expired']),
      lt(listings.expiresAt, now)
    );
    const state: SQL | undefined =
      view === 'expired' ? expired : view === 'all' ? or(expiring, expired) : expiring;

    const rows = await loadListings(
      and(
        state,
        soonest ? gte(listings.expiresAt, soonest) : undefined,
        latest ? lt(listings.expiresAt, latest) : undefined
      ),
      'expiry'
    );
    const contacts = await loadContacts(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...listingCells(row, contacts.get(row.id)),
      // The date conditions above cannot match a NULL.
      followUp: expiryFollowUp(row.expiresAt!, now),
      expiresAt: colomboTimestamp(row.expiresAt!),
      status: row.expiresAt!.getTime() > now.getTime() ? 'live' : 'expired',
    }));
  },

  summarize(rows) {
    return [
      { label: 'Listings', value: String(rows.length) },
      { label: 'Still live', value: String(rows.filter((r) => r.status === 'live').length) },
      { label: 'Expired', value: String(rows.filter((r) => r.status === 'expired').length) },
      { label: 'No phone number', value: String(rows.filter((r) => !r.ownerPhone).length) },
    ];
  },
};
