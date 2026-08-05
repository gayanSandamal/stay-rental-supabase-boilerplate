'use server';

import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { imageModerationCache, listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import { logListingAction } from '@/lib/db/audit-logger';
import { isModerationConfigured } from '@/lib/moderation/config';
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

  // An override publishes what the reviewer was looking at, photos included:
  // entries left `queued` with no derived URL would publish the listing without
  // them, and nothing would ever come back to release them.
  const { entries } = adoptOrphanPhotos(
    parseManifest(listing.photosManifest),
    parsePhotos(listing.photos)
  );
  for (const entry of entries) {
    if (entry.v !== 'queued') continue;
    entry.p = entry.p ?? entry.o;
    entry.v = 'pass';
  }
  const urls = derivePhotos(entries);

  const now = new Date();
  const days = Number(getFeatureValue('listingExpirationDays') ?? 30);
  await db
    .update(listings)
    .set({
      status: 'active',
      moderationStatus: 'passed',
      moderationSummary: `Published by ${user.role} override`,
      photosManifest: serializeManifest(entries),
      photos: urls.length ? JSON.stringify(urls) : null,
      publishedAt: listing.publishedAt ?? now,
      expiresAt: listing.expiresAt ?? new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      moderationLeaseUntil: null,
      updatedAt: now,
    })
    .where(eq(listings.id, id));

  await logListingAction('listing_moderation_overridden', id, user.id, { action: 'publish_anyway' });
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

  // Adopt first: this action rewrites `photos` from the manifest, so a photo the
  // manifest never tracked would be unpublished as a side effect of restoring a
  // different one.
  const { entries: manifest } = adoptOrphanPhotos(
    parseManifest(listing.photosManifest),
    parsePhotos(listing.photos)
  );
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

  delete entry.r;
  delete entry.sev;

  // Only queue when something can actually claim the queue. Otherwise a
  // restored photo (p === null while queued) would stay invisible forever with
  // no checker to release it — ops would click Restore and see nothing happen.
  const armed = isFeatureEnabled('enableListingModeration') && isModerationConfigured();
  if (armed) {
    entry.v = 'queued';
  } else {
    entry.v = 'pass';
    entry.p = entry.p ?? entry.o;
  }

  await db
    .update(listings)
    .set({
      photosManifest: serializeManifest(manifest),
      photos: (() => {
        const urls = derivePhotos(manifest);
        return urls.length ? JSON.stringify(urls) : null;
      })(),
      ...(armed ? { moderationStatus: 'queued' as const, moderationAttempts: 0 } : {}),
      updatedAt: new Date(),
    })
    .where(eq(listings.id, id));

  await logListingAction('listing_moderation_overridden', id, user.id, {
    action: 'restore_photo',
    contentHash: entry.h,
  });
  revalidatePath('/back-office/moderation');
}
