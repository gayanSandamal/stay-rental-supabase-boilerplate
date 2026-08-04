import readline from 'node:readline';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { users } from '../lib/db/schema';
import { getSupabaseAdmin } from '../lib/supabase';

/**
 * Set a Supabase Auth password for an existing user, reading it from the
 * terminal with echo suppressed.
 *
 * Why this exists: `admin.createUser` without a password stores a bcrypt hash
 * of a random value, so the account cannot be signed into and there is nothing
 * to recover. The normal remedy is the forgot-password email — but accounts on
 * a domain with no MX record (e.g. anything @easyrent.lk today) can never
 * receive it, and Supabase's own "send recovery" button has the same problem.
 *
 * The password is never taken as an argv argument: that would put a production
 * credential into shell history, and never printed back for the same reason.
 */
function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    }) as readline.Interface & { _writeToOutput?: (s: string) => void };

    // Echo the prompt but swallow the keystrokes.
    rl._writeToOutput = (str: string) => {
      if (str.includes(query)) process.stdout.write(query);
    };

    rl.question(query, (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: pnpm db:set-password <email>');
    console.error('The password is typed at the prompt, never passed as an argument.');
    process.exit(1);
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email), isNull(users.deletedAt)),
    columns: { id: true, role: true, authUserId: true },
  });

  if (!user) {
    console.error(`No active user found with email: ${email}`);
    process.exit(1);
  }
  if (!user.authUserId) {
    console.error(`${email} has no Supabase Auth record — a password cannot be set.`);
    process.exit(1);
  }

  console.log(`Setting password for ${email} (#${user.id}, role=${user.role}).`);
  const pw = await promptHidden('New password (min 12 chars, hidden): ');
  if (pw.length < 12) {
    console.error('Too short — refusing. An admin credential on production deserves 12+.');
    process.exit(1);
  }
  const again = await promptHidden('Confirm: ');
  if (pw !== again) {
    console.error('Passwords do not match. Nothing changed.');
    process.exit(1);
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(user.authUserId, { password: pw });
  if (error) {
    console.error('Failed to set password:', error.message);
    process.exit(1);
  }

  console.log(`✓ Password set for ${email}. Sign in at /sign-in.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
