/**
 * Where an "Awaiting review" intake is actually waiting, and the one place an
 * operator can act on it.
 *
 * Deliberately import-free: the intakes list is a client component, and
 * `display-state.ts` pulls in the Drizzle schema.
 *
 * "Awaiting review" and "Needs a human" are different queues and must stay
 * disjoint. Needs a human is an intake that never became a listing (the bot
 * gave up, or hit the ask cap), so the work is on the intake itself. Awaiting
 * review already HAS a listing, and the decision is made elsewhere:
 *
 * - held / error → Back Office → Moderation, which owns that queue (and alarms
 *   on it). Counting them under Needs a human too would show one landlord in
 *   two tabs and make the alarm banner double-count.
 * - queued / running → nothing to do yet; the sweeper has it.
 * - passed / skipped → an approval on the listing page (Approve & Activate).
 */
export type ReviewTarget = {
  note: string;
  href: string;
  /** True when no person is needed yet: the sweeper still has the listing. */
  waitingOnSweeper: boolean;
};

export function reviewTarget(
  listingId: number,
  moderationStatus: string | null,
): ReviewTarget {
  const moderation = (tab: string) =>
    `/back-office/moderation?tab=${tab}&q=${encodeURIComponent(`#${listingId}`)}`;
  const listing = `/dashboard/listings/${listingId}`;

  switch (moderationStatus) {
    case 'held':
      return { note: 'held by moderation', href: moderation('held'), waitingOnSweeper: false };
    case 'error':
      return { note: 'moderation failed', href: moderation('error'), waitingOnSweeper: false };
    case 'queued':
    case 'running':
      return { note: 'moderation queued', href: moderation('queued'), waitingOnSweeper: true };
    case 'passed':
      return { note: 'passed, needs approval', href: listing, waitingOnSweeper: false };
    default:
      return { note: 'needs approval', href: listing, waitingOnSweeper: false };
  }
}
