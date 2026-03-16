import { db } from './drizzle';
import { users, landlords, listings } from './schema';
import { hashPassword } from '@/lib/auth/session';

async function seed() {
  console.log('Starting Easy Rent seed...');

  // Check if users exist, if not create them
  let adminUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, 'admin@easyrent.com'),
  });

  if (!adminUser) {
    const adminPasswordHash = await hashPassword('admin123');
    [adminUser] = await db
      .insert(users)
      .values({
        email: 'admin@easyrent.com',
        passwordHash: adminPasswordHash,
        role: 'admin',
        name: 'Admin User',
        phone: '+94 77 123 4567',
      })
      .returning();

    console.log('Admin user created:', adminUser.email);
  } else {
    console.log('Admin user already exists:', adminUser.email);
  }

  // Create ops user
  let opsUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, 'ops@easyrent.com'),
  });

  if (!opsUser) {
    const opsPasswordHash = await hashPassword('ops123');
    [opsUser] = await db
      .insert(users)
      .values({
        email: 'ops@easyrent.com',
        passwordHash: opsPasswordHash,
        role: 'ops',
        name: 'Ops User',
        phone: '+94 77 234 5678',
      })
      .returning();
    console.log('Ops user created:', opsUser.email);
  } else {
    console.log('Ops user already exists:', opsUser.email);
  }

  // Create test tenant
  let tenantUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, 'tenant@test.com'),
  });

  if (!tenantUser) {
    const tenantPasswordHash = await hashPassword('tenant123');
    [tenantUser] = await db
      .insert(users)
      .values({
        email: 'tenant@test.com',
        passwordHash: tenantPasswordHash,
        role: 'tenant',
        name: 'Test Tenant',
        phone: '+94 77 345 6789',
      })
      .returning();
    console.log('Tenant user created:', tenantUser.email);
  } else {
    console.log('Tenant user already exists:', tenantUser.email);
  }

  // Create landlord user
  let landlordUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, 'landlord@test.com'),
  });

  if (!landlordUser) {
    const landlordPasswordHash = await hashPassword('landlord123');
    [landlordUser] = await db
      .insert(users)
      .values({
        email: 'landlord@test.com',
        passwordHash: landlordPasswordHash,
        role: 'landlord',
        name: 'Test Landlord',
        phone: '+94 77 456 7890',
      })
      .returning();
    console.log('Landlord user created:', landlordUser.email);
  } else {
    console.log('Landlord user already exists:', landlordUser.email);
  }

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
