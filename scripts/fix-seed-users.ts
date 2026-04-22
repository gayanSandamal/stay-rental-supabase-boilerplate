/**
 * Fix script: Create or repair the 4 seed users on remote Supabase.
 *
 * The DB trigger `on_auth_user_created` auto-inserts into public.users
 * with role='tenant' whenever auth.users gets a new row. This conflicts
 * with the seed script. This script handles that by:
 *   1. Creating auth users (if missing)
 *   2. Waiting for the trigger to fire
 *   3. Updating the role in public.users to the correct value
 *   4. Creating the landlord record if needed
 */

import { db } from '../lib/db/drizzle';
import { users, landlords } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSupabaseAdmin } from '../lib/supabase';

const SEED_USERS = [
  { email: 'admin@easyrent.com', password: 'admin123', role: 'admin' as const, name: 'Admin User', phone: '+94 77 123 4567' },
  { email: 'ops@easyrent.com', password: 'ops123', role: 'ops' as const, name: 'Ops User', phone: '+94 77 234 5678' },
  { email: 'tenant@test.com', password: 'tenant123', role: 'tenant' as const, name: 'Test Tenant', phone: '+94 77 345 6789' },
  { email: 'landlord@test.com', password: 'landlord123', role: 'landlord' as const, name: 'Test Landlord', phone: '+94 77 456 7890' },
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const supabase = getSupabaseAdmin();
  console.log('=== Fix Seed Users ===\n');

  for (const seed of SEED_USERS) {
    console.log(`── ${seed.email} (${seed.role}) ──`);

    // Step 1: Ensure auth user exists
    let authUserId: string | undefined;

    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: seed.email,
      password: seed.password,
      email_confirm: true,
    });

    if (authData?.user?.id) {
      authUserId = authData.user.id;
      console.log(`  Auth user created: ${authUserId}`);
    } else if (createError?.message?.toLowerCase().includes('already')) {
      // Already exists in auth — find the ID
      const { data: listData } = await supabase.auth.admin.listUsers();
      authUserId = listData.users.find((u) => u.email === seed.email)?.id;
      console.log(`  Auth user already exists: ${authUserId}`);

      // Also update the password in case it's wrong
      if (authUserId) {
        await supabase.auth.admin.updateUserById(authUserId, {
          password: seed.password,
          email_confirm: true,
        });
        console.log(`  Password reset to: ${seed.password}`);
      }
    } else {
      console.error(`  ERROR creating auth user: ${createError?.message}`);
      continue;
    }

    if (!authUserId) {
      console.error('  ERROR: Could not get auth user ID');
      continue;
    }

    // Step 2: Wait briefly for the trigger to fire
    await sleep(1000);

    // Step 3: Check if public.users row exists
    let appUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, seed.email),
    });

    if (appUser) {
      // Update role, name, phone, authUserId if needed
      await db.update(users).set({
        role: seed.role,
        name: seed.name,
        phone: seed.phone,
        authUserId,
      }).where(eq(users.email, seed.email));
      console.log(`  Updated role to '${seed.role}', name to '${seed.name}'`);

      // Re-fetch
      appUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, seed.email),
      });
    } else {
      // Trigger didn't fire or was too slow — insert manually
      const [inserted] = await db.insert(users).values({
        email: seed.email,
        authUserId,
        role: seed.role,
        name: seed.name,
        phone: seed.phone,
      }).returning();
      appUser = inserted;
      console.log(`  Inserted into public.users with role '${seed.role}'`);
    }

    console.log(`  ✅ Done (id=${appUser!.id}, role=${appUser!.role})\n`);
  }

  // Step 4: Create landlord record for landlord@test.com
  console.log('── Creating landlord record ──');
  const landlordUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, 'landlord@test.com'),
  });
  const adminUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, 'admin@easyrent.com'),
  });

  if (landlordUser) {
    let landlord = await db.query.landlords.findFirst({
      where: (l, { eq }) => eq(l.userId, landlordUser.id),
    });

    if (!landlord) {
      [landlord] = await db.insert(landlords).values({
        userId: landlordUser.id,
        nic: '123456789V',
        kycVerified: true,
        kycVerifiedAt: new Date(),
        kycVerifiedBy: adminUser?.id ?? landlordUser.id,
      }).returning();
      console.log(`  Landlord record created (id=${landlord.id})`);
    } else {
      console.log(`  Landlord record already exists (id=${landlord.id})`);
    }
  }

  console.log('\n🎉 All seed users ready!\n');
  console.log('Login credentials:');
  console.log('  Admin:    admin@easyrent.com / admin123');
  console.log('  Ops:      ops@easyrent.com / ops123');
  console.log('  Tenant:   tenant@test.com / tenant123');
  console.log('  Landlord: landlord@test.com / landlord123');

  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
