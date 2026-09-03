/**
 * Hard-delete a user from Supabase Auth and every database entry.
 * Usage: pnpm db:hard-delete-user <email>
 *
 * Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * This is a thin wrapper. The erasure itself lives in lib/admin/user-lifecycle.ts,
 * shared with the back-office button.
 *
 * IT USED TO BE ITS OWN COPY, AND THE COPY ROTTED. It handled seven of the
 * foreign keys pointing at `users` and the schema had since grown five more
 * (feature_flags.updated_by, image_moderation_cache.overridden_by,
 * impersonation_sessions x2, listing_social_posts.pulled_by /
 * manual_takedown_by, social_accounts.connected_by), so it would have died on a
 * constraint violation for any operator who had ever toggled a flag or pulled a
 * social post — after having already deleted their listings. It also left photos
 * in Supabase Storage, publicly reachable at their original URLs, and never
 * pulled live posts down before destroying the only record of them.
 */
import { eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { users } from '../lib/db/schema';
import { hardDeleteUser } from '../lib/admin/user-lifecycle';

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

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Hard-deleting ${email} (id=${user.id})…`);

  /*
   * actorId is the target itself, which is how the CLI expresses "no signed-in
   * operator did this". It also means assertTargetable's self-check would fire,
   * so the CLI passes `allowSelf` — a shell with DATABASE_URL is already a
   * higher bar than the UI, and this is the documented recovery path for an
   * account the UI refuses (an admin, for instance).
   */
  const result = await hardDeleteUser({
    actorId: user.id,
    userId: user.id,
    confirmEmail: email,
    allowSelf: true,
    allowAdmin: true,
  });

  console.log(
    `\n✓ ${email} hard-deleted. ${result.deletedListings} listing(s), ${result.deletedPhotos} photo(s) removed.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to hard-delete user:', err);
  process.exit(1);
});
