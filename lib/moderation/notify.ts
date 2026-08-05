/**
 * Telling people what happened. WhatsApp-originated listings get a chat reply
 * (that's where the landlord is); everything else gets an in-app notification.
 * Ops always hear about a hold.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, listings } from '@/lib/db/schema';
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

export interface ModerationNotifyContext {
  /** The listing was already public before this run (an incremental re-check). */
  wasLive: boolean;
  /** Photos that became publicly visible in this run. */
  added: number;
  /** Photos refused because the listing was already at the cap. */
  refused: number;
}

export async function notifyModerationOutcome(
  listing: ListingRow,
  verdict: ModerationVerdict,
  ctx: ModerationNotifyContext = { wasLive: false, added: 0, refused: 0 }
): Promise<void> {
  const intake = await findIntakeForListing(listing.id).catch(() => null);

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
  } else if (verdict.droppedUrls.length) {
    await createNotificationsForOpsAndAdmin({
      type: 'whatsapp_intake',
      title: `Listing #${listing.id} published — ${verdict.droppedUrls.length} photo(s) dropped`,
      body: verdict.reasons.slice(0, 2).join(' · ').slice(0, 300),
      link: `/dashboard/listings/${listing.id}`,
    });
  }

  // --- the landlord --------------------------------------------------------
  // A hold on an already-live listing that ISN'T about an unsafe image leaves
  // the listing up (see persist), so telling the owner "we're reviewing your
  // listing" would alarm them about something that is fine and still visible.
  if (ctx.wasLive && verdict.outcome === 'held' && verdict.holdReason !== 'unsafe_image') return;
  if (!verdict.landlordReasons.length && verdict.outcome !== 'passed') return;

  const lines: string[] = [];
  if (verdict.outcome === 'passed') {
    if (!ctx.wasLive) {
      lines.push(`🎉 Your listing "${listing.title}" is now live: ${baseUrl()}/listings/${listing.id}`);
    } else if (ctx.added > 0) {
      // Incremental: the listing was already announced once. Repeating the
      // 🎉 line on every photo batch reads like a bug.
      lines.push(
        `📸 ${ctx.added} photo${ctx.added === 1 ? '' : 's'} ${ctx.added === 1 ? 'is' : 'are'} now on "${listing.title}".`
      );
    } else if (!verdict.landlordReasons.length) {
      // Nothing changed for the owner — stay quiet.
      return;
    }
    if (verdict.landlordReasons.length) lines.push('', ...verdict.landlordReasons);
  } else {
    lines.push(...verdict.landlordReasons);
  }
  const message = lines.join('\n').trim();
  if (!message) return;

  if (intake?.fromNumber) {
    const sent = await whatsappAdapter.sendText(intake.fromNumber, message);
    if (!sent) {
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
  }
}
