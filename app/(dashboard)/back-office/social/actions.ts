'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { listingSocialPosts } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { logListingAction } from '@/lib/db/audit-logger';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { adapterFor } from '@/lib/social/registry';
import type { SocialPlatform } from '@/lib/social/types';

async function requireStaff() {
  const user = await getUser();
  if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
    throw new Error('Forbidden');
  }
  return user;
}

/**
 * Take a post down.
 *
 * Only Facebook Page can actually be deleted through an API. For Instagram and
 * TikTok this records the intent and leaves the permalink on screen so a human
 * finishes the job — the row is marked `pulled` either way, but the error text
 * says plainly which of the two happened. Claiming a takedown we did not
 * perform would be worse than not offering the button.
 */
export async function pullDownAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  await loadFeatureFlags();

  const id = Number(formData.get('postId'));
  const row = await db.query.listingSocialPosts.findFirst({
    where: eq(listingSocialPosts.id, id),
  });
  if (!row) return;

  const adapter = adapterFor(row.platform as SocialPlatform);
  let removed = false;
  if (adapter?.supportsRemove && row.remotePostId) {
    removed = await adapter.remove(row.remotePostId).catch(() => false);
  }

  await db
    .update(listingSocialPosts)
    .set({
      status: 'pulled',
      pulledAt: new Date(),
      pulledBy: user.id,
      error: removed
        ? 'Deleted from the platform'
        : 'REMOVE BY HAND — this platform has no delete API',
      updatedAt: new Date(),
    })
    .where(eq(listingSocialPosts.id, id));

  await logListingAction('listing_social_pulled', row.listingId, user.id, {
    platform: row.platform,
    remotePostId: row.remotePostId,
    deletedViaApi: removed,
  }).catch(() => {});

  revalidatePath('/back-office/social');
}

/** Put a failed row back in the queue for another attempt. */
export async function retryAction(formData: FormData): Promise<void> {
  await requireStaff();
  const id = Number(formData.get('postId'));
  await db
    .update(listingSocialPosts)
    .set({
      status: 'queued',
      attempts: 0,
      leaseUntil: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(listingSocialPosts.id, id));
  revalidatePath('/back-office/social');
}

/**
 * Mark a Facebook Group draft as posted.
 *
 * The Group row can never be `posted` by the worker — there is no API — so this
 * is how a human closes the loop after pasting it, and it keeps the queue from
 * showing the same draft forever.
 */
export async function markGroupPostedAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('postId'));
  const row = await db.query.listingSocialPosts.findFirst({
    where: eq(listingSocialPosts.id, id),
  });
  if (!row) return;

  await db
    .update(listingSocialPosts)
    .set({
      status: 'posted',
      postedAt: new Date(),
      remotePostId: `manual-${user.id}-${Date.now()}`,
      error: 'Posted by hand (Facebook Groups have no API)',
      updatedAt: new Date(),
    })
    .where(eq(listingSocialPosts.id, id));

  await logListingAction('listing_social_published', row.listingId, user.id, {
    platform: row.platform,
    manual: true,
  }).catch(() => {});

  revalidatePath('/back-office/social');
}
