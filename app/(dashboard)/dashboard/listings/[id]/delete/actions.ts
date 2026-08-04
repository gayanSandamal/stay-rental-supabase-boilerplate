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

  await logListingAction('listing_archived', id, user.id, {
    via: 'access_link_delete_page',
    previousStatus: listing.status,
  }).catch(() => {});

  revalidatePath('/dashboard/listings');
  redirect('/dashboard/listings?removed=1');
}
