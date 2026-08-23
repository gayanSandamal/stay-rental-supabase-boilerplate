'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { canManageListing } from '@/lib/auth/listing-access';
import { logListingAction } from '@/lib/db/audit-logger';

/**
 * Archive a listing on the owner's instruction.
 *
 * Archive rather than hard delete: it disappears from the public site
 * immediately, ops can restore it if the landlord mis-tapped, and the purge cron
 * removes it (and its photos) permanently after 30 days. A hard delete here
 * would also be a footgun — DELETE /api/listings/[id] can't remove a listing
 * that an intake row references.
 */
export async function archiveListingAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('listingId'));
  if (!Number.isFinite(id) || id <= 0) redirect('/dashboard/listings');

  const user = await getUser();
  if (!user) redirect('/sign-in');

  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) redirect('/dashboard/listings');

  const allowed = await canManageListing(user, listing);
  if (!allowed) redirect('/dashboard/listings');

  await db
    .update(listings)
    .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(listings.id, id));

  // The advert must not outlive the listing.
  //
  // This is the page the WhatsApp "🗑️ To remove it:" link opens, so it is the
  // main way a landlord deletes their own listing — and it was the one
  // de-listing path that never took the social posts down. On 2026-08-23 two
  // listings were archived through here while their Facebook posts stayed up.
  //
  // Called unconditionally rather than only for `active`: pullDownForListing
  // also cancels rows still `queued`/`running`, so a landlord who deletes a
  // consented listing before the sweeper reaches it is not published anyway.
  // Best-effort — the deletion is what the landlord asked for and must stand
  // even if Graph is down; the reconciler on the publish-social cron retries.
  try {
    const { pullDownForListing } = await import('@/lib/social/publish');
    await pullDownForListing(id, 'Landlord deleted the listing');
  } catch (err) {
    console.error('[listing delete] social pull-down failed', id, err);
  }

  await logListingAction('listing_archived', id, user.id, {
    via: 'access_link_delete_page',
    previousStatus: listing.status,
  }).catch(() => {});

  revalidatePath('/dashboard/listings');
  redirect('/dashboard/listings?removed=1');
}
