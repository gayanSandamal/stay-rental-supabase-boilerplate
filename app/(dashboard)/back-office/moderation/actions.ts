'use server';

import { eq, and, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { imageModerationCache, listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getFeatureValue } from '@/lib/feature-flags';
import { logListingAction } from '@/lib/db/audit-logger';
import { PROMPT_VERSION } from '@/lib/moderation/prompts';
import {
  adoptOrphanPhotos,
  derivePhotos,
  parseManifest,
  parsePhotos,
  serializeManifest,
} from '@/lib/images/manifest';

async function requireStaff() {
  const user = await getUser();
  if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
    throw new Error('Unauthorized');
  }
  return user;
}

/** Ops override: publish a held listing as-is. */
export async function publishAnywayAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('listingId'));
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) return;

  const now = new Date();
  const days = Number(getFeatureValue('listingExpirationDays') ?? 30);

  // "Publish anyway" means the reviewer looked at these photos and accepted
  // them — so the queued ones have to become published, not just the listing.
  // Without this the listing went live WITHOUT the very photos on screen.
  const entries = adoptOrphanPhotos(
    parseManifest(listing.photosManifest),
    parsePhotos(listing.photos)
  ).entries;
  for (const e of entries) {
    if (e.v === 'queued') {
      e.v = 'pass';
      e.p = e.p ?? e.o; // unprocessed, but visible — the next pass can derive it
    }
  }
  const publishable = derivePhotos(entries);

  await db
    .update(listings)
    .set({
      status: 'active',
      moderationStatus: 'passed',
      photosManifest: serializeManifest(entries),
      photos: publishable.length ? JSON.stringify(publishable) : null,
      moderationSummary: `Published by ${user.role} override`,
      publishedAt: listing.publishedAt ?? now,
      expiresAt: listing.expiresAt ?? new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      moderationLeaseUntil: null,
      updatedAt: now,
    })
    .where(eq(listings.id, id));

  await logListingAction('listing_moderation_overridden', id, user.id, { action: 'publish_anyway' });

  // The third path to going live, and it owes the same social-sharing offer as
  // the sweeper and the ops approve endpoint. Only on a FIRST publish: a
  // listing that was already live is being re-approved, not published.
  if (!listing.publishedAt) {
    try {
      const fresh = await db.query.listings.findFirst({ where: eq(listings.id, id) });
      if (fresh) {
        const { promptForSocialConsent, enqueueIfAlreadyConsented } = await import(
          '@/lib/social/consent'
        );
        if (fresh.socialConsentAt) await enqueueIfAlreadyConsented(fresh);
        else await promptForSocialConsent(fresh);
      }
    } catch (err) {
      console.error('[moderation] social consent offer failed', err);
    }
  }

  revalidatePath('/back-office/moderation');
}

/** Re-queue for another automated pass (after a prompt change or a fix). */
export async function requeueAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('listingId'));
  await db
    .update(listings)
    .set({ moderationStatus: 'queued', moderationAttempts: 0, moderationLeaseUntil: null, updatedAt: new Date() })
    .where(eq(listings.id, id));
  await logListingAction('listing_moderation_overridden', id, user.id, { action: 'requeue' });
  revalidatePath('/back-office/moderation');
}

/**
 * Restore a photo the checks rejected.
 *
 * Writes human_override on the cache row, so the decision is PERMANENT across
 * every future re-run — without this, ops would fight the same false positive
 * forever. The photo is marked queued so the next pass processes and publishes
 * it (the cached override then makes it pass).
 */
export async function restorePhotoAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('listingId'));
  const originalUrl = String(formData.get('originalUrl') ?? '');
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing || !originalUrl) return;

  // Adopt first: writing derivePhotos() from a manifest that under-covers
  // `photos` would drop the uncovered photos as a side effect of restoring one.
  const manifest = adoptOrphanPhotos(
    parseManifest(listing.photosManifest),
    parsePhotos(listing.photos)
  ).entries;
  const entry = manifest.find((e) => e.o === originalUrl);
  if (!entry) return;

  if (entry.h) {
    await db
      .update(imageModerationCache)
      .set({ humanOverride: true, overriddenBy: user.id })
      .where(
        and(
          eq(imageModerationCache.contentHash, entry.h),
          eq(imageModerationCache.promptVersion, PROMPT_VERSION)
        )
      );
  }

  entry.v = 'queued';
  delete entry.r;
  delete entry.sev;

  await db
    .update(listings)
    .set({
      photosManifest: serializeManifest(manifest),
      photos: (() => {
        const urls = derivePhotos(manifest);
        return urls.length ? JSON.stringify(urls) : null;
      })(),
      moderationStatus: 'queued',
      moderationAttempts: 0,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, id));

  await logListingAction('listing_moderation_overridden', id, user.id, {
    action: 'restore_photo',
    contentHash: entry.h,
  });
  revalidatePath('/back-office/moderation');
}

/** Ids from a bulk form field, clamped so a hand-made request can't run wild. */
function parseIds(formData: FormData): number[] {
  return String(formData.get('listingIds') ?? '')
    .split(',')
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 200);
}

/**
 * Re-run the checks on a selection.
 *
 * The throughput lever for this queue: a promotion that dumps 180 listings in
 * overnight is unworkable one row at a time. Safe to bulk — re-queueing only
 * asks the engine to look again.
 */
export async function bulkRequeueAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const ids = parseIds(formData);
  if (ids.length === 0) return;

  await db
    .update(listings)
    .set({
      moderationStatus: 'queued',
      moderationAttempts: 0,
      moderationLeaseUntil: null,
      updatedAt: new Date(),
    })
    .where(inArray(listings.id, ids));

  // One audit row each: a bulk action stays as traceable as the same edits
  // made individually.
  await Promise.all(
    ids.map((id) =>
      logListingAction('listing_moderation_overridden', id, user.id, {
        action: 'requeue',
        bulk: true,
      })
    )
  );

  revalidatePath('/back-office/moderation');
}

/**
 * Restore every rejected photo on a selection of listings.
 *
 * Most of a held backlog is the same false positive repeated, so this is the
 * action that actually clears it. Each restore is PERMANENT for that image —
 * the caller must have confirmed.
 */
export async function bulkRestorePhotosAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const ids = parseIds(formData);
  if (ids.length === 0) return;

  const rows = await db.query.listings.findMany({ where: inArray(listings.id, ids) });

  for (const listing of rows) {
    const manifest = adoptOrphanPhotos(
      parseManifest(listing.photosManifest),
      parsePhotos(listing.photos)
    ).entries;

    const rejected = manifest.filter((e) => e.v === 'reject');
    if (rejected.length === 0) continue;

    for (const entry of rejected) {
      if (entry.h) {
        await db
          .update(imageModerationCache)
          .set({ humanOverride: true, overriddenBy: user.id })
          .where(
            and(
              eq(imageModerationCache.contentHash, entry.h),
              eq(imageModerationCache.promptVersion, PROMPT_VERSION)
            )
          );
      }
      entry.v = 'queued';
      delete entry.r;
      delete entry.sev;
    }

    const urls = derivePhotos(manifest);
    await db
      .update(listings)
      .set({
        photosManifest: serializeManifest(manifest),
        photos: urls.length ? JSON.stringify(urls) : null,
        moderationStatus: 'queued',
        moderationAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(listings.id, listing.id));

    await logListingAction('listing_moderation_overridden', listing.id, user.id, {
      action: 'restore_photo',
      bulk: true,
      restored: rejected.length,
    });
  }

  revalidatePath('/back-office/moderation');
}
