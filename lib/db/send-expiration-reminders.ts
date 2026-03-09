import { db } from './drizzle';
import { listings, landlords, users } from './schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { sendListingExpiringReminder } from '@/lib/email';

/**
 * Sends reminder emails for listings expiring in the next 3 days.
 * Run via cron: npx tsx lib/db/send-expiration-reminders.ts
 */
async function main() {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const expiringListings = await db
    .select({
      id: listings.id,
      title: listings.title,
      expiresAt: listings.expiresAt,
      landlordId: listings.landlordId,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        gte(listings.expiresAt, now),
        lte(listings.expiresAt, threeDaysFromNow)
      )
    );

  console.log(`Found ${expiringListings.length} listings expiring within 3 days`);

  for (const listing of expiringListings) {
    const landlord = await db.query.landlords.findFirst({
      where: eq(landlords.id, listing.landlordId),
    });

    if (!landlord) continue;

    const user = await db.query.users.findFirst({
      where: eq(users.id, landlord.userId),
    });

    if (!user) continue;

    const daysRemaining = listing.expiresAt
      ? Math.ceil(
          (new Date(listing.expiresAt).getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : 0;

    await sendListingExpiringReminder(
      user.email,
      user.name || user.email,
      listing.title,
      listing.id,
      daysRemaining
    );

    console.log(`Sent reminder for listing #${listing.id} to ${user.email}`);
  }

  console.log('Done');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
