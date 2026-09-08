/**
 * Telling an owner their property is on Easy Rent.
 *
 * Modelled on lib/reports/send.ts, including the parts that look like
 * over-caution and are not:
 *
 * NO FREE-FORM FALLBACK. Retrying a failed template as plain text is the
 * obvious repair and it cannot work — outside the 24-hour window Meta rejects
 * free-form outright, and repeatedly pushing unsolicited messages at a number
 * is precisely what degrades the WABA quality rating that every landlord's
 * messages depend on. A failed send is recorded and left failed.
 *
 * DRY RUN IS NOT FAILURE. With no approved template registered there is nothing
 * that could have been delivered. Recording that as `failed` would send ops
 * hunting an outage that does not exist — the same lie as a row reading
 * `posted` for a post that was never made.
 *
 * THE IN-APP NOTIFICATION IS WRITTEN EITHER WAY. It is the owner's durable copy
 * the moment they follow the access link, and a Graph outage should not erase
 * the fact that we told them.
 *
 * WHEN IT IS SENT. Only once the listing is actually PUBLIC. The template says
 * the property "is now listed" and carries a link to manage it, so sending it
 * while the listing is still `pending` tells the owner about something they
 * cannot see — and if moderation then holds it, about something that never
 * appears at all. With `enableListingModeration` on (its state in production)
 * every import lands pending, so that was every import. The intake pipeline
 * draws the same line: publishedMessage only when it really went live,
 * otherwise the sweeper announces it later (lib/moderation/notify.ts).
 */

import { isFeatureEnabled } from '@/lib/feature-flags';
import {
  sendWhatsAppTemplate,
  whatsappTemplateName,
} from '@/lib/intake/channels/whatsapp/send';
import { createNotification } from '@/lib/notifications';
import {
  importTemplateParams,
  renderImportText,
  type ImportNotificationInput,
} from './message';

export type NotifyOutcome = 'sent' | 'dry_run' | 'failed';

export interface NotifyArgs extends ImportNotificationInput {
  /** The landlord we created; receives the durable in-app copy. */
  userId: number;
  /** Access-link token — the template's dynamic URL-button suffix. */
  token: string | null;
  /** Where the token lands, for the in-app copy and the dry-run log. */
  dashboardUrl: string;
}

/**
 * Send the owner notification. Never throws: the listing already exists by the
 * time this runs, and a messaging failure must not roll that back.
 */
export async function notifyImportedOwner(args: NotifyArgs): Promise<NotifyOutcome> {
  const params = importTemplateParams(args);
  const body = renderImportText(params, args.dashboardUrl);

  const templateName = whatsappTemplateName('import');
  let outcome: NotifyOutcome = 'dry_run';

  if (!isFeatureEnabled('notifyImportedOwners')) {
    // Deliberately silent: an operator bulk-importing to seed the marketplace
    // may not want a hundred cold messages going out behind them.
    console.log(`[imports:dryrun] to=${args.ownerPhone} (notifyImportedOwners off)`);
  } else if (templateName && args.token) {
    const delivered = await sendWhatsAppTemplate(args.ownerPhone, {
      name: templateName,
      bodyParams: params,
      // The button's base URL is baked into the approved template
      // (https://easyrent.lk/l/); only the token varies.
      urlButtonParam: args.token,
    });
    outcome = delivered ? 'sent' : 'failed';
  } else {
    console.log(
      `[imports:dryrun] to=${args.ownerPhone} ` +
        `(${templateName ? 'no access token minted' : 'no WHATSAPP_IMPORT_TEMPLATE'})\n${body}`
    );
  }

  await createNotification({
    userId: args.userId,
    type: 'listing_approved',
    title: `Your property "${args.listingTitle}" is listed on Easy Rent`,
    body,
    link: '/dashboard/listings',
  }).catch(() => {});

  return outcome;
}

/**
 * Send the owner notice for a listing that has just become public, if that
 * listing came from an import and its owner has not already been told.
 *
 * Called from two places, because a listing can go live by two routes: straight
 * from `publishImport` when moderation is disarmed, or later from the
 * moderation sweeper when it passes. Both funnel through here so the message,
 * the access link and the bookkeeping cannot drift apart.
 *
 * Returns null when the listing did not come from an import — the ordinary case
 * for every WhatsApp intake listing, and not a failure.
 */
export async function notifyImportedOwnerForListing(
  listingId: number
): Promise<NotifyOutcome | null> {
  const { db } = await import('@/lib/db/drizzle');
  const { postImports, listings, landlords } = await import('@/lib/db/schema');
  const { and, eq, isNull } = await import('drizzle-orm');
  const { mintAccessLink } = await import('@/lib/auth/access-links');

  const record = await db.query.postImports.findFirst({
    // notifiedAt null is the idempotency guard: the sweeper re-runs whenever a
    // listing is re-checked, and an owner must not be told twice that their
    // property is now listed.
    where: and(eq(postImports.listingId, listingId), isNull(postImports.notifiedAt)),
  });
  if (!record?.ownerPhone) return null;

  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  if (!listing) return null;

  const landlord = await db.query.landlords.findFirst({
    where: eq(landlords.id, listing.landlordId),
  });
  if (!landlord) return null;

  let token: string | null = null;
  let dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk'}/listings/${listingId}`;
  try {
    const minted = await mintAccessLink({
      userId: landlord.userId,
      listingId,
      channel: 'facebook_import',
    });
    token = minted.token;
    dashboardUrl = minted.dashboardUrl;
  } catch (err) {
    // Costs the owner their one-tap link, not their message.
    console.error('[imports] access link minting failed', err);
  }

  const outcome = await notifyImportedOwner({
    userId: landlord.userId,
    ownerName: record.ownerName,
    listingTitle: listing.title,
    city: listing.city,
    ownerPhone: record.ownerPhone,
    token,
    dashboardUrl,
  });

  await db
    .update(postImports)
    .set({ notifiedAt: new Date(), notifyOutcome: outcome, updatedAt: new Date() })
    .where(eq(postImports.id, record.id));

  return outcome;
}
