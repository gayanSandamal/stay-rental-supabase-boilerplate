import { db } from './drizzle';
import { users, landlords, listings } from './schema';
import { getSupabaseAdmin } from '@/lib/supabase';

async function createUserIfNotExists(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
  password: string,
  role: 'admin' | 'ops' | 'tenant' | 'landlord',
  name: string,
  phone: string
) {
  let appUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });

  if (!appUser) {
    const { data: authData, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let authUserId = authData?.user?.id;
    if (!authUserId && error?.message?.toLowerCase().includes('already')) {
      const { data: listData } = await supabase.auth.admin.listUsers();
      authUserId = listData.users.find((u) => u.email === email)?.id;
    }
    if (!authUserId && !error) {
      authUserId = authData?.user?.id;
    }
    if (!authUserId) {
      throw new Error(`Failed to create or find auth user for ${email}: ${error?.message ?? 'unknown'}`);
    }

    [appUser] = await db
      .insert(users)
      .values({
        email,
        authUserId,
        role,
        name,
        phone,
      })
      .returning();

    console.log(`User created: ${email}`);
  } else {
    console.log(`User already exists: ${email}`);
  }

  return appUser!;
}

async function seed() {
  console.log('Starting Easy Rent seed...');

  const supabase = getSupabaseAdmin();

  const adminUser = await createUserIfNotExists(
    supabase,
    'admin@easyrent.com',
    'admin123',
    'admin',
    'Admin User',
    '+94 77 123 4567'
  );

  const opsUser = await createUserIfNotExists(
    supabase,
    'ops@easyrent.com',
    'ops123',
    'ops',
    'Ops User',
    '+94 77 234 5678'
  );

  const tenantUser = await createUserIfNotExists(
    supabase,
    'tenant@test.com',
    'tenant123',
    'tenant',
    'Test Tenant',
    '+94 77 345 6789'
  );

  const landlordUser = await createUserIfNotExists(
    supabase,
    'landlord@test.com',
    'landlord123',
    'landlord',
    'Test Landlord',
    '+94 77 456 7890'
  );

  // Create landlord record
  let landlord = await db.query.landlords.findFirst({
    where: (landlords, { eq }) => eq(landlords.userId, landlordUser.id),
  });

  if (!landlord) {
    [landlord] = await db
      .insert(landlords)
      .values({
        userId: landlordUser.id,
        nic: '123456789V',
        kycVerified: true,
        kycVerifiedAt: new Date(),
        kycVerifiedBy: adminUser.id,
      })
      .returning();
    console.log('Landlord record created');
  } else {
    console.log('Landlord record already exists');
  }

  // Create sample listings
  const sampleListings = [
    {
      landlordId: landlord.id,
      title: 'Modern 2BR Apartment in Colombo 7',
      description:
        'Beautiful 2-bedroom apartment in the heart of Colombo 7. Fully furnished with modern amenities. Perfect for professionals working in the city.',
      status: 'active' as const,
      address: '123 Galle Road, Colombo 07',
      city: 'Colombo',
      district: 'Colombo',
      latitude: '6.9271',
      longitude: '79.8612',
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      areaSqft: 1200,
      rentPerMonth: '85000',
      depositMonths: 3,
      utilitiesIncluded: false,
      serviceCharge: '5000',
      powerBackup: 'generator',
      waterSource: 'mains',
      waterTankSize: 1000,
      hasFiber: true,
      fiberISPs: 'SLT, Dialog',
      acUnits: 2,
      fans: 4,
      ventilation: 'good',
      isGated: true,
      hasGuard: true,
      hasCCTV: true,
      hasBurglarBars: true,
      parking: true,
      parkingSpaces: 1,
      petsAllowed: false,
      noticePeriodDays: 30,
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: adminUser.id,
      visited: true,
      visitedAt: new Date(),
      visitedBy: opsUser.id,
      photos: JSON.stringify([
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267',
      ]),
    },
    {
      landlordId: landlord.id,
      title: 'Spacious 3BR House in Kandy',
      description:
        'Large 3-bedroom house with garden in Kandy. Ideal for families. Close to schools and hospitals.',
      status: 'active' as const,
      address: '456 Peradeniya Road, Kandy',
      city: 'Kandy',
      district: 'Kandy',
      latitude: '7.2906',
      longitude: '80.6337',
      propertyType: 'house',
      bedrooms: 3,
      bathrooms: 2,
      areaSqft: 2000,
      rentPerMonth: '120000',
      depositMonths: 4,
      utilitiesIncluded: true,
      powerBackup: 'solar',
      waterSource: 'borehole',
      waterTankSize: 2000,
      hasFiber: true,
      fiberISPs: 'SLT',
      acUnits: 3,
      fans: 6,
      ventilation: 'excellent',
      isGated: true,
      hasGuard: false,
      hasCCTV: false,
      hasBurglarBars: true,
      parking: true,
      parkingSpaces: 2,
      petsAllowed: true,
      noticePeriodDays: 45,
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: adminUser.id,
      visited: true,
      visitedAt: new Date(),
      visitedBy: opsUser.id,
      photos: JSON.stringify([
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994',
      ]),
    },
    {
      landlordId: landlord.id,
      title: 'Cozy 1BR Studio in Nugegoda',
      description:
        'Compact 1-bedroom studio perfect for students or young professionals. Close to public transport.',
      status: 'active' as const,
      address: '789 High Level Road, Nugegoda',
      city: 'Colombo',
      district: 'Colombo',
      latitude: '6.8636',
      longitude: '79.8972',
      propertyType: 'apartment',
      bedrooms: 1,
      bathrooms: 1,
      areaSqft: 600,
      rentPerMonth: '45000',
      depositMonths: 3,
      utilitiesIncluded: false,
      powerBackup: 'ups',
      waterSource: 'mains',
      waterTankSize: 500,
      hasFiber: false,
      acUnits: 1,
      fans: 2,
      ventilation: 'fair',
      isGated: false,
      hasGuard: false,
      hasCCTV: false,
      hasBurglarBars: true,
      parking: false,
      petsAllowed: false,
      noticePeriodDays: 30,
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: adminUser.id,
      visited: true,
      visitedAt: new Date(),
      visitedBy: opsUser.id,
      photos: JSON.stringify([
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267',
      ]),
    },
    {
      landlordId: landlord.id,
      title: 'Luxury 4BR Villa in Mount Lavinia',
      description:
        'Stunning 4-bedroom villa with sea view. Premium location with all modern amenities.',
      status: 'pending' as const,
      address: '321 Galle Road, Mount Lavinia',
      city: 'Colombo',
      district: 'Colombo',
      latitude: '6.8396',
      longitude: '79.8631',
      propertyType: 'house',
      bedrooms: 4,
      bathrooms: 3,
      areaSqft: 3500,
      rentPerMonth: '250000',
      depositMonths: 6,
      utilitiesIncluded: true,
      serviceCharge: '15000',
      powerBackup: 'generator',
      waterSource: 'mains',
      waterTankSize: 3000,
      hasFiber: true,
      fiberISPs: 'SLT, Dialog, Mobitel',
      acUnits: 5,
      fans: 8,
      ventilation: 'excellent',
      isGated: true,
      hasGuard: true,
      hasCCTV: true,
      hasBurglarBars: true,
      parking: true,
      parkingSpaces: 3,
      petsAllowed: true,
      noticePeriodDays: 60,
      verified: false,
      visited: false,
      photos: JSON.stringify([
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994',
      ]),
    },
  ];

  for (const listingData of sampleListings) {
    await db.insert(listings).values(listingData);
  }

  console.log(`${sampleListings.length} sample listings created`);

  console.log('✅ Easy Rent seed completed successfully!');
  console.log('\nLogin credentials:');
  console.log('Admin: admin@easyrent.com / admin123');
  console.log('Ops: ops@easyrent.com / ops123');
  console.log('Tenant: tenant@test.com / tenant123');
  console.log('Landlord: landlord@test.com / landlord123');
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
