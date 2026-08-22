/**
 * Telling the landlord where their listing actually went live.
 *
 * Consent used to be the end of the conversation: the landlord replied YES and
 * then heard nothing. They could not open the post, could not share it on, and
 * could not object to a post carrying their own property photos. This closes
 * that loop, and hands them the link that takes it all back down again.
 *
 * ONE message per listing, never one per platform — four messages for one
 * listing would reproduce in WhatsApp exactly the wall of near-identical blocks
 * that made the back office unreadable.
 *
 * `socialResultsSentAt` is a DELIVERY record in the same sense as
 * `socialPromptedAt` (see `consent.ts`): stamped only when something actually
 * reached the landlord, so a send that fails is retried rather than lost.
 */

import { and, eq, gt, isNotNull, isNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, listings, listingSocialPosts, users, whatsappIntakes } from '@/lib/db/schema';
import { createNotification } from '@/lib/notifications';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { mintAccessLink } from '@/lib/auth/access-links';
import { isIntakeConfigured } from '@/lib/intake/channels/whatsapp/config';
import { sendWhatsAppText } from '@/lib/intake/channels/whatsapp/send';
import { socialResultsMessage, type SocialResultItem } from '@/lib/intake/messages';
import { isDryRunPost } from './types';

type ListingRow = typeof listings.$inferSelect;

/**
 * A row is done when it can no longer change by itself. `queued`/`running` are
 * still in flight, and telling the landlord "here is where it went" while a
 * platform is mid-publish would either omit it or need a second message.
 */
const TERMINAL = ['posted', 'failed', 'skipped', 'pulled'] as const;

/**
 * How long to keep retrying WhatsApp before falling back to the in-app notice.
 *
 * Deliberately SHORT. Meta only allows a free-form message within 24h of the
 * landlord's last message, and the consent reply IS that message — with the
 * sweeper running every five minutes this normally lands minutes later, well
 * inside the window. So a failure here is almost never "not yet": it is a shut
 * window (error 131047), which does not heal by waiting.
 *
 * Two hours is enough to ride out a transient blip and no more. It also bounds
 * the cost of retrying: each attempt mints a fresh access link (the store keeps
 * only a hash, so an issued URL can never be reprinted) plus an `auth_link_issued`
 * audit row. Retrying for a day would mint hundreds of both for one unreachable
 * number.
 */
const WHATSAPP_REACHABLE_HOURS = 2;

/**
 * Listings whose social jobs have all settled but whose owner has not been told.
 *
 * Bounded to recently-published listings for the same reason
 * `listingsAwaitingSocialPrompt` is: an unreachable number must not be chased
 * forever, and the back catalogue must never be retro-messaged.
 */
export async function listingsAwaitingSocialResults(
  limit = 5,
  withinHours = 48
): Promise<ListingRow[]> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);

  const candidates = await db.query.listings.findMany({
    where: and(
      isNull(listings.socialResultsSentAt),
      isNotNull(listings.socialConsentAt),
      isNotNull(listings.publishedAt),
      gt(listings.publishedAt, cutoff)
    ),
    limit: limit * 4, // some will still have jobs in flight; over-fetch and filter
  });
  if (!candidates.length) return [];

  // Keep only those with at least one row AND no row still in flight. A listing
  // that never enqueued anything has nothing to report.
  const rows = await db.query.listingSocialPosts.findMany({
    where: inArray(
      listingSocialPosts.listingId,
      candidates.map((l) => l.id)
    ),
    columns: { listingId: true, status: true },
  });

  const byListing = new Map<number, string[]>();
  for (const r of rows) {
    const list = byListing.get(r.listingId) ?? [];
    list.push(r.status);
    byListing.set(r.listingId, list);
  }

  return candidates
    .filter((l) => {
      const statuses = byListing.get(l.id);
      if (!statuses?.length) return false;
      return statuses.every((s) => (TERMINAL as readonly string[]).includes(s));
    })
    .slice(0, limit);
}

/** Mark the notice as delivered (or as deliberately not worth sending). */
async function markSent(listingId: number): Promise<void> {
  await db
    .update(listings)
    .set({ socialResultsSentAt: new Date(), updatedAt: new Date() })
    .where(eq(listings.id, listingId));
}

/**
 * Tell one listing's owner where it was posted.
 *
 * Returns true when a message went out. Returns false — WITHOUT stamping — when
 * the send failed and is worth retrying; the caller leaves it for the next tick.
 */
export async function notifyLandlordOfSocialResults(listing: ListingRow): Promise<boolean> {
  if (!isFeatureEnabled('enableSocialAutoPublish')) return false;
  if (listing.socialResultsSentAt) return false;

  const posts = await db.query.listingSocialPosts.findMany({
    where: eq(listingSocialPosts.listingId, listing.id),
  });

  const results: SocialResultItem[] = posts
    .filter((p) => p.status === 'posted')
    .map((p) => ({
      platform: p.platform,
      permalink: p.remotePermalink,
      dryRun: isDryRunPost(p.remotePostId),
    }));

  // --- WhatsApp-origin landlord --------------------------------------------
  const intake = await db.query.whatsappIntakes
    .findFirst({ where: eq(whatsappIntakes.listingId, listing.id) })
    .catch(() => null);

  // `isIntakeConfigured()` first: with no WhatsApp credentials `sendWhatsAppText`
  // dry-runs and returns FALSE, which this function would read as a failed send
  // and retry every tick — minting an access link and an audit row each time,
  // forever, in every environment that has no WhatsApp. Skip straight to the
  // in-app notice instead, which is the honest thing to do when we genuinely
  // cannot message them.
  if (intake?.fromNumber && isIntakeConfigured()) {
    // Is there anything true to say? Asked with no link, so an all-dry-run
    // listing costs neither a minted token nor an audit row. The builder is the
    // single authority on what counts as a real post — re-deriving that here
    // would be a second copy of the rule, free to drift.
    if (!socialResultsMessage(listing.title, results, null)) {
      // Nothing genuinely posted. Say nothing rather than claim a share that
      // never happened, but stamp it so the reconciler stops re-examining this
      // listing on every tick.
      await markSent(listing.id);
      return false;
    }

    const user = await db.query.users.findFirst({
      where: and(eq(users.waPhone, intake.fromNumber), isNull(users.deletedAt)),
    });

    // The pull-down link needs an account to sign into. Without one the message
    // still goes out — it just cannot offer the takedown, which ops handles.
    let pullDownUrl: string | null = null;
    if (user) {
      try {
        const minted = await mintAccessLink({
          userId: user.id,
          listingId: listing.id,
          channel: 'whatsapp',
        });
        pullDownUrl = minted.socialUrl;
      } catch (err) {
        console.error('[social] pull-down link minting failed', listing.id, err);
      }
    }

    // Non-null: the same call above already established there is something to
    // say, and only the trailing takedown line differs.
    const body = socialResultsMessage(listing.title, results, pullDownUrl)!;

    if (await sendWhatsAppText(intake.fromNumber, body)) {
      await markSent(listing.id);
      return true;
    }

    // Send failed. Inside the retry window, leave it NULL and try again next
    // tick. Past it, Meta's 24h window has certainly shut, so stop pretending a
    // retry will help: fall through to the in-app notification below.
    const publishedAt = listing.publishedAt?.getTime() ?? 0;
    const stillWorthRetrying =
      Date.now() - publishedAt < WHATSAPP_REACHABLE_HOURS * 60 * 60 * 1000;
    if (stillWorthRetrying) return false;
  }

  // --- web landlord, or WhatsApp gave up ------------------------------------
  const body = socialResultsMessage(listing.title, results, null);
  if (!body) {
    await markSent(listing.id);
    return false;
  }

  const landlord = listing.landlordId
    ? await db.query.landlords.findFirst({ where: eq(landlords.id, listing.landlordId) })
    : null;

  if (landlord?.userId) {
    await createNotification({
      userId: landlord.userId,
      type: 'social_publish',
      title: `"${listing.title}" is now on our social media`,
      body: 'Open your listing to see where it was posted, or to take it back down.',
      link: `/dashboard/listings/${listing.id}/social`,
    });
    await markSent(listing.id);
    return true;
  }

  // Nobody to tell — an ops-owned listing with no landlord account. Stamp it so
  // the reconciler stops looking at it.
  await markSent(listing.id);
  return false;
}

/**
 * Sweeper tail: tell every landlord whose posts have finished settling.
 *
 * Same at-least-once insurance as `reconcileMissedSocialPrompts`, and for the
 * same reason — this runs at the end of a cron tick, and a run that dies would
 * otherwise lose the notice permanently with nothing to retry it.
 */
export async function notifyPendingSocialResults(limit = 5): Promise<{ notified: number }> {
  if (!isFeatureEnabled('enableSocialAutoPublish')) return { notified: 0 };

  const pending = await listingsAwaitingSocialResults(limit);
  let notified = 0;
  for (const listing of pending) {
    try {
      if (await notifyLandlordOfSocialResults(listing)) notified++;
    } catch (err) {
      console.error('[social] results notify failed', listing.id, err);
    }
  }
  if (notified) console.log(`[social] told ${notified} landlord(s) where their listing posted`);
  return { notified };
}
