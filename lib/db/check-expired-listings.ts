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
  
  return { count: expiredListings.length, ids: expiredIds };
}

