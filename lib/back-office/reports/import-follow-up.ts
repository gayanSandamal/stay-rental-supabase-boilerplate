/**
 * Facebook imports with the post link, every number, and what to do next.
 *
 * DECLINED IMPORTS ARE NEVER IN HERE. Those owners said no and were told we
 * deleted what we hold; the number survives only as a tombstone so they are not
 * asked again. A follow-up list is exactly where it must not resurface.
 */
import { and, desc, eq, gte, inArray, lt, ne, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, postImports, users } from '@/lib/db/schema';
import { parsePayload } from '@/lib/imports/publish';
import { parseExtraPhones } from '@/lib/imports/phones';
import { colomboTimestamp, localPhone } from './csv';
import { MAX_REPORT_ROWS, type ReportDefinition } from './types';

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A dry run is not a delivered message, and must not read as one. */
const NOTICE_LABELS: Record<string, string> = {
  sent: 'Yes',
  dry_run: 'No (message was not sent)',
  failed: 'No (WhatsApp rejected it)',
  deferred: 'Not yet (waiting for checks)',
};

export interface FollowUpInput {
  status: string;
  hasPost: boolean;
  missing: string[];
  ownerPhoneIsWhatsApp: boolean;
  consentOutcome: string | null;
  consentRequestedAt: Date | null;
  notifyOutcome: string | null;
  listingStatus: string | null;
}

/** The operator's next step for one import. 'None' means nothing is owed. */
export function followUpFor(row: FollowUpInput, now: Date): string {
  switch (row.status) {
    case 'draft':
      if (row.missing.length) return `Complete the draft: ${row.missing.join(', ')}`;
      if (!row.hasPost) return 'Confirm the owner agrees, then publish';
      return row.ownerPhoneIsWhatsApp
        ? 'Ask the owner for consent'
        : 'Call the owner for consent (number is not on WhatsApp)';

    case 'awaiting_consent': {
      if (row.consentOutcome === 'failed') return 'WhatsApp rejected the request - call the owner';
      if (row.consentOutcome === 'dry_run') return 'Request was never sent - call the owner';
      const days = row.consentRequestedAt
        ? Math.floor((now.getTime() - row.consentRequestedAt.getTime()) / DAY_MS)
        : 0;
      // Each owner is asked once. Silence is a no, so this is not a prompt to
      // message them again.
      return `Waiting for a reply (${days} day${days === 1 ? '' : 's'}) - do not message again`;
    }

    case 'published':
      if (!row.listingStatus) return 'Listing was deleted';
      if (row.listingStatus === 'pending') return 'Listing is waiting for approval';
      if (row.listingStatus === 'rejected') return 'Listing was rejected - fix it and resubmit';
      if (row.listingStatus === 'expired') return 'Listing expired - ask if it is still available';
      if (row.listingStatus !== 'active') return 'None';
      if (row.notifyOutcome === 'failed' || row.notifyOutcome === 'dry_run') {
        return 'Tell the owner it is live (our message did not go out)';
      }
      return 'None';

    default:
      return 'None';
  }
}

/** The same required fields the review screen checks before asking. */
export function missingDetails(
  parsed: { title: unknown; city: unknown; bedrooms: unknown; rentPerMonth: unknown },
  ownerPhone: string | null
): string[] {
  const missing: string[] = [];
  if (!parsed.title) missing.push('title');
  if (!parsed.city) missing.push('town');
  if (parsed.bedrooms == null) missing.push('bedrooms');
  if (parsed.rentPerMonth == null) missing.push('rent');
  if (!ownerPhone) missing.push('phone number');
  return missing;
}

function statusCondition(view: string): SQL | undefined {
  switch (view) {
    case 'published':
      return eq(postImports.status, 'published');
    case 'discarded':
      return eq(postImports.status, 'discarded');
    case 'all':
      return undefined;
    default:
      // 'open': everything somebody may still have to act on. Rows that turn
      // out to need nothing are dropped once the follow-up is known.
      return inArray(postImports.status, ['draft', 'awaiting_consent', 'published']);
  }
}

export const importFollowUpReport: ReportDefinition = {
  id: 'import-follow-up',
  title: 'Facebook import follow-up',
  description:
    'Every imported post with its link, the owner’s numbers and the next step, so you can call or message without opening each one.',
  group: 'Imports',
  dateLabel: 'Imported',
  views: [
    { key: 'open', label: 'Needs follow-up' },
    { key: 'published', label: 'Published' },
    { key: 'discarded', label: 'Discarded' },
    { key: 'all', label: 'All' },
  ],
  columns: [
    { key: 'id', label: 'Import #' },
    { key: 'followUp', label: 'Follow-up', wide: true },
    { key: 'ownerName', label: 'Owner' },
    { key: 'ownerPhone', label: 'Owner phone' },
    { key: 'whatsApp', label: 'WhatsApp', link: true },
    { key: 'otherPhones', label: 'Other numbers' },
    { key: 'postUrl', label: 'Post URL', link: true },
    { key: 'title', label: 'Title', wide: true },
    { key: 'city', label: 'Town' },
    { key: 'rent', label: 'Rent (LKR/month)' },
    { key: 'status', label: 'Import status' },
    { key: 'consent', label: 'Owner consent', csvOnly: true },
    { key: 'notice', label: 'Owner told it is live', csvOnly: true },
    { key: 'listingStatus', label: 'Listing status', csvOnly: true },
    { key: 'listingUrl', label: 'Listing URL', link: true, csvOnly: true },
    { key: 'reviewUrl', label: 'Review URL', link: true, csvOnly: true },
    { key: 'importedBy', label: 'Imported by', csvOnly: true },
    { key: 'importedAt', label: 'Imported at' },
  ],
  isAvailable: (flags) => flags.enableFacebookImport,

  async load({ view, from, to }) {
    const rows = await db
      .select({ record: postImports, listingStatus: listings.status, importedBy: users.name })
      .from(postImports)
      .leftJoin(listings, eq(postImports.listingId, listings.id))
      .leftJoin(users, eq(postImports.importedBy, users.id))
      .where(
        and(
          ne(postImports.status, 'declined'),
          statusCondition(view),
          from ? gte(postImports.createdAt, from) : undefined,
          to ? lt(postImports.createdAt, to) : undefined
        )
      )
      .orderBy(desc(postImports.createdAt))
      .limit(MAX_REPORT_ROWS);

    const now = new Date();
    const out = rows.map(({ record, listingStatus, importedBy }) => {
      const parsed = parsePayload(record.parsedPayload);
      const extras = parseExtraPhones(record.extraPhones);
      return {
        id: record.id,
        followUp: followUpFor(
          {
            status: record.status,
            hasPost: Boolean(record.sourceUrl),
            missing: missingDetails(parsed, record.ownerPhone),
            ownerPhoneIsWhatsApp: record.ownerPhoneIsWhatsApp,
            consentOutcome: record.consentOutcome,
            consentRequestedAt: record.consentRequestedAt,
            notifyOutcome: record.notifyOutcome,
            listingStatus,
          },
          now
        ),
        ownerName: record.ownerName,
        ownerPhone: record.ownerPhone ? localPhone(record.ownerPhone) : null,
        whatsApp:
          record.ownerPhone && record.ownerPhoneIsWhatsApp
            ? `https://wa.me/${record.ownerPhone.replace(/\D/g, '')}`
            : null,
        otherPhones:
          extras
            .map((p) => localPhone(p.phone) + (p.isWhatsApp ? ' (WhatsApp)' : ''))
            .join('; ') || null,
        postUrl: record.sourceUrl,
        title: parsed.title,
        city: parsed.city,
        rent: parsed.rentPerMonth,
        status: record.status.replace(/_/g, ' '),
        consent: record.consentGrantedAt
          ? `Yes (${record.consentSource === 'manual' ? 'confirmed by staff' : 'WhatsApp'}) ${colomboTimestamp(record.consentGrantedAt)}`
          : record.consentRequestedAt
            ? `Asked ${colomboTimestamp(record.consentRequestedAt)} (${record.consentOutcome ?? 'unknown'})`
            : 'Not asked',
        notice: record.notifyOutcome ? (NOTICE_LABELS[record.notifyOutcome] ?? record.notifyOutcome) : null,
        listingStatus,
        listingUrl: record.listingId ? `${SITE_URL}/listings/${record.listingId}` : null,
        reviewUrl: `${SITE_URL}/back-office/imports/${record.id}`,
        importedBy,
        importedAt: colomboTimestamp(record.createdAt),
      };
    });
    return view === 'open' ? out.filter((row) => row.followUp !== 'None') : out;
  },

  summarize(rows) {
    const count = (status: string) => rows.filter((r) => r.status === status).length;
    return [
      { label: 'Imports', value: String(rows.length) },
      { label: 'Need follow-up', value: String(rows.filter((r) => r.followUp !== 'None').length) },
      { label: 'Drafts', value: String(count('draft')) },
      { label: 'Awaiting consent', value: String(count('awaiting consent')) },
      { label: 'Published', value: String(count('published')) },
      { label: 'No phone number', value: String(rows.filter((r) => !r.ownerPhone).length) },
    ];
  },
};
