/**
 * Live listings nobody is calling about.
 *
 * Every figure here is a floor or an estimate and is labelled as one: taps are
 * sent with a beacon that can be lost, and search impressions are counted per
 * server instance. "Viewers" is deduplicated per day exactly as the public
 * count is — listing_views holds one row per page LOAD.
 */
import { and, count, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listingContactEvents, listingImpressions, listingViews, listings } from '@/lib/db/schema';
import { colomboTimestamp } from './csv';
import {
  CONTACT_COLUMNS,
  DAY_MS,
  LINK_COLUMNS,
  listingCells,
  loadContacts,
  loadListings,
} from './listing-rows';
import type { ReportDefinition } from './types';

export const WINDOW_DAYS = 14;
export const FEW_VIEWERS = 10;

export function responseFollowUp(viewers: number, taps: number): string {
  if (taps > 0) return viewers < FEW_VIEWERS ? 'Few viewers - improve photos and title' : 'None';
  if (viewers < FEW_VIEWERS) return 'Few people see it - improve photos and title, share it again';
  return 'People look but do not call - check the rent, photos and phone number';
}

export const noResponseListingsReport: ReportDefinition = {
  id: 'no-response-listings',
  title: 'Listings with no response',
  description: `Listings live for at least ${WINDOW_DAYS} days, with viewers and Call/WhatsApp taps over the last ${WINDOW_DAYS} days. Taps can be missed, so treat them as a minimum.`,
  group: 'Listings',
  dateLabel: 'Published',
  views: [
    { key: 'no-taps', label: 'No calls or WhatsApp' },
    { key: 'few-viewers', label: `Under ${FEW_VIEWERS} viewers` },
    { key: 'all', label: 'All live' },
  ],
  columns: [
    { key: 'id', label: 'Listing #' },
    { key: 'followUp', label: 'Follow-up', wide: true },
    { key: 'viewers', label: 'Viewers' },
    { key: 'taps', label: 'Taps' },
    { key: 'impressions', label: 'Shown in search (at least)' },
    ...CONTACT_COLUMNS,
    { key: 'title', label: 'Title', wide: true },
    { key: 'city', label: 'Town' },
    { key: 'rent', label: 'Rent (LKR/month)' },
    { key: 'publishedAt', label: 'Published' },
    ...LINK_COLUMNS,
  ],
  isAvailable: () => true,

  async load({ view, from, to }) {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

    // Younger listings have not had a fair chance, so they are never listed.
    const livedLongEnough = or(
      lte(listings.publishedAt, since),
      and(isNull(listings.publishedAt), lte(listings.createdAt, since))
    );
    const rows = await loadListings(
      and(
        eq(listings.status, 'active'),
        or(isNull(listings.expiresAt), gt(listings.expiresAt, now)),
        livedLongEnough,
        from ? gte(listings.publishedAt, from) : undefined,
        to ? lt(listings.publishedAt, to) : undefined
      ),
      'newest'
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    // Sequential on purpose — see listing-rows.ts.
    const viewRows = await db
      .select({
        listingId: listingViews.listingId,
        viewers: sql<number>`count(distinct ${listingViews.visitorHash}) + count(*) filter (where ${listingViews.visitorHash} is null)`,
      })
      .from(listingViews)
      .where(and(inArray(listingViews.listingId, ids), gte(listingViews.viewedAt, since)))
      .groupBy(listingViews.listingId);
    const tapRows = await db
      .select({ listingId: listingContactEvents.listingId, taps: count() })
      .from(listingContactEvents)
      .where(
        and(inArray(listingContactEvents.listingId, ids), gte(listingContactEvents.occurredAt, since))
      )
      .groupBy(listingContactEvents.listingId);
    const impressionRows = await db
      .select({
        listingId: listingImpressions.listingId,
        shown: sql<number>`sum(${listingImpressions.count})`,
      })
      .from(listingImpressions)
      .where(
        and(
          inArray(listingImpressions.listingId, ids),
          gte(listingImpressions.day, since.toISOString().slice(0, 10))
        )
      )
      .groupBy(listingImpressions.listingId);
    const contacts = await loadContacts(ids);

    const viewers = new Map(viewRows.map((r) => [r.listingId, Number(r.viewers)]));
    const taps = new Map(tapRows.map((r) => [r.listingId, Number(r.taps)]));
    const shown = new Map(impressionRows.map((r) => [r.listingId, Number(r.shown)]));

    return rows
      .map((row) => {
        const v = viewers.get(row.id) ?? 0;
        const t = taps.get(row.id) ?? 0;
        return {
          ...listingCells(row, contacts.get(row.id)),
          followUp: responseFollowUp(v, t),
          viewers: v,
          taps: t,
          impressions: shown.get(row.id) ?? 0,
          publishedAt: colomboTimestamp(row.publishedAt ?? row.createdAt),
        };
      })
      .filter((row) =>
        view === 'all' ? true : view === 'few-viewers' ? row.viewers < FEW_VIEWERS : row.taps === 0
      )
      // The most-seen first: those owners are losing the most calls.
      .sort((a, b) => b.viewers - a.viewers);
  },

  summarize(rows) {
    return [
      { label: 'Listings', value: String(rows.length) },
      { label: 'No taps', value: String(rows.filter((r) => r.taps === 0).length) },
      {
        label: `Under ${FEW_VIEWERS} viewers`,
        value: String(rows.filter((r) => Number(r.viewers) < FEW_VIEWERS).length),
      },
    ];
  },
};
