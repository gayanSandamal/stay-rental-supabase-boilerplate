/**
 * The part every listing report shares: which listing, whose it is, and how to
 * reach them. Two queries whatever the size, and never concurrent — the pool is
 * `max: 1` behind a transaction pooler (commit a3ac4f9).
 */
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  businessAccounts,
  landlords,
  listingContactNumbers,
  listings,
  userContactNumbers,
  users,
} from '@/lib/db/schema';
import { normalizePhone } from '@/lib/auth/phone-verification';
import { publisherDisplayName } from '@/lib/publisher-name';
import { localPhone } from './csv';
import { MAX_REPORT_ROWS, type ReportColumn } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

/**
 * Named columns only. `photos_manifest` holds every photo URL twice and was
 * megabytes a row on the listings that stored photos inline.
 */
const COLUMNS = {
  id: listings.id,
  title: listings.title,
  status: listings.status,
  city: listings.city,
  bedrooms: listings.bedrooms,
  rentPerMonth: listings.rentPerMonth,
  createdAt: listings.createdAt,
  publishedAt: listings.publishedAt,
  expiresAt: listings.expiresAt,
  sourceContactName: listings.sourceContactName,
  ownerName: users.name,
  waPhone: users.waPhone,
  businessName: businessAccounts.name,
};

export type ListingReportRow = Awaited<ReturnType<typeof loadListings>>[number];

export function loadListings(where: SQL | undefined, order: 'expiry' | 'newest') {
  return db
    .select(COLUMNS)
    .from(listings)
    .leftJoin(landlords, eq(listings.landlordId, landlords.id))
    .leftJoin(users, eq(landlords.userId, users.id))
    .leftJoin(businessAccounts, eq(listings.businessAccountId, businessAccounts.id))
    .where(where)
    .orderBy(order === 'expiry' ? asc(listings.expiresAt) : desc(listings.createdAt))
    .limit(MAX_REPORT_ROWS);
}

export interface ContactNumber {
  phone: string;
  isWhatsApp: boolean;
}

/** Active contact numbers per listing, in the order they were added. */
export async function loadContacts(listingIds: number[]): Promise<Map<number, ContactNumber[]>> {
  const contacts = new Map<number, ContactNumber[]>();
  if (listingIds.length === 0) return contacts;
  const rows = await db
    .select({
      listingId: listingContactNumbers.listingId,
      phone: userContactNumbers.phoneNumber,
      isWhatsApp: userContactNumbers.isWhatsApp,
    })
    .from(listingContactNumbers)
    .innerJoin(
      userContactNumbers,
      eq(listingContactNumbers.contactNumberId, userContactNumbers.id)
    )
    .where(
      and(
        inArray(listingContactNumbers.listingId, listingIds),
        eq(userContactNumbers.isActive, true)
      )
    )
    .orderBy(asc(listingContactNumbers.id));
  for (const { listingId, phone, isWhatsApp } of rows) {
    const list = contacts.get(listingId) ?? [];
    list.push({ phone, isWhatsApp });
    contacts.set(listingId, list);
  }
  return contacts;
}

/** Phone cells: the number to call first, its WhatsApp link, and the rest. */
export function phoneCells(numbers: ContactNumber[], fallback: string | null) {
  const seen = new Set<string>();
  const clean = [...numbers, ...(numbers.length === 0 && fallback ? [{ phone: fallback, isWhatsApp: true }] : [])]
    // Typed by hand in places: "+94 72 464 5462" and "0724645462" are one number.
    .map((n) => ({ ...n, phone: normalizePhone(n.phone) ?? n.phone }))
    .filter((n) => !seen.has(n.phone) && seen.add(n.phone));
  const [first, ...rest] = clean;
  const whatsApp = clean.find((n) => n.isWhatsApp && n.phone.startsWith('+'));
  return {
    ownerPhone: first ? localPhone(first.phone) : null,
    whatsApp: whatsApp ? `https://wa.me/${whatsApp.phone.slice(1)}` : null,
    otherPhones:
      rest.map((n) => localPhone(n.phone) + (n.isWhatsApp ? ' (WhatsApp)' : '')).join('; ') || null,
  };
}

/** Never an email address, real or synthetic. */
export function ownerCell(row: ListingReportRow): string {
  // sourceContactName first: a concierge listing sits under our own Operations
  // account, and the person to call is the owner it names.
  return (
    row.sourceContactName?.trim() || row.businessName || publisherDisplayName({ name: row.ownerName })
  );
}

/** Owner, phone and link cells, the same on every listing report. */
export function listingCells(row: ListingReportRow, numbers: ContactNumber[] = []) {
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    rent: Math.round(Number(row.rentPerMonth)),
    ownerName: ownerCell(row),
    ...phoneCells(numbers, row.waPhone),
    listingUrl: `${REPORT_SITE_URL}/listings/${row.id}`,
    manageUrl: `${REPORT_SITE_URL}/dashboard/listings/${row.id}`,
  };
}

export const CONTACT_COLUMNS: ReportColumn[] = [
  { key: 'ownerName', label: 'Owner' },
  { key: 'ownerPhone', label: 'Owner phone' },
  { key: 'whatsApp', label: 'WhatsApp', link: true },
  { key: 'otherPhones', label: 'Other numbers' },
];

export const LINK_COLUMNS: ReportColumn[] = [
  { key: 'manageUrl', label: 'Manage URL', link: true },
  { key: 'listingUrl', label: 'Listing URL', link: true, csvOnly: true },
];

/** Whole days from now; negative when past. */
export function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

export const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
