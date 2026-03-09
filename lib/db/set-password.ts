import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { users } from './schema';
import { hashPassword } from '@/lib/auth/session';

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: tsx lib/db/set-password.ts <email> <newPassword>');
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);

  const result = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.email, email));

  console.log(`Password updated for ${email}. Rows affected:`, (result as any).rowCount ?? 'unknown');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to set password:', err);
  process.exit(1);
});

