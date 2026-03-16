/**
 * Hard-delete a user from Supabase Auth and all database entries.
 * Usage: pnpm db:hard-delete-user <email>
 *
 * Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { eq, or } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import {
  users,
  landlords,
  listings,
  savedSearches,
  businessAccounts,
  auditLogs,
  userContactNumbers,
} from '../lib/db/schema';
import { getSupabaseAdmin } from '../lib/supabase';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: pnpm db:hard-delete-user <email>');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error('DATABASE_URL or POSTGRES_URL is required');
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required for auth user deletion');
    process.exit(1);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const userId = user.id;
  const authUserId = user.authUserId;

  console.log(`Hard-deleting user: ${email} (id=${userId})`);

  // 1. If landlord: delete listings first (listing_views, listing_contact_numbers cascade)
  const [landlord] = await db
    .select()
    .from(landlords)
    .where(eq(landlords.userId, userId))
    .limit(1);

  if (landlord) {
    const deletedListings = await db
      .delete(listings)
      .where(eq(listings.landlordId, landlord.id))
      .returning({ id: listings.id });
    console.log(`  Deleted ${deletedListings.length} listing(s)`);

    await db.delete(landlords).where(eq(landlords.id, landlord.id));
    console.log('  Deleted landlord record');
  }

  // 2. Delete saved_searches
  const deletedSearches = await db
    .delete(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .returning({ id: savedSearches.id });
  console.log(`  Deleted ${deletedSearches.length} saved search(es)`);

  // 3. Null out references to this user
  await db
    .update(businessAccounts)
    .set({ createdBy: null })
    .where(eq(businessAccounts.createdBy, userId));
  await db
    .update(listings)
    .set({
      verifiedBy: null,
      visitedBy: null,
      rejectedBy: null,
      createdBy: null,
    })
    .where(
      or(
        eq(listings.verifiedBy, userId),
        eq(listings.visitedBy, userId),
        eq(listings.rejectedBy, userId),
        eq(listings.createdBy, userId)
      )
    );
  await db
    .update(landlords)
    .set({ kycVerifiedBy: null })
    .where(eq(landlords.kycVerifiedBy, userId));
  await db
    .update(userContactNumbers)
    .set({ verifiedBy: null })
    .where(eq(userContactNumbers.verifiedBy, userId));
  await db
    .update(auditLogs)
    .set({ userId: null })
    .where(eq(auditLogs.userId, userId));
  console.log('  Nulled out references');

  // 4. Delete from public.users (CASCADE: business_account_members, user_contact_numbers, password_reset_tokens, notifications)
  await db.delete(users).where(eq(users.id, userId));
  console.log('  Deleted from public.users');

  // 5. Delete from Supabase Auth if linked
  if (authUserId) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.deleteUser(authUserId);
    if (error) {
      console.error('  Warning: Failed to delete from auth.users:', error.message);
      console.error('  User was removed from database but may still exist in Supabase Auth.');
    } else {
      console.log('  Deleted from auth.users');
    }
  } else {
    console.log('  No auth_user_id (legacy user), skipped auth deletion');
  }

  console.log(`\n✓ User ${email} has been hard-deleted.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to hard-delete user:', err);
  process.exit(1);
});
