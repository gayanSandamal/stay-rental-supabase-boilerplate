/**
 * Turning a reviewed import into a live listing, an account, and a message.
 *
 * Mirrors the insert block in lib/intake/process.ts — that is the codebase's
 * pattern for creating a listing without going through POST /api/listings, and
 * the two must stay recognisably the same shape or one of them will quietly
 * stop enqueueing moderation.
 *
 * WHERE IT DELIBERATELY DIFFERS FROM INTAKE:
 *
 *  - The contact number is `verified: false`. Intake marks it true because Meta
 *    proved possession of the sender's number. Here the number was typed into a
 *    public advert by someone we have never heard from.
 *  - The listing NEVER auto-publishes past moderation. `autoPublishWhatsAppIntakes`
 *    is about a landlord submitting their own property; these are third-party
 *    photos and third-party text, so when moderation is armed the sweeper
 *    decides, exactly as it does for intake.
 *
 * EVERY QUERY IS SEQUENTIAL. On Vercel the pool is `max: 1` against Supabase's
 * transaction pooler, and concurrent queries on that connection wedge the whole
 * request (commit a3ac4f9). No Promise.all in this file, ever.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  listingContactNumbers,
  listings,
  postImports,
  userContactNumbers,
  type PostImport,
} from '@/lib/db/schema';
import { logAudit, logListingAction } from '@/lib/db/audit-logger';
import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import { mintAccessLink } from '@/lib/auth/access-links';
import { getOrCreateOpsIdentity } from '@/lib/intake/ops-identity';
import { getOrCreateWhatsAppLandlord } from '@/lib/intake/landlord-identity';
import { isModerationConfigured } from '@/lib/moderation/config';
import { capPhotos, capRejectEntries, photoCap } from '@/lib/images/cap';
import { manifestFromLegacyPhotos, serializeManifest } from '@/lib/images/manifest';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';
import type { ParsedIntake } from '@/lib/intake/parser/types';
import { notifyImportedOwner, type NotifyOutcome } from './notify';

export interface PublishResult {
  listingId: number;
  /** True when the listing is public NOW; false when moderation holds it. */
  live: boolean;
  /**
   * How the owner notice went — or `deferred` when the listing is pending and
   * the moderation sweeper will send it on a pass. Never reports a send that
   * has not happened.
   */
  notify: NotifyOutcome | 'deferred';
  /** The account is new to us, i.e. this owner had never been seen before. */
  newAccount: boolean;
}

export class ImportPublishError extends Error {}

/**
 * Publish one reviewed import. The caller has already vetted the payload on the
 * review screen; this validates only what the database cannot be trusted to
 * refuse on its own.
 */
export async function publishImport(
  record: PostImport,
  opsUserId: number
): Promise<PublishResult> {
  if (record.status === 'published') {
    throw new ImportPublishError('This import has already been published.');
  }

  const parsed = parsePayload(record.parsedPayload);
  if (!parsed.title || !parsed.city || parsed.bedrooms == null || parsed.rentPerMonth == null) {
    throw new ImportPublishError(
      'Title, city, bedrooms and monthly rent are all required before publishing.'
    );
  }
  if (!record.ownerPhone) {
    throw new ImportPublishError('Confirm the owner’s phone number before publishing.');
  }

  const ops = await getOrCreateOpsIdentity();

  // The owner gets their own account so the edit and delete links in our
  // message actually belong to them. `phoneVerified: false` is the whole point:
  // we hold their number, nobody has proven it, and the reports job must not
  // treat it as proof. Falls back to the ops identity so a publish is never
  // lost to an auth hiccup — the same rule the intake path follows.
  const owner = await getOrCreateWhatsAppLandlord({
    senderId: record.ownerPhone,
    profileName: record.ownerName,
    phoneVerified: false,
  });
  if (!owner) {
    await notifyOps(
      `Could not create an account for ${record.ownerPhone} — imported listing published under Easy Rent Operations`
    );
  }

  // user_contact_numbers has a CHECK that exactly ONE of user_id /
  // business_account_id is set, and the number must be scoped to whoever owns
  // the listing or the landlord's edit form loads zero numbers and every save
  // is rejected.
  const contactScope = owner
    ? { userId: owner.userId }
    : { businessAccountId: ops.businessAccountId };
  let contact = await db.query.userContactNumbers.findFirst({
    where: and(
      owner
        ? eq(userContactNumbers.userId, owner.userId)
        : eq(userContactNumbers.businessAccountId, ops.businessAccountId),
      eq(userContactNumbers.phoneNumber, record.ownerPhone)
    ),
  });
  if (!contact) {
    [contact] = await db
      .insert(userContactNumbers)
      .values({
        ...contactScope,
        phoneNumber: record.ownerPhone,
        // Assumed, not proven — almost every Sri Lankan mobile is on WhatsApp,
        // and being wrong here costs a renter one failed tap, not a bad message.
        isWhatsApp: true,
        label: record.ownerName ?? 'Owner',
        // NOT verified. Nobody has confirmed this number belongs to them, and
        // the verified badge is a trust signal the marketplace is built on.
        verified: false,
      })
      .returning();
  }

  const cap = photoCap();
  const { kept, dropped } = capPhotos(parsePhotoUrls(record.photoUrls), cap);

  const moderationArmed =
    isFeatureEnabled('enableListingModeration') && isModerationConfigured();
  const manifestEntries =
    moderationArmed || dropped.length
      ? [...manifestFromLegacyPhotos(kept), ...capRejectEntries(dropped, cap)]
      : [];

  const now = new Date();
  const expirationDays = Number(getFeatureValue('listingExpirationDays') ?? 30);
  const expires = new Date(now.getTime() + expirationDays * 24 * 60 * 60 * 1000);

  const [listing] = await db
    .insert(listings)
    .values({
      landlordId: owner?.landlordId ?? ops.landlordId,
      ...(owner ? {} : { businessAccountId: ops.businessAccountId }),
      createdBy: opsUserId,
      title: parsed.title,
      description:
        parsed.description ??
        'Listed by Easy Rent from the owner’s public advert. Details confirmed before publishing.',
      propertyType: parsed.propertyType,
      address: parsed.address,
      city: parsed.city,
      district: parsed.district,
      bedrooms: parsed.bedrooms,
      bathrooms: parsed.bathrooms,
      rentPerMonth: String(parsed.rentPerMonth),
      photos: kept.length ? JSON.stringify(kept) : null,
      ...(manifestEntries.length ? { photosManifest: serializeManifest(manifestEntries) } : {}),
      ...(moderationArmed ? { moderationStatus: 'queued' as const } : {}),
      // The real owner's name, so the listing reads as theirs even while the
      // row is scoped to Ops. Same use as the WhatsApp concierge path.
      sourceContactName: record.ownerName,
      // An operator has read this and pressed publish, so it goes live unless
      // the automated checks are armed — third-party photos are exactly what
      // they exist for, and the sweeper flips it to active on a pass.
      status: moderationArmed ? ('pending' as const) : ('active' as const),
      ...(moderationArmed ? {} : { publishedAt: now, expiresAt: expires }),
    })
    .returning();

  await db.insert(listingContactNumbers).values({
    listingId: listing.id,
    contactNumberId: contact.id,
    isNew: true,
  });

  await db
    .update(postImports)
    .set({
      status: 'published',
      listingId: listing.id,
      updatedAt: now,
    })
    .where(eq(postImports.id, record.id));

  // Past this point the listing exists and the import says published. A failed
  // audit write, link mint or message must never bubble out and undo that.
  let notify: NotifyOutcome | 'deferred' = moderationArmed ? 'deferred' : 'dry_run';
  try {
    await logListingAction('listing_created', listing.id, opsUserId, {
      source: 'facebook_import',
      importId: record.id,
      sourceUrl: record.sourceUrl,
      resolvedVia: record.resolvedVia,
      newAccount: owner?.isNew ?? false,
    });
    await logAudit({
      action: 'post_import_published',
      entityType: 'post_import',
      entityId: record.id,
      userId: opsUserId,
      metadata: { listingId: listing.id, sourceUrl: record.sourceUrl },
    });

    // ONLY when the listing is genuinely public. The template says the property
    // "is now listed" and links to it; sending that while moderation still has
    // it pending describes something the owner cannot see, and if the checks
    // then hold it, something that never appears. When moderation is armed the
    // sweeper sends this after it passes — the same division the intake
    // pipeline draws between publishedMessage and pendingReviewMessage.
    if (!moderationArmed) {
      notify = await notifyOwner(record, listing.id, listing.title, parsed.city, owner);
      await db
        .update(postImports)
        .set({ notifiedAt: new Date(), notifyOutcome: notify, updatedAt: new Date() })
        .where(eq(postImports.id, record.id));
    }

    await notifyOps(
      moderationArmed
        ? `Imported listing queued for automated checks: "${listing.title}" (#${listing.id})`
        : `Imported listing published: "${listing.title}" (#${listing.id}) — spot-check it`,
      `/dashboard/listings/${listing.id}`
    );
  } catch (err) {
    console.error(`[imports] post-publish follow-up failed for import ${record.id}`, err);
  }

  return {
    listingId: listing.id,
    live: !moderationArmed,
    notify,
    newAccount: owner?.isNew ?? false,
  };
}

/** Mint the self-service link and send the template. Owner-only by definition. */
async function notifyOwner(
  record: PostImport,
  listingId: number,
  listingTitle: string,
  city: string | null,
  owner: { userId: number } | null
): Promise<NotifyOutcome> {
  if (!owner || !record.ownerPhone) return 'dry_run';

  let token: string | null = null;
  let dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk'}/listings/${listingId}`;
  try {
    const minted = await mintAccessLink({
      userId: owner.userId,
      listingId,
      channel: 'facebook_import',
    });
    token = minted.token;
    dashboardUrl = minted.dashboardUrl;
  } catch (err) {
    // A minting failure costs the owner their one-tap link, not their message.
    console.error('[imports] access link minting failed', err);
  }

  return notifyImportedOwner({
    userId: owner.userId,
    ownerName: record.ownerName,
    listingTitle,
    city,
    ownerPhone: record.ownerPhone,
    token,
    dashboardUrl,
  });
}

async function notifyOps(title: string, link?: string): Promise<void> {
  await createNotificationsForOpsAndAdmin({
    type: 'whatsapp_intake',
    title,
    ...(link ? { link } : {}),
  }).catch(() => {});
}

export function parsePayload(raw: string | null): ParsedIntake {
  if (!raw) return emptyParsed();
  try {
    const value = JSON.parse(raw) as ParsedIntake;
    return value && typeof value === 'object' ? value : emptyParsed();
  } catch {
    return emptyParsed();
  }
}

export function parsePhotoUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function emptyParsed(): ParsedIntake {
  return {
    title: null,
    description: null,
    propertyType: null,
    address: null,
    city: null,
    district: null,
    bedrooms: null,
    bathrooms: null,
    rentPerMonth: null,
    missingFields: [],
    suspicious: false,
    suspicionReason: null,
  };
}
