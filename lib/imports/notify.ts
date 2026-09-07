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
