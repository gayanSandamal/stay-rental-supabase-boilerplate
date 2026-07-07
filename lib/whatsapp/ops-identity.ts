import { db } from '@/lib/db/drizzle';
import {
  users,
  landlords,
  businessAccounts,
  businessAccountMembers,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const OPS_EMAIL = 'concierge@easyrent.lk';
const OPS_NAME = 'Easy Rent Operations';

export interface OpsIdentity {
  userId: number;
  landlordId: number;
  businessAccountId: number;
}

/**
 * Get-or-create the system identity that owns concierge listings:
 * a `users` row (no auth login — authUserId stays null like legacy users),
 * its `landlords` record, and the "Easy Rent Operations" business account.
 * Listings attach to the business account so the public publisher line reads
 * "Easy Rent Operations"; the real owner's name goes to listings.sourceContactName.
 */
export async function getOrCreateOpsIdentity(): Promise<OpsIdentity> {
  let user = await db.query.users.findFirst({
    where: eq(users.email, OPS_EMAIL),
  });
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: OPS_EMAIL, name: OPS_NAME, role: 'ops' })
      .onConflictDoNothing({ target: users.email })
      .returning();
    // Lost a race → fetch the winner
    user ??= (await db.query.users.findFirst({ where: eq(users.email, OPS_EMAIL) }))!;
  }

  let landlord = await db.query.landlords.findFirst({
    where: eq(landlords.userId, user.id),
  });
  if (!landlord) {
    [landlord] = await db.insert(landlords).values({ userId: user.id }).returning();
  }

  let account = await db.query.businessAccounts.findFirst({
    where: eq(businessAccounts.name, OPS_NAME),
  });
  if (!account) {
    [account] = await db
      .insert(businessAccounts)
      .values({
        name: OPS_NAME,
        email: OPS_EMAIL,
        status: 'active',
        createdBy: user.id,
      })
      .returning();
    await db.insert(businessAccountMembers).values({
      businessAccountId: account.id,
      userId: user.id,
      role: 'owner',
      isActive: true,
    });
  }

  return {
    userId: user.id,
    landlordId: landlord.id,
    businessAccountId: account.id,
  };
}
