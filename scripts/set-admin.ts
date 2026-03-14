import { eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { users } from '../lib/db/schema';

async function main() {
  const email = process.argv[2] ?? 'admintest@gmail.com';

  if (!email) {
    console.error('Usage: pnpm db:set-admin [email]');
    process.exit(1);
  }

  const updated = await db
    .update(users)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(users.email, email))
    .returning({ id: users.id });

  if (updated.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`✓ User ${email} is now an admin.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to set admin:', err);
  process.exit(1);
});
