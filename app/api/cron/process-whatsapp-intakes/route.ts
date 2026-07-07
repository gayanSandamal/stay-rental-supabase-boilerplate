import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  whatsappIntakes,
  listings,
  userContactNumbers,
  listingContactNumbers,
} from '@/lib/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { parseIntakeText } from '@/lib/whatsapp/parser';
import { runIntakeChecks } from '@/lib/whatsapp/checks';
import { sendWhatsAppText } from '@/lib/whatsapp/send';
import { getOrCreateOpsIdentity } from '@/lib/whatsapp/ops-identity';
import { logListingAction, logAudit } from '@/lib/db/audit-logger';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

/**
 * Processes settled WhatsApp intakes: parse → validate → create listing.
 * Vercel Cron (see vercel.json). Secured by CRON_SECRET — fails closed.
 *
 * Intakes settle for SETTLE_MS after the last message so multi-message
 * submissions (text, then photos) batch into one listing.
 */
const SETTLE_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing CRON_SECRET must NOT make this endpoint public.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableWhatsAppIntake')) {
    return NextResponse.json({ ok: true, skipped: 'flag off' });
  }

  const settled = new Date(Date.now() - SETTLE_MS);
  const queue = await db.query.whatsappIntakes.findMany({
    where: and(
      eq(whatsappIntakes.status, 'received'),
      lte(whatsappIntakes.lastMessageAt, settled)
    ),
    limit: 20,
  });

  let published = 0;
  let needsInfo = 0;
  let manual = 0;

  for (const intake of queue) {
    try {
      const outcome = await processIntake(intake);
      if (outcome === 'published') published++;
      else if (outcome === 'needs_info') needsInfo++;
      else manual++;
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
      manual++;
    }
  }

  return NextResponse.json({ ok: true, processed: queue.length, published, needsInfo, manual });
}

type Outcome = 'published' | 'needs_info' | 'manual_review';

async function processIntake(
  intake: typeof whatsappIntakes.$inferSelect
): Promise<Outcome> {
  const parsed = await parseIntakeText(intake.messageText ?? '');

  // Parser unavailable (no API key / API error) → humans take over.
  if (!parsed) {
    await db
      .update(whatsappIntakes)
      .set({
        status: 'manual_review',
        failureReason: 'Parser unavailable — process manually in back office',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappIntakes.id, intake.id));
    await notifyOps(intake.id, `WhatsApp intake #${intake.id} needs manual processing`);
    return 'manual_review';
  }

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
    await sendWhatsAppText(
      intake.fromNumber,
      `Thanks${intake.profileName ? ' ' + intake.profileName : ''}! To publish your listing we still need: ${parsed.missingFields.join(', ') || check.reason}. Just reply here with the details.`
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

  // The sender's own WhatsApp number becomes the listing contact. WhatsApp
  // possession is verified by the platform itself, so mark it verified.
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
    { source: 'whatsapp_intake', intakeId: intake.id, fromNumber: intake.fromNumber }
  );

  const listingUrl = `${baseUrl}/listings/${listing.id}`;
  await sendWhatsAppText(
    intake.fromNumber,
    autoPublish
      ? `🎉 Your listing "${listing.title}" is now LIVE on Easy Rent: ${listingUrl}\nTenants will call or WhatsApp you directly. Reply here anytime to update it.`
      : `Thanks! Your listing "${listing.title}" has been created and is with our team for a quick review. We'll message you when it's live.`
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
