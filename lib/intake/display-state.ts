import { sql, type SQL } from 'drizzle-orm';
import {
  listings,
  listingStatusEnum,
  whatsappIntakes,
  whatsappIntakeStatusEnum,
} from '@/lib/db/schema';

/**
 * What the back office SHOWS for an intake — derived, never stored.
 *
 * `whatsapp_intakes.status = 'published'` means "this intake created its
 * listing", not "the listing is live". With moderation armed (or
 * `autoPublishWhatsAppIntakes` off) the listing lands `pending`, and the intake
 * still reads `published`. That is the right meaning for the readers that rely
 * on it — `lib/intake/session.ts` routes a follow-up photo or an edit request
 * to the listing the intake produced, whether or not ops has approved it yet —
 * so the enum is left alone and the screen reads `listings.status` instead.
 * It is the same trap as `post_imports.status = 'published'`.
 *
 * For an intake that is not `published` the intake's own status is shown
 * unchanged.
 */
export type ListingStatus = (typeof listingStatusEnum.enumValues)[number];
export type IntakeStatus = (typeof whatsappIntakeStatusEnum.enumValues)[number];

export type PublishedIntakeState =
  | 'live'
  | 'awaiting_review'
  | 'expired'
  | 'listing_rejected'
  | 'archived'
  | 'rented'
  | 'no_listing';

export type IntakeDisplayState = Exclude<IntakeStatus, 'published'> | PublishedIntakeState;

/**
 * Every listing status except `active`, which needs the expiry check too.
 * Typed as a full Record so adding a `listing_status` value fails the build
 * here instead of quietly falling into some other bucket.
 */
const NON_ACTIVE_LISTING_STATE: Record<Exclude<ListingStatus, 'active'>, PublishedIntakeState> = {
  pending: 'awaiting_review',
  expired: 'expired',
  rejected: 'listing_rejected',
  archived: 'archived',
  rented: 'rented',
};

/** States that make up the "Off the market" tab. */
export const CLOSED_STATES = [
  'expired',
  'listing_rejected',
  'archived',
  'rented',
  'no_listing',
] as const satisfies readonly PublishedIntakeState[];

export type IntakeDisplayInput = {
  intakeStatus: IntakeStatus | string;
  /** Null when the intake has no listing, or the listing row was purged. */
  listingStatus: ListingStatus | string | null;
  listingExpiresAt: Date | string | null;
  now?: Date;
};

/**
 * The rule, in JS. `intakeDisplayStateSql()` is the same rule in SQL, built
 * from the same table, so the badge, the tab and the count can never disagree.
 */
export function intakeDisplayState(input: IntakeDisplayInput): IntakeDisplayState {
  if (input.intakeStatus !== 'published') {
    return input.intakeStatus as IntakeDisplayState;
  }
  const status = input.listingStatus;
  if (!status) return 'no_listing';
  if (status === 'active') {
    const expires = input.listingExpiresAt == null ? null : new Date(input.listingExpiresAt);
    const now = input.now ?? new Date();
    // An active row whose expiry has passed is waiting on the 15-minute expiry
    // cron. It is not visible to renters, so it is not live.
    return expires && expires.getTime() <= now.getTime() ? 'expired' : 'live';
  }
  return NON_ACTIVE_LISTING_STATE[status as Exclude<ListingStatus, 'active'>] ?? 'no_listing';
}

/**
 * The same rule as a SQL CASE over `whatsapp_intakes LEFT JOIN listings`.
 * Requires the query to left-join `listings` on `whatsapp_intakes.listing_id`.
 */
export function intakeDisplayStateSql(): SQL<string> {
  const branches = Object.entries(NON_ACTIVE_LISTING_STATE).map(
    ([listingStatus, state]) =>
      sql`when ${listings.status} = ${sql.raw(`'${listingStatus}'`)} then ${sql.raw(`'${state}'`)}`,
  );
  return sql<string>`(case
    when ${whatsappIntakes.status} <> 'published' then ${whatsappIntakes.status}::text
    when ${listings.id} is null then 'no_listing'
    when ${listings.status} = 'active' and (${listings.expiresAt} is null or ${listings.expiresAt} > now()) then 'live'
    when ${listings.status} = 'active' then 'expired'
    ${sql.join(branches, sql` `)}
    else 'no_listing'
  end)`;
}
