import { db } from './drizzle';
import { listings } from './schema';
import { eq, and, lt, sql } from 'drizzle-orm';

/**
 * Check and mark expired listings
 * Should be run periodically (e.g., via cron job or scheduled task)
 */
export async function checkAndMarkExpiredListings() {
  const now = new Date();
  
  // Find active listings that have expired
  const expiredListings = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        sql`${listings.expiresAt} IS NOT NULL`,
        lt(listings.expiresAt, now)
      )
    );

  if (expiredListings.length === 0) {
    console.log('No expired listings found');
    return { count: 0 };
  }

  // Mark them as expired
  const expiredIds = expiredListings.map(l => l.id);
  
  await db
    .update(listings)
    .set({ status: 'expired' })
    .where(
      and(
        eq(listings.status, 'active'),
        sql`${listings.expiresAt} IS NOT NULL`,
        lt(listings.expiresAt, now)
      )
    );

  console.log(`Marked ${expiredListings.length} listings as expired`);

  // An expired listing is off the site, so its advert must come off our social
  // accounts too — otherwise a Facebook post keeps sending renters to a listing
  // that 404s. Dynamically imported to keep `lib/social` (and its adapter and
  // flag graph) out of this module, which is plain DB code.
  //
  // NOTE: nothing currently calls this function. Fixed anyway, because the gap
  // is invisible until someone wires it to a cron and by then the posts are
  // already orphaned. `reconcileOrphanedSocialPosts` is the backstop either way.
  try {
    const { pullDownForListing } = await import('@/lib/social/publish');
    for (const id of expiredIds) {
      await pullDownForListing(id, 'Listing expired').catch((err) => {
        console.error('[expiry] social pull-down failed', id, err);
        return 0;
      });
    }
  } catch (err) {
    console.error('[expiry] social pull-down unavailable', err);
  }

  return { count: expiredListings.length, ids: expiredIds };
}

