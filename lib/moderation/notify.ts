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

export async function notifyModerationOutcome(
  listing: ListingRow,
  verdict: ModerationVerdict
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
  if (!verdict.landlordReasons.length && verdict.outcome !== 'passed') return;

  const lines: string[] = [];
  if (verdict.outcome === 'passed') {
    lines.push(`🎉 Your listing "${listing.title}" is now live: ${baseUrl()}/listings/${listing.id}`);
    if (verdict.landlordReasons.length) lines.push('', ...verdict.landlordReasons);
  } else {
    lines.push(...verdict.landlordReasons);
  }
  const message = lines.join('\n');

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
