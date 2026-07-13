import { db } from '@/lib/db/drizzle';
import {
  whatsappIntakes,
  listings,
  userContactNumbers,
  listingContactNumbers,
} from '@/lib/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { logListingAction } from '@/lib/db/audit-logger';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';
import { parseIntake } from './parser';
import { runIntakeChecks } from './checks';
import { getOrCreateOpsIdentity } from './ops-identity';
import { needsInfoMessage, publishedMessage, pendingReviewMessage } from './messages';
import type { ChannelAdapter } from './channels/types';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

/**
 * Intakes settle for SETTLE_MS after the last message so multi-message
 * submissions (text, then photos) batch into one listing. INTAKE_SETTLE_MS is
 * a test seam (set 0 on a local/staging target to process immediately) — do
 * not set it in production.
 */
export const SETTLE_MS = Number(process.env.INTAKE_SETTLE_MS ?? 10 * 60 * 1000);

export type IntakeOutcome = 'published' | 'needs_info' | 'manual_review';

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
export async function processSettledIntakes(
  adapters: ChannelAdapter[],
  opts: { limit?: number } = {}
): Promise<ProcessCounts> {
  const settled = new Date(Date.now() - SETTLE_MS);
  const counts: ProcessCounts = { processed: 0, published: 0, needsInfo: 0, manual: 0 };

  for (const adapter of adapters) {
    const queue = await db.query.whatsappIntakes.findMany({
      where: and(
        eq(whatsappIntakes.channel, adapter.channel),
        eq(whatsappIntakes.status, 'received'),
        lte(whatsappIntakes.lastMessageAt, settled)
      ),
      limit: opts.limit ?? 20,
    });

    counts.processed += queue.length;

    for (const intake of queue) {
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
    await adapter.sendText(
      intake.fromNumber,
      needsInfoMessage(intake.profileName, parsed.missingFields, check.reason)
    );
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
    return 'manual_review';
  }

  // All checks green — create the listing under Easy Rent Operations.
  const ops = await getOrCreateOpsIdentity();
  const autoPublish = isFeatureEnabled('autoPublishWhatsAppIntakes');

  // The sender's own number becomes the listing contact. WhatsApp possession
  // is verified by the platform itself, so mark it verified.
  let contact = await db.query.userContactNumbers.findFirst({
    where: and(
      eq(userContactNumbers.businessAccountId, ops.businessAccountId),
      eq(userContactNumbers.phoneNumber, '+' + intake.fromNumber)
    ),
  });
  if (!contact) {
    [contact] = await db
      .insert(userContactNumbers)
      .values({
        businessAccountId: ops.businessAccountId,
        phoneNumber: '+' + intake.fromNumber,
        isWhatsApp: true,
        label: intake.profileName ?? 'Owner',
        verified: true,
        verifiedAt: new Date(),
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
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [listing] = await db
    .insert(listings)
    .values({
      landlordId: ops.landlordId,
      businessAccountId: ops.businessAccountId,
      createdBy: ops.userId,
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
      listingId: listing.id,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappIntakes.id, intake.id));

  await logListingAction(
    autoPublish ? 'listing_auto_published' : 'listing_created',
    listing.id,
    ops.userId,
    {
      source: `${adapter.channel}_intake`,
      intakeId: intake.id,
      fromNumber: intake.fromNumber,
    }
  );

  const listingUrl = `${baseUrl}/listings/${listing.id}`;
  await adapter.sendText(
    intake.fromNumber,
    autoPublish
      ? publishedMessage(listing.title, listingUrl)
      : pendingReviewMessage(listing.title)
  );

  await notifyOps(
    intake.id,
    autoPublish
      ? `Auto-published from WhatsApp: "${listing.title}" (#${listing.id}) — spot-check it`
      : `WhatsApp listing awaiting approval: "${listing.title}" (#${listing.id})`,
    `/dashboard/listings/${listing.id}`
  );

  return 'published';
}

async function notifyOps(intakeId: number, title: string, link?: string) {
  await createNotificationsForOpsAndAdmin({
    type: 'whatsapp_intake',
    title,
    link: link ?? '/back-office/whatsapp-intakes',
  });
}
