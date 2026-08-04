import { db } from '@/lib/db/drizzle';
import {
  whatsappIntakes,
  listings,
  userContactNumbers,
  listingContactNumbers,
} from '@/lib/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import { logListingAction } from '@/lib/db/audit-logger';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';
import { parseIntake } from './parser';
import { matchCity } from './parser/gazetteer';
import { computeMissingFields, type ParsedIntake } from './parser/types';
import { runIntakeChecks } from './checks';
import { getOrCreateOpsIdentity } from './ops-identity';
import { getOrCreateWhatsAppLandlord } from './landlord-identity';
import { mintAccessLink } from '@/lib/auth/access-links';
import {
  locationRequestPrompt,
  manualReviewMessage,
  needsInfoMessage,
  pendingReviewMessage,
  publishedMessage,
  summarizeUnderstood,
} from './messages';
import { sendWhatsAppLocationRequest, sendWhatsAppText } from './channels/whatsapp/send';
import type { ChannelAdapter } from './channels/types';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

/**
 * Intakes settle for SETTLE_MS after the last message so multi-message
 * submissions (text, then photos) batch into one listing. 4 min balances
 * batching against sender wait time (cron runs every 2 min — see
 * vercel.json). INTAKE_SETTLE_MS is a test seam (set 0 on a local/staging
 * target to process immediately) — do not set it in production.
 */
export const SETTLE_MS = Number(process.env.INTAKE_SETTLE_MS ?? 4 * 60 * 1000);

export type IntakeOutcome = 'published' | 'needs_info' | 'manual_review';

interface LocationPin {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

function parsePin(raw: string | null): LocationPin | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude) ? v : null;
  } catch {
    return null;
  }
}

/**
 * A shared location pin stands in for fields the text never contained: the
 * pin's place strings become the address, and the gazetteer can often resolve
 * the town from them. Typed text always wins — the pin only fills gaps.
 */
function applyLocationPin(parsed: ParsedIntake, pin: LocationPin | null): void {
  if (!pin) return;
  const place = pin.address ?? pin.name ?? null;
  if (!parsed.address) {
    parsed.address =
      place ?? `Pinned location (${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)})`;
  }
  if (!parsed.city && place) {
    const m = matchCity(place.normalize('NFC').toLowerCase());
    if (m) {
      parsed.city = m.city;
      parsed.district = parsed.district ?? m.district;
    }
  }
  // The rules composed the title before the pin resolved the town — retrofit
  // the city so "5BR House" becomes "5BR House in Kolonnawa".
  if (parsed.title && parsed.city && !/\bin\b/i.test(parsed.title)) {
    parsed.title = `${parsed.title} in ${parsed.city}`;
  }
  parsed.missingFields = computeMissingFields(parsed);
}

export interface ProcessCounts {
  processed: number;
  published: number;
  needsInfo: number;
  manual: number;
}

/**
 * Processes settled intakes for the given channels: parse → validate →
 * create listing. One intake failing routes that row to manual_review and the
 * loop continues — a landlord's submission is never silently dropped.
 */
/**
 * Per-run wall-clock budget. Each intake can now spend up to ~24s on sends and
 * the LLM fallback (3 × 8s timeouts); without a budget a 20-row backlog burst
 * would blow the route's maxDuration=60 and get killed mid-intake. Unclaimed
 * rows simply wait for the next 2-minute tick.
 */
const RUN_BUDGET_MS = Number(process.env.INTAKE_RUN_BUDGET_MS ?? 45_000);

export async function processSettledIntakes(
  adapters: ChannelAdapter[],
  opts: { limit?: number } = {}
): Promise<ProcessCounts> {
  const settled = new Date(Date.now() - SETTLE_MS);
  const counts: ProcessCounts = { processed: 0, published: 0, needsInfo: 0, manual: 0 };
  const startedAt = Date.now();

  for (const adapter of adapters) {
    const queue = await db.query.whatsappIntakes.findMany({
      where: and(
        eq(whatsappIntakes.channel, adapter.channel),
        eq(whatsappIntakes.status, 'received'),
        lte(whatsappIntakes.lastMessageAt, settled)
      ),
      limit: opts.limit ?? 20,
    });

    for (const intake of queue) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) break;
      counts.processed++;
      try {
        const outcome = await processIntake(intake, adapter);
        if (outcome === 'published') counts.published++;
        else if (outcome === 'needs_info') counts.needsInfo++;
        else counts.manual++;
      } catch (err) {
        console.error(`Intake ${intake.id} failed`, err);
        await db
          .update(whatsappIntakes)
          .set({
            status: 'manual_review',
            failureReason: `Processing error: ${err instanceof Error ? err.message : 'unknown'}`,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(whatsappIntakes.id, intake.id));
        counts.manual++;
        // Same rule as the flagged path: the sender must hear something.
        await adapter
          .sendText(intake.fromNumber, manualReviewMessage(intake.profileName))
          .catch(() => {});
      }
    }
  }

  return counts;
}

export async function processIntake(
  intake: typeof whatsappIntakes.$inferSelect,
  adapter: ChannelAdapter
): Promise<IntakeOutcome> {
  // Rule-based parse (LLM fallback only when flagged on) — never null; an
  // unparseable message surfaces as missingFields → needs_info.
  const parsed = await parseIntake(intake.messageText ?? '');
  const pin = parsePin(intake.locationPin);
  applyLocationPin(parsed, pin);

  const check = await runIntakeChecks(parsed);

  if (!check.ok && check.retriable) {
    await db
      .update(whatsappIntakes)
      .set({
        parsedPayload: JSON.stringify(parsed),
        status: 'needs_info',
        failureReason: check.reason,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappIntakes.id, intake.id));
    const sent = await adapter.sendText(
      intake.fromNumber,
      needsInfoMessage(intake.profileName, parsed.missingFields, check.reason, {
        unsupportedMedia: intake.hasUnsupportedMedia,
        understood: summarizeUnderstood(parsed),
      })
    );
    if (!sent) {
      // Undelivered ask = the sender waits forever. Ops must know.
      await notifyOps(
        intake.id,
        `Could not reach WhatsApp sender for intake #${intake.id} (needs info: ${check.reason})`
      );
    } else if (
      isFeatureEnabled('enableWhatsAppRichReplies') &&
      adapter.channel === 'whatsapp' &&
      !pin &&
      parsed.missingFields.some((f) => f === 'address' || f === 'city')
    ) {
      // A native pin answers the hardest field to type — offer the button.
      await sendWhatsAppLocationRequest(intake.fromNumber, locationRequestPrompt());
    }
    return 'needs_info';
  }

  if (!check.ok) {
    await db
      .update(whatsappIntakes)
      .set({
        parsedPayload: JSON.stringify(parsed),
        status: 'manual_review',
        failureReason: check.reason,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappIntakes.id, intake.id));
    await notifyOps(intake.id, `WhatsApp intake #${intake.id} flagged: ${check.reason}`);
    // Never a silent dead end: the sender can't see our review queue, and
    // "no reply ever" was the worst path in the original flow.
    await adapter.sendText(intake.fromNumber, manualReviewMessage(intake.profileName));
    return 'manual_review';
  }

  // All checks green — create the listing.
  const ops = await getOrCreateOpsIdentity();
  const autoPublish = isFeatureEnabled('autoPublishWhatsAppIntakes');

  // Give the sender their own account so they can manage the listing
  // themselves. Falls back to the Ops identity when that isn't possible — a
  // landlord's submission must never be lost to an auth hiccup.
  const owner = isFeatureEnabled('enableWhatsAppLandlordAccounts')
    ? await getOrCreateWhatsAppLandlord({
        senderId: intake.fromNumber,
        profileName: intake.profileName,
      })
    : null;
  if (isFeatureEnabled('enableWhatsAppLandlordAccounts') && !owner) {
    await notifyOps(
      intake.id,
      `Could not create a landlord account for ${intake.fromNumber} — listing published under Easy Rent Operations`
    );
  }

  // The sender's own number becomes the listing contact. WhatsApp possession is
  // verified by the platform itself, so mark it verified. Scope matters: the
  // contact must belong to whoever owns the listing, or the landlord's edit form
  // loads zero contact numbers and PUT rejects the save.
  // user_contact_numbers has a CHECK that exactly ONE of user_id /
  // business_account_id is set.
  const contactScope = owner
    ? { userId: owner.userId }
    : { businessAccountId: ops.businessAccountId };
  let contact = await db.query.userContactNumbers.findFirst({
    where: and(
      owner
        ? eq(userContactNumbers.userId, owner.userId)
        : eq(userContactNumbers.businessAccountId, ops.businessAccountId),
      eq(userContactNumbers.phoneNumber, '+' + intake.fromNumber)
    ),
  });
  if (!contact) {
    [contact] = await db
      .insert(userContactNumbers)
      .values({
        ...contactScope,
        phoneNumber: '+' + intake.fromNumber,
        isWhatsApp: true,
        label: intake.profileName ?? 'Owner',
        verified: true,
        verifiedAt: new Date(),
        // "Platform support verified this" — still the ops identity.
        verifiedBy: ops.userId,
      })
      .returning();
  }

  const media: string[] = (() => {
    try {
      const v = JSON.parse(intake.mediaPaths ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })();

  const now = new Date();
  const expirationDays = Number(getFeatureValue('listingExpirationDays') ?? 30);
  const expires = new Date(now.getTime() + expirationDays * 24 * 60 * 60 * 1000);

  const [listing] = await db
    .insert(listings)
    .values({
      landlordId: owner?.landlordId ?? ops.landlordId,
      // Own account → no business account, so the publisher line is the
      // landlord rather than "Easy Rent Operations".
      ...(owner ? {} : { businessAccountId: ops.businessAccountId }),
      createdBy: owner?.userId ?? ops.userId,
      title: parsed.title!,
      description:
        parsed.description ??
        'Listed via the Easy Rent WhatsApp concierge. Details confirmed with the owner.',
      propertyType: parsed.propertyType,
      address: parsed.address!,
      city: parsed.city!,
      district: parsed.district,
      bedrooms: parsed.bedrooms!,
      bathrooms: parsed.bathrooms,
      rentPerMonth: String(parsed.rentPerMonth!),
      ...(pin ? { latitude: String(pin.latitude), longitude: String(pin.longitude) } : {}),
      photos: media.length ? JSON.stringify(media) : null,
      sourceContactName: intake.profileName,
      status: autoPublish ? 'active' : 'pending',
      ...(autoPublish ? { publishedAt: now, expiresAt: expires } : {}),
    })
    .returning();

  await db.insert(listingContactNumbers).values({
    listingId: listing.id,
    contactNumberId: contact.id,
    isNew: true,
  });

  await db
    .update(whatsappIntakes)
    .set({
      parsedPayload: JSON.stringify(parsed),
      status: 'published',
      // Clear any needs_info reason left from an earlier round of this session.
      failureReason: null,
      listingId: listing.id,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappIntakes.id, intake.id));

  // Everything past this point is best-effort: the listing exists and the
  // intake row says published — an audit/reply/notify failure must never
  // bubble into the outer catch and clobber the status to manual_review.
  try {
    await logListingAction(
      autoPublish ? 'listing_auto_published' : 'listing_created',
      listing.id,
      owner?.userId ?? ops.userId,
      {
        source: `${adapter.channel}_intake`,
        intakeId: intake.id,
        fromNumber: intake.fromNumber,
        newAccount: owner?.isNew ?? false,
      }
    );

    // Self-service links, only for landlords who actually own the listing.
    // A minting failure must not stop the confirmation going out.
    let links: { viewUrl: string; editUrl?: string | null; deleteUrl?: string | null } = {
      viewUrl: `${baseUrl}/listings/${listing.id}`,
    };
    if (owner) {
      try {
        const minted = await mintAccessLink({
          userId: owner.userId,
          listingId: listing.id,
          channel: adapter.channel,
        });
        links = { viewUrl: minted.viewUrl, editUrl: minted.editUrl, deleteUrl: minted.deleteUrl };
      } catch (err) {
        console.error('[intake] access link minting failed', err);
      }
    }

    const confirmation = autoPublish
      ? publishedMessage(listing.title, links, {
          unsupportedMedia: intake.hasUnsupportedMedia && media.length === 0,
        })
      : pendingReviewMessage(listing.title, links.editUrl);
    // Rich replies render the view link as a preview card (the copy already
    // puts it first for exactly this) — plain text otherwise, byte-identical
    // to the pre-flag behavior.
    const sent =
      adapter.channel === 'whatsapp' && isFeatureEnabled('enableWhatsAppRichReplies')
        ? await sendWhatsAppText(intake.fromNumber, confirmation, { previewUrl: true })
        : await adapter.sendText(intake.fromNumber, confirmation);
    if (!sent) {
      await notifyOps(
        intake.id,
        `Listing #${listing.id} published but the WhatsApp confirmation to the owner failed — contact them manually`
      );
    }

    await notifyOps(
      intake.id,
      autoPublish
        ? `Auto-published from WhatsApp: "${listing.title}" (#${listing.id}) — spot-check it`
        : `WhatsApp listing awaiting approval: "${listing.title}" (#${listing.id})`,
      `/dashboard/listings/${listing.id}`
    );
  } catch (err) {
    console.error(`Post-publish follow-up failed for intake ${intake.id}`, err);
  }

  return 'published';
}

async function notifyOps(intakeId: number, title: string, link?: string) {
  await createNotificationsForOpsAndAdmin({
    type: 'whatsapp_intake',
    title,
    link: link ?? '/back-office/whatsapp-intakes',
  });
}
