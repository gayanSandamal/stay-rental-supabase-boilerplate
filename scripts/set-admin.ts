import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { users } from '../lib/db/schema';

/**
 * Promote a user to admin. Run against whatever DATABASE_URL points at — which
 * in this repo is usually PRODUCTION, so the email argument is required.
 *
 * It used to default to `admintest@gmail.com`, which made the `if (!email)`
 * guard below dead code: a bare `pnpm db:set-admin` would silently try to grant
 * production admin to an address nobody had audited.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    console.error('Usage: pnpm db:set-admin <email>');
    console.error('The email is required — there is no default.');
    process.exit(1);
  }

  // deleted_at IS NULL: getUser() ignores soft-deleted rows, so promoting one
  // would report success while granting nothing.
  const existing = await db.query.users.findFirst({
    where: and(eq(users.email, email), isNull(users.deletedAt)),
    columns: { id: true, role: true, authUserId: true },
  });

  if (!existing) {
    console.error(`No active user found with email: ${email}`);
    process.exit(1);
  }

  if (existing.role === 'admin') {
    console.log(`User ${email} (#${existing.id}) is already an admin. Nothing to do.`);
    process.exit(0);
  }

  await db
    .update(users)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(users.id, existing.id));

  console.log(`✓ ${email} (#${existing.id}): ${existing.role} → admin`);

  // No auth_user_id means getUser() returns null and the new role is unusable
  // until the account signs up through Supabase Auth.
  if (!existing.authUserId) {
    console.warn('⚠ This user has no Supabase Auth record, so it cannot sign in yet.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to set admin:', err);
  process.exit(1);
});
