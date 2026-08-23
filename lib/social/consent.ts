/**
 * Asking for, and recording, permission to share a listing on Easy Rent's own
 * social accounts.
 *
 * Consent is per listing (see `socialConsentPrompt`), and it is recorded on the
 * listing rather than the landlord for the same reason.
 *
 * `socialPromptedAt` is a DELIVERY RECORD, not an intent record: it is stamped
 * only when a prompt actually reached the landlord, so the reconciler can tell
 * "we never managed to ask" from "we asked and they ignored it".
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, listings, whatsappIntakes } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { createNotification } from '@/lib/notifications';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { setConversation } from '@/lib/intake/commands';
import { resolveReplyLang } from '@/lib/intake/language';
import { sendWhatsAppButtons, sendWhatsAppText } from '@/lib/intake/channels/whatsapp/send';
import { socialConsentButtons, socialConsentPrompt } from '@/lib/intake/messages';
import { enqueueSocialPosts } from './publish';
import { enabledPlatforms } from './registry';

type ListingRow = typeof listings.$inferSelect;

/**
 * A consent prompt should stay answerable far longer than a delete
 * confirmation. Landlords routinely reply the next morning, and the cost of a
 * stale "yes" here is a post they already asked for — not a destroyed listing.
 */
export const SOCIAL_CONSENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Ask the owner of a freshly published listing whether we may share it.
 *
 * Safe to call more than once — it returns early if the listing was already
 * prompted, already consented or already declined, so the three publish paths
 * that call it cannot double-ask.
 */
export async function promptForSocialConsent(listing: ListingRow): Promise<boolean> {
  if (!isFeatureEnabled('enableSocialAutoPublish')) return false;
  if (!enabledPlatforms().length) return false;
  if (listing.socialPromptedAt || listing.socialConsentAt || listing.socialDeclinedAt) return false;
  if (listing.status !== 'active') return false;

  const intake = await db.query.whatsappIntakes
    .findFirst({ where: eq(whatsappIntakes.listingId, listing.id) })
    .catch(() => null);

  // --- WhatsApp-origin landlord: ask in the thread they are already in ------
  if (intake?.fromNumber) {
    // The consent prompt is sent minutes after the landlord's own message, so
    // the language they wrote in is already on the intake row.
    const lang = resolveReplyLang(intake.replyLanguage, intake.messageText ?? '');
    const body = socialConsentPrompt(listing.title, lang);
    let sent = false;

    if (isFeatureEnabled('enableWhatsAppRichReplies')) {
      sent = await sendWhatsAppButtons(
        intake.fromNumber,
        body,
        socialConsentButtons(listing.id)
      );
    }
    // Buttons off, or the interactive send was rejected: the plain-text prompt
    // is both the flag-off path and the fallback, exactly as the delete flow
    // treats its menu. The copy already says "Reply YES".
    if (!sent) sent = await sendWhatsAppText(intake.fromNumber, body);

    if (!sent) return false; // leave socialPromptedAt NULL — the reconciler retries

    await db.transaction(async (tx) => {
      await setConversation(
        tx,
        intake.channel,
        intake.fromNumber,
        'confirm_social',
        { socialListingId: listing.id },
        SOCIAL_CONSENT_TTL_MS
      );
    });
    await markPrompted(listing.id);
    return true;
  }

  // --- web-form landlord: in-app, with a one-click CTA ----------------------
  // WhatsApp is not an option here: only intake landlords have a verified
  // wa_phone, and Meta's 24h customer-service window will long since have shut
  // (error 131047) for someone who signed up on the website.
  const landlord = listing.landlordId
    ? await db.query.landlords.findFirst({ where: eq(landlords.id, listing.landlordId) })
    : null;

  if (landlord?.userId) {
    await createNotification({
      userId: landlord.userId,
      type: 'social_publish',
      title: `Share "${listing.title}" on our social channels?`,
      body: "We can post it to Easy Rent's Facebook, Instagram and TikTok to reach more tenants. Your phone number is never included.",
      link: `/dashboard/listings/${listing.id}?social=ask`,
    });
    await markPrompted(listing.id);
    return true;
  }

  // Nobody to ask — an ops-owned listing with no landlord account. Record it
  // anyway so the reconciler stops re-examining it on every tick.
  await markPrompted(listing.id);
  return false;
}

async function markPrompted(listingId: number): Promise<void> {
  await db
    .update(listings)
    .set({ socialPromptedAt: new Date(), updatedAt: new Date() })
    .where(eq(listings.id, listingId));
}

/**
 * Record the answer and, on a yes, queue the posts.
 *
 * Returns how many platform jobs were queued (0 for a decline).
 */
export async function recordConsent(args: {
  listingId: number;
  granted: boolean;
  source: 'whatsapp' | 'web' | 'ops';
  userId?: number;
}): Promise<number> {
  const now = new Date();
  await db
    .update(listings)
    .set(
      args.granted
        ? { socialConsentAt: now, socialConsentSource: args.source, socialDeclinedAt: null, updatedAt: now }
        : { socialDeclinedAt: now, socialConsentAt: null, updatedAt: now }
    )
    .where(eq(listings.id, args.listingId));

  if (!args.granted) return 0;

  // logAudit, not logListingAction: a WhatsApp consent has no signed-in user,
  // and the usual `?? 0` fallback violates the audit_logs FK so the row is
  // dropped. NULL correctly reads as "granted over chat, not by an account".
  await logAudit({
    action: 'listing_social_consent_granted',
    entityType: 'listing',
    entityId: args.listingId,
    userId: args.userId ?? undefined,
    metadata: { source: args.source },
  }).catch(() => {});

  // Only queue for a listing that is actually live — a pending listing would
  // publish a URL that 404s. A consent given earlier is picked up at publish.
  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, args.listingId),
    columns: { status: true },
  });
  if (listing?.status !== 'active') return 0;

  return enqueueSocialPosts(args.listingId);
}

/**
 * Ask again for listings that went live but were never actually asked.
 *
 * The prompt is sent at the tail of a sweeper run, wrapped in a catch. A run
 * that is killed mid-notify — or a WhatsApp send that simply failed — leaves a
 * published listing whose owner was never offered the option, permanently,
 * since nothing retried. This is that retry, and it is why `socialPromptedAt`
 * is stamped on DELIVERY rather than on intent.
 *
 * Bounded to recently-published listings so a permanently undeliverable number
 * is not chased forever.
 */
export async function reconcileMissedSocialPrompts(
  limit = 5,
  withinHours = 24
): Promise<{ prompted: number }> {
  if (!isFeatureEnabled('enableSocialAutoPublish')) return { prompted: 0 };

  const { listingsAwaitingSocialPrompt } = await import('./publish');
  const pending = await listingsAwaitingSocialPrompt(limit, withinHours);

  let prompted = 0;
  for (const listing of pending) {
    try {
      if (await promptForSocialConsent(listing)) prompted++;
    } catch (err) {
      console.error('[social] prompt reconcile failed', listing.id, err);
    }
  }
  if (prompted) console.log(`[social] reconciled ${prompted} missed consent prompt(s)`);
  return { prompted };
}

/**
 * Publish-time hook: a listing consented to while still pending has now gone
 * live, so its posts can finally be queued.
 */
export async function enqueueIfAlreadyConsented(listing: ListingRow): Promise<number> {
  if (!listing.socialConsentAt || listing.status !== 'active') return 0;
  return enqueueSocialPosts(listing.id);
}
