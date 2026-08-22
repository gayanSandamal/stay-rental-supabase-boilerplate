'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { canManageListing } from '@/lib/auth/listing-access';
import { logListingAction } from '@/lib/db/audit-logger';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { pullDownForListing } from '@/lib/social/publish';

/**
 * Take a listing back off Easy Rent's social accounts, on the owner's word.
 *
 * The listing itself is untouched — it stays live on Easy Rent. This removes
 * only the copies WE published, which is the promise the consent prompt made
 * when it asked to share them.
 *
 * `pullDownForListing` is the same routine ops uses, so a landlord takedown and
 * an ops takedown cannot drift: it deletes the Facebook post through the API,
 * flags Instagram and TikTok for manual removal (neither exposes a delete
 * endpoint), notifies ops about those, and cancels anything still queued.
 */
export async function pullDownOwnSocialAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('listingId'));
  if (!Number.isFinite(id) || id <= 0) redirect('/dashboard/listings');

  const user = await getUser();
  if (!user) redirect('/sign-in');

  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) redirect('/dashboard/listings');

  // Re-checked on the POST, not merely on the page render. The page is reached
  // through a bearer link and the check there only decides what to draw.
  const allowed = await canManageListing(user, listing);
  if (!allowed) redirect('/dashboard/listings');

  await loadFeatureFlags();
  await pullDownForListing(id, 'Removed at the landlord’s request');

  await logListingAction('listing_social_pulled', id, user.id, {
    source: 'landlord',
    via: 'access_link_social_page',
  }).catch(() => {});

  revalidatePath(`/dashboard/listings/${id}/social`);
  redirect(`/dashboard/listings/${id}/social?pulled=1`);
}
