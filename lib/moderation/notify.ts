/**
 * Telling people what happened. WhatsApp-originated listings get a chat reply
 * (that's where the landlord is); everything else gets an in-app notification.
 * Ops always hear about a hold.
 */

import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, listingModerations, listings } from '@/lib/db/schema';
import { createNotification, createNotificationsForOpsAndAdmin } from '@/lib/notifications';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';
import { whatsappIntakes } from '@/lib/db/schema';
import type { ModerationVerdict } from './types';

type ListingRow = typeof listings.$inferSelect;

/**
 * Did this listing arrive over WhatsApp? Defined here rather than imported from
 * engine.ts: engine already imports this module, and the resulting cycle throws
 * at module init in the production bundle (dev tolerates it, which is how it
 * reached production once).
 */
async function findIntakeForListing(listingId: number) {
  return db.query.whatsappIntakes.findFirst({
    where: eq(whatsappIntakes.listingId, listingId),
  });
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
}

export interface NotifyContext {
  /** The listing was already public before this run. */
  wasLive: boolean;
  /** Photos that became visible in this run. */
  added: number;
  /** persist() refused to unpublish photos it could not explain. */
  refused: boolean;
}

export async function notifyModerationOutcome(
  listing: ListingRow,
  verdict: ModerationVerdict,
  ctx: NotifyContext = { wasLive: false, added: 0, refused: false }
): Promise<void> {
  const intake = await findIntakeForListing(listing.id).catch(() => null);

  // A refused retraction is a code-level invariant breach, not a moderation
  // outcome — it goes straight to ops and nothing goes to the landlord.
  if (ctx.refused) {
    await createNotificationsForOpsAndAdmin({
      type: 'whatsapp_intake',
      title: `Listing #${listing.id}: photo retraction refused — manifest needs review`,
      body: 'Moderation would have unpublished photos without an explanation, so the photo list was left untouched.',
      link: `/dashboard/listings/${listing.id}`,
    });
    return;
  }

  // --- ops -----------------------------------------------------------------
  if (verdict.outcome === 'held') {
    await createNotificationsForOpsAndAdmin({
      type: 'whatsapp_intake',
      title: `Listing #${listing.id} held by automated checks — needs review`,
      body: verdict.reasons.slice(0, 3).join(' · ').slice(0, 300),
      link: `/dashboard/listings/${listing.id}`,
    });
  } else if (verdict.outcome === 'error') {
    await createNotificationsForOpsAndAdmin({
      type: 'whatsapp_intake',
      title: `Listing #${listing.id}: moderation unavailable — will retry`,
      body: (verdict.errorMessage ?? '').slice(0, 300),
      link: `/dashboard/listings/${listing.id}`,
    });
  } else if (verdict.processingFallbacks) {
    // Louder than the dropped-photos note below: photos published unprocessed
    // are unwatermarked and still carry their EXIF/GPS, and if the cause is the
    // native toolchain then image moderation is degraded platform-wide, not just
    // for this listing.
    await createNotificationsForOpsAndAdmin({
      type: 'whatsapp_intake',
      title: `Listing #${listing.id}: ${verdict.processingFallbacks} photo(s) published unprocessed — check the image pipeline`,
      body: `No compression or watermark applied; EXIF not stripped. Cause: ${verdict.processingError ?? 'unknown'}`.slice(0, 300),
      link: `/dashboard/listings/${listing.id}`,
    });
  } else if (verdict.droppedUrls.length) {
    await createNotificationsForOpsAndAdmin({
      type: 'whatsapp_intake',
      title: `Listing #${listing.id} published — ${verdict.droppedUrls.length} photo(s) dropped`,
      body: verdict.reasons.slice(0, 2).join(' · ').slice(0, 300),
      link: `/dashboard/listings/${listing.id}`,
    });
  }

  // --- the landlord --------------------------------------------------------
  // A live listing is re-checked every time its owner sends another photo, so
  // "🎉 now live" belongs to the FIRST publish only. Without this, every extra
  // photo re-announces a listing the landlord has been looking at for days.
  const isFirstPublish = verdict.outcome === 'passed' && !ctx.wasLive;

  if (verdict.outcome === 'passed' && ctx.wasLive) {
    // Nothing new became visible and nothing to explain → stay quiet.
    if (ctx.added === 0 && !verdict.landlordReasons.length) return;
  } else if (!verdict.landlordReasons.length && verdict.outcome !== 'passed') {
    return;
  }

  const lines: string[] = [];
  if (isFirstPublish) {
    lines.push(firstPublishLine(listing));
    if (verdict.landlordReasons.length) lines.push('', ...verdict.landlordReasons);
  } else if (verdict.outcome === 'passed') {
    if (ctx.added > 0) {
      lines.push(
        `✅ ${ctx.added} new photo${ctx.added === 1 ? '' : 's'} ${ctx.added === 1 ? 'is' : 'are'} now showing on "${listing.title}".`
      );
    }
    if (verdict.landlordReasons.length) lines.push(...(lines.length ? [''] : []), ...verdict.landlordReasons);
  } else {
    lines.push(...verdict.landlordReasons);
  }
  const message = lines.join('\n');

  if (intake?.fromNumber) {
    const sent = await whatsappAdapter.sendText(intake.fromNumber, message);
    if (sent) {
      // Only the go-live announcement is reconciled, so only it is recorded.
      // Stamping on a photo-added follow-up would mark a listing announced
      // whose owner never heard it went live.
      if (isFirstPublish) await markLandlordNotified(listing.id);
    } else {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Could not WhatsApp the owner of listing #${listing.id} — contact them manually`,
        link: `/dashboard/listings/${listing.id}`,
      });
    }
    return;
  }

  // Web-form listing: notify the owning landlord in-app.
  const landlord = listing.landlordId
    ? await db.query.landlords.findFirst({ where: eq(landlords.id, listing.landlordId) })
    : null;
  if (landlord?.userId) {
    await createNotification({
      userId: landlord.userId,
      type: verdict.outcome === 'passed' ? 'listing_approved' : 'whatsapp_intake',
      title:
        verdict.outcome === 'passed'
          ? `"${listing.title}" is live`
          : `"${listing.title}" needs a quick review`,
      body: (verdict.landlordReasons.join(' ') || verdict.reasons.join(' ')).slice(0, 300),
      link: `/dashboard/listings/${listing.id}`,
    });
    if (isFirstPublish) await markLandlordNotified(listing.id);
  } else if (isFirstPublish) {
    // Nobody to tell — an ops-owned listing with no landlord account. Record it
    // anyway: the reconciler must not re-examine it on every tick forever.
    await markLandlordNotified(listing.id);
  }
}

/** The one line that says a listing went live. Shared with the reconciler. */
function firstPublishLine(listing: Pick<ListingRow, 'id' | 'title'>): string {
  return `🎉 Your listing "${listing.title}" is now live: ${baseUrl()}/listings/${listing.id}`;
}

async function markLandlordNotified(listingId: number): Promise<void> {
  await db
    .update(listings)
    .set({ landlordNotifiedAt: new Date() })
    .where(eq(listings.id, listingId));
}

/**
 * Deliver go-live announcements that never landed.
 *
 * The live path sends once, at the end of a time-bounded sweeper run, and a run
 * that is killed mid-notify leaves a published listing whose owner was never
 * told — permanently, since nothing retried. This is that retry.
 *
 * Scoped to listings published in the last `withinHours` so a permanently
 * undeliverable number cannot be retried forever; past that window the ops
 * notification is the backstop and a human takes over.
 */
export async function reconcileMissedAnnouncements(
  limit = 5,
  withinHours = 24
): Promise<{ sent: number; failed: number }> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const pending = await db.query.listings.findMany({
    where: and(
      isNull(listings.landlordNotifiedAt),
      eq(listings.status, 'active'),
      eq(listings.moderationStatus, 'passed'),
      isNotNull(listings.publishedAt),
      gt(listings.publishedAt, cutoff)
    ),
    limit,
  });

  let sent = 0;
  let failed = 0;
  for (const listing of pending) {
    try {
      const intake = await findIntakeForListing(listing.id).catch(() => null);
      if (!intake?.fromNumber) {
        // No WhatsApp origin: the in-app path either fired or there is nobody
        // to tell. Either way it is not this reconciler's to chase.
        await markLandlordNotified(listing.id);
        continue;
      }
      // Re-use the reasons the failed run computed, so the sender gets the same
      // message they should have had rather than a bare "it's live".
      const reasons = await lastLandlordReasons(listing.id);
      const message = [firstPublishLine(listing), ...(reasons.length ? ['', ...reasons] : [])].join(
        '\n'
      );
      if (await whatsappAdapter.sendText(intake.fromNumber, message)) {
        await markLandlordNotified(listing.id);
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error('[moderation] announcement reconcile failed', listing.id, err);
      failed++;
    }
  }
  if (sent || failed) {
    console.log(`[moderation] reconciled announcements — sent ${sent}, failed ${failed}`);
  }
  return { sent, failed };
}

/** Landlord-facing reasons from the listing's most recent recorded verdict. */
async function lastLandlordReasons(listingId: number): Promise<string[]> {
  const row = await db.query.listingModerations.findFirst({
    where: eq(listingModerations.listingId, listingId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!row?.verdict) return [];
  try {
    const parsed = JSON.parse(row.verdict) as { landlordReasons?: unknown };
    return Array.isArray(parsed.landlordReasons)
      ? parsed.landlordReasons.filter((r): r is string => typeof r === 'string')
      : [];
  } catch {
    return [];
  }
}
