/**
 * The `expiresAt` a listing must carry at the moment it becomes `active`.
 *
 * Every path to `active` (ops approval through PATCH /api/listings/[id],
 * Publish anyway in Back Office → Moderation, the moderation sweeper) used to
 * keep whatever `expiresAt` the row already had and only fill it when NULL.
 * An EXPIRED listing has one — in the past — so re-approving it set it
 * `active` with a dead expiry, and the 15-minute expire-listings cron
 * (`checkAndMarkExpiredListings`: `status = 'active' AND expires_at < now()`)
 * flipped it straight back to `expired`. By then the landlord had already been
 * told it was approved: email, WhatsApp, the import notice, the social prompt.
 *
 * Rule: an expiry still in the future is kept (re-activating a listing that was
 * paused mid-window does not hand it extra days); a missing or past one starts
 * a fresh window of `listingExpirationDays` from now — the same "30 days from
 * now" a renewal gives (`/api/listings/bulk-renew`).
 *
 * `publishedAt` is deliberately NOT touched here. It is the first-publish date:
 * saved-search alerts (`publishedSince`) and premium early access
 * (`hideNewListingsHours`) key on it, and the import notice / social offer in
 * the moderation override are gated on it being null. Moving it on a
 * re-approval would re-alert every saved search for an old listing and re-run
 * first-publish side effects.
 */
export function activationExpiresAt(
  current: Date | null | undefined,
  now: Date,
  expirationDays: number
): Date {
  if (current && current.getTime() > now.getTime()) return current;
  const days = Number.isFinite(expirationDays) && expirationDays > 0 ? expirationDays : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
