import { db } from './drizzle';
import {
  users,
  landlords,
  listings,
  leads,
  viewings,
  savedSearches,
  businessAccounts,
  businessAccountMembers,
  userContactNumbers,
  listingContactNumbers,
  auditLogs,
} from './schema';
import { hashPassword } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function randDate(from: Date, to: Date): Date {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
}

function futureDate(from: Date, maxDays: number): Date {
  return new Date(from.getTime() + randInt(1, maxDays) * 86_400_000);
}

function sriLankanPhone(): string {
  const prefixes = ['71', '72', '75', '76', '77', '78'];
  return `+94 ${pick(prefixes)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;
}

function sriLankanNIC(): string {
  const year = randInt(1960, 2002);
  const serial = randInt(1000, 9999).toString().padStart(4, '0');
  return Math.random() > 0.5
    ? `${year}${randInt(1, 365).toString().padStart(3, '0')}${serial}${randInt(0, 9)}V`
    : `${year}${randInt(100000, 999999)}`;
}

// ─── Data pools ────────────────────────────────────────────────────────────────

const sinhaleseFirstNames = [
  'Kasun', 'Nuwan', 'Chaminda', 'Dhananjaya', 'Saman', 'Lakshitha', 'Nimal',
  'Pradeep', 'Roshan', 'Dinesh', 'Ruwan', 'Charitha', 'Malith', 'Sampath',
  'Pasan', 'Kavindu', 'Janith', 'Supun', 'Tharindu', 'Sandun',
  'Nethmi', 'Dilini', 'Sachini', 'Anusha', 'Kumari', 'Iresha', 'Nimali',
  'Gayani', 'Chamari', 'Rasika', 'Hirunika', 'Malini', 'Sewwandi',
  'Thilini', 'Lakmali', 'Hashini', 'Nadeeka', 'Chathurika', 'Disna', 'Asha',
];

const tamilFirstNames = [
  'Kumaran', 'Vijay', 'Rajesh', 'Suresh', 'Anand', 'Mohan', 'Ganesh',
  'Priya', 'Selvi', 'Lakshmi', 'Meena', 'Devi', 'Kavitha', 'Sangeetha',
];

const muslimFirstNames = [
  'Mohamed', 'Ahmed', 'Ismail', 'Fathima', 'Rizwan', 'Fazil', 'Nashreen',
  'Amina', 'Safiya', 'Rizna', 'Faiz', 'Nazar', 'Azeez', 'Shafiya',
];

const firstNames = [...sinhaleseFirstNames, ...tamilFirstNames, ...muslimFirstNames];

const sinhaleseLastNames = [
  'Perera', 'Fernando', 'De Silva', 'Jayawardena', 'Bandara', 'Wickramasinghe',
  'Gunasekara', 'Rajapaksa', 'Dissanayake', 'Senanayake', 'Kumarasinghe',
  'Rathnayake', 'Herath', 'Pathirana', 'Weerasinghe', 'Samarawickrama',
  'Karunaratne', 'Siriwardena', 'Gunawardana', 'Liyanage',
];

const tamilLastNames = [
  'Rajaratnam', 'Selvarajah', 'Sivarajah', 'Thambiah', 'Kanagasabai',
  'Krishnapillai', 'Subramaniam', 'Arulanandam', 'Ganeshamoorthy', 'Yogeswaran',
];

const lastNames = [...sinhaleseLastNames, ...tamilLastNames];

const locations = [
  { city: 'Colombo', district: 'Colombo', lat: 6.9271, lng: 79.8612 },
  { city: 'Kandy', district: 'Kandy', lat: 7.2906, lng: 80.6337 },
  { city: 'Galle', district: 'Galle', lat: 6.0329, lng: 80.2170 },
  { city: 'Negombo', district: 'Gampaha', lat: 7.2083, lng: 79.8358 },
  { city: 'Mount Lavinia', district: 'Colombo', lat: 6.8396, lng: 79.8631 },
  { city: 'Nugegoda', district: 'Colombo', lat: 6.8636, lng: 79.8972 },
  { city: 'Dehiwala', district: 'Colombo', lat: 6.8567, lng: 79.8614 },
  { city: 'Moratuwa', district: 'Colombo', lat: 6.7733, lng: 79.8825 },
  { city: 'Ratmalana', district: 'Colombo', lat: 6.8203, lng: 79.8861 },
  { city: 'Battaramulla', district: 'Colombo', lat: 6.9000, lng: 79.9167 },
  { city: 'Rajagiriya', district: 'Colombo', lat: 6.9064, lng: 79.8970 },
  { city: 'Nawala', district: 'Colombo', lat: 6.8906, lng: 79.8918 },
  { city: 'Kottawa', district: 'Colombo', lat: 6.8417, lng: 80.0489 },
  { city: 'Maharagama', district: 'Colombo', lat: 6.8483, lng: 79.9267 },
  { city: 'Boralesgamuwa', district: 'Colombo', lat: 6.8417, lng: 79.9042 },
  { city: 'Colombo 3', district: 'Colombo', lat: 6.9175, lng: 79.8509 },
  { city: 'Colombo 5', district: 'Colombo', lat: 6.8950, lng: 79.8633 },
  { city: 'Colombo 7', district: 'Colombo', lat: 6.9139, lng: 79.8636 },
  { city: 'Colombo 4', district: 'Colombo', lat: 6.8877, lng: 79.8573 },
  { city: 'Colombo 6', district: 'Colombo', lat: 6.8842, lng: 79.8653 },
  { city: 'Jaffna', district: 'Jaffna', lat: 9.6615, lng: 80.0255 },
  { city: 'Matara', district: 'Matara', lat: 5.9549, lng: 80.5550 },
  { city: 'Kurunegala', district: 'Kurunegala', lat: 7.4863, lng: 80.3623 },
  { city: 'Nuwara Eliya', district: 'Nuwara Eliya', lat: 6.9497, lng: 80.7891 },
  { city: 'Anuradhapura', district: 'Anuradhapura', lat: 8.3114, lng: 80.4037 },
  { city: 'Trincomalee', district: 'Trincomalee', lat: 8.5874, lng: 81.2152 },
  { city: 'Wattala', district: 'Gampaha', lat: 6.9896, lng: 79.8910 },
  { city: 'Kaduwela', district: 'Colombo', lat: 6.9328, lng: 79.9842 },
  { city: 'Piliyandala', district: 'Colombo', lat: 6.8006, lng: 79.9222 },
  { city: 'Panadura', district: 'Kalutara', lat: 6.7133, lng: 79.9047 },
];

const streetNames = [
  'Galle Road', 'High Level Road', 'Duplication Road', 'Havelock Road',
  'Bauddhaloka Mawatha', 'Wijerama Mawatha', 'Sri Jayawardenepura Mawatha',
  'Station Road', 'Temple Road', 'School Lane', 'Hospital Road', 'Market Street',
  'Peradeniya Road', 'Kandy Road', 'Negombo Road', 'De Soysa Mawatha',
  'Flower Road', 'Baseline Road', 'Kotte Road', 'Nawala Road',
  'Beddagana Road', 'Kirulapone Avenue', 'Elvitigala Mawatha', 'Park Street',
  'Sea Beach Road', 'Lake Drive', 'Green Path', 'Chatham Street',
];

const propertyTypes = ['house', 'apartment', 'room'] as const;
const powerBackupOptions = ['generator', 'solar', 'ups', 'inverter', ''] as const;
const waterSourceOptions = ['mains', 'tank', 'borehole', 'mains_tank', 'mains_borehole'] as const;
const ventilationOptions = ['excellent', 'good', 'fair', 'poor'] as const;
const fiberISPOptions = ['SLT', 'Dialog', 'Mobitel', 'SLT, Dialog', 'Dialog, Mobitel', 'SLT, Dialog, Mobitel'] as const;
const contactLabels = ['Primary', 'Office', 'Mobile', 'Home', 'WhatsApp'] as const;
const viewingOutcomes = ['interested', 'passed', 'no_show', 'follow_up', 'rented'] as const;

const propertyPhotos = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
  'https://images.unsplash.com/photo-1600585154084-4e5fe7c39198?w=800',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
  'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800',
];

const businessNames = [
  'Island Properties (Pvt) Ltd',
  'Lanka Real Estate Group',
  'Cinnamon Homes',
  'Serendib Realty',
  'Pearl Island Properties',
  'Sapphire Estate Management',
  'Ceylon Living Spaces',
  'Colombo Prestige Rentals',
  'Hill Country Homes',
  'Coastal Property Partners',
];

const rejectionReasons = [
  'Photos do not match the property description.',
  'Incomplete information — missing address details.',
  'Property appears to be a duplicate listing.',
  'Rent price seems unrealistically low for the area.',
  'Contact number is invalid or not reachable.',
  'Property does not meet minimum quality standards.',
  'Listing contains misleading information.',
  'Required documents not provided.',
];

const leadNotes = [
  'Looking for a property near schools.',
  'Interested in long-term rental (2+ years).',
  'Relocating from overseas, need furnished.',
  'Budget flexible for the right property.',
  'Needs parking for 2 vehicles.',
  'Wants pet-friendly accommodation.',
  'Prefers quiet neighbourhood.',
  'Moving in within the next 2 weeks.',
  'Looking for fiber internet connectivity.',
  'Would like to schedule a visit this weekend.',
  'Needs generator backup — works from home.',
  'Family of 4, looking for 3BR minimum.',
  '',
];

const viewingNotes = [
  'Tenant was impressed with the kitchen.',
  'Asked about water pressure and backup.',
  'Concerned about traffic noise from the main road.',
  'Will confirm after discussing with family.',
  'Very interested, asked about move-in date.',
  'Requested a second viewing with spouse.',
  'Checked all rooms, seems satisfied.',
  'Asked about rent negotiation.',
  '',
];

const savedSearchNames = [
  'Colombo apartments under 80K',
  'Family homes in Kandy',
  '3BR near schools',
  'Affordable rooms Nugegoda',
  'Sea-view Galle',
  'Luxury apartments Colombo 7',
  'Pet-friendly houses',
  'Fiber-ready apartments',
  'Furnished places near office',
  'Budget studio rooms',
  'Homes with generator backup',
  'Gated community houses',
];

// ─── Seed function ─────────────────────────────────────────────────────────────

async function seedSampleData() {
  console.log('🌱 Starting comprehensive sample data seed (~1300 records)...\n');

  // ── Step 1: Fetch existing foundation users ──────────────────────────────

  const adminUser = await db.query.users.findFirst({ where: eq(users.email, 'admin@stayrental.com') });
  const opsUser = await db.query.users.findFirst({ where: eq(users.email, 'ops@stayrental.com') });

  if (!adminUser || !opsUser) {
    console.error('Admin or Ops user not found. Run `npm run db:seed` first.');
    process.exit(1);
  }

  const passwordHash = await hashPassword('password123');

  // ── Step 2: Create users (75 total: 40 tenants, 25 landlords, 8 ops, 2 admin) ──

  console.log('Creating users...');
  const usedEmails = new Set<string>();
  const userRecords: { email: string; role: 'tenant' | 'landlord' | 'ops' | 'admin'; name: string }[] = [];

  function uniqueEmail(first: string, last: string): string {
    let email = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}@example.com`;
    let attempt = 0;
    while (usedEmails.has(email)) {
      attempt++;
      email = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}${attempt}@example.com`;
    }
    usedEmails.add(email);
    return email;
  }

  const roleDistribution: Array<'tenant' | 'landlord' | 'ops' | 'admin'> = [
    ...Array(40).fill('tenant'),
    ...Array(25).fill('landlord'),
    ...Array(8).fill('ops'),
    ...Array(2).fill('admin'),
  ];

  for (const role of roleDistribution) {
    const first = pick(firstNames);
    const last = pick(lastNames);
    userRecords.push({ email: uniqueEmail(first, last), role, name: `${first} ${last}` });
  }

  const insertedUserIds: number[] = [];
  const batchSize = 20;

  for (let i = 0; i < userRecords.length; i += batchSize) {
    const batch = userRecords.slice(i, i + batchSize);
    const rows = await db.insert(users).values(
      batch.map((u) => ({
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        phone: sriLankanPhone(),
        createdAt: daysAgo(randInt(1, 180)),
      }))
    ).returning();
    insertedUserIds.push(...rows.map((r) => r.id));
  }
  console.log(`  ✓ ${insertedUserIds.length} users created`);

  const tenantIds = insertedUserIds.filter((_, i) => userRecords[i].role === 'tenant');
  const landlordUserIds = insertedUserIds.filter((_, i) => userRecords[i].role === 'landlord');
  const opsIds = [opsUser.id, ...insertedUserIds.filter((_, i) => userRecords[i].role === 'ops')];
  const adminIds = [adminUser.id, ...insertedUserIds.filter((_, i) => userRecords[i].role === 'admin')];
  const allStaffIds = [...opsIds, ...adminIds];

  // ── Step 3: Create landlord records (25 new) ────────────────────────────

  console.log('Creating landlord records...');
  const landlordRecords: { id: number; userId: number }[] = [];

  for (let i = 0; i < landlordUserIds.length; i += batchSize) {
    const batch = landlordUserIds.slice(i, i + batchSize);
    const rows = await db.insert(landlords).values(
      batch.map((uid) => ({
        userId: uid,
        nic: sriLankanNIC(),
        kycVerified: Math.random() > 0.3,
        kycVerifiedAt: Math.random() > 0.3 ? daysAgo(randInt(1, 90)) : null,
        kycVerifiedBy: Math.random() > 0.3 ? pick(adminIds) : null,
      }))
    ).returning();
    landlordRecords.push(...rows.map((r) => ({ id: r.id, userId: r.userId })));
  }

  // Also fetch the original test landlord
  const origLandlord = await db.query.landlords.findFirst({
    where: eq(landlords.userId, (await db.query.users.findFirst({ where: eq(users.email, 'landlord@test.com') }))!.id),
  });
  if (origLandlord) landlordRecords.push({ id: origLandlord.id, userId: origLandlord.userId });

  const landlordIds = landlordRecords.map((l) => l.id);
  console.log(`  ✓ ${landlordRecords.length} landlord records`);

  // ── Step 4: Create business accounts (10) ────────────────────────────────

  console.log('Creating business accounts...');
  const insertedBusinessAccounts: { id: number }[] = [];

  for (let i = 0; i < businessNames.length; i += batchSize) {
    const batch = businessNames.slice(i, i + batchSize);
    const rows = await db.insert(businessAccounts).values(
      batch.map((name, idx) => ({
        name,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}.lk`,
        phone: sriLankanPhone(),
        address: `${randInt(1, 200)} ${pick(streetNames)}, ${pick(locations).city}`,
        status: idx < 8 ? ('active' as const) : pick(['active', 'suspended', 'inactive'] as const),
        createdBy: pick(adminIds),
        createdAt: daysAgo(randInt(30, 180)),
      }))
    ).returning();
    insertedBusinessAccounts.push(...rows.map((r) => ({ id: r.id })));
  }
  console.log(`  ✓ ${insertedBusinessAccounts.length} business accounts`);

  // ── Step 5: Create business account members (25) ─────────────────────────

  console.log('Creating business account members...');
  const memberUserPool = [...landlordUserIds];
  let memberCount = 0;

  for (const ba of insertedBusinessAccounts) {
    const numMembers = randInt(2, 4);
    const memberRoles = ['owner', ...Array(numMembers - 1).fill(null).map(() => pick(['admin', 'member']))];

    for (const role of memberRoles) {
      if (memberUserPool.length === 0) break;
      const userId = memberUserPool.splice(randInt(0, memberUserPool.length - 1), 1)[0];
      await db.insert(businessAccountMembers).values({
        businessAccountId: ba.id,
        userId,
        role,
        isActive: Math.random() > 0.1,
        joinedAt: daysAgo(randInt(1, 120)),
      });
      memberCount++;
    }
  }
  console.log(`  ✓ ${memberCount} business account members`);

  // ── Step 6: Create contact numbers (~120) ────────────────────────────────

  console.log('Creating contact numbers...');
  const contactNumberIds: { id: number; userId: number | null; baId: number | null }[] = [];

  // For landlord users (1-3 numbers each)
  for (const lr of landlordRecords) {
    const numContacts = randInt(1, 3);
    for (let c = 0; c < numContacts; c++) {
      const rows = await db.insert(userContactNumbers).values({
        userId: lr.userId,
        businessAccountId: null,
        phoneNumber: sriLankanPhone(),
        isWhatsApp: Math.random() > 0.4,
        label: pick(contactLabels),
        isActive: true,
        verified: Math.random() > 0.3,
        verifiedAt: Math.random() > 0.3 ? daysAgo(randInt(1, 60)) : null,
        verifiedBy: Math.random() > 0.3 ? pick(allStaffIds) : null,
      }).returning();
      contactNumberIds.push({ id: rows[0].id, userId: lr.userId, baId: null });
    }
  }

  // For business accounts (2-3 numbers each)
  for (const ba of insertedBusinessAccounts) {
    const numContacts = randInt(2, 3);
    for (let c = 0; c < numContacts; c++) {
      const rows = await db.insert(userContactNumbers).values({
        userId: null,
        businessAccountId: ba.id,
        phoneNumber: sriLankanPhone(),
        isWhatsApp: Math.random() > 0.5,
        label: pick(contactLabels),
        isActive: true,
        verified: Math.random() > 0.2,
        verifiedAt: Math.random() > 0.2 ? daysAgo(randInt(1, 60)) : null,
        verifiedBy: Math.random() > 0.2 ? pick(allStaffIds) : null,
      }).returning();
      contactNumberIds.push({ id: rows[0].id, userId: null, baId: ba.id });
    }
  }
  console.log(`  ✓ ${contactNumberIds.length} contact numbers`);

  // ── Step 7: Create listings (400) ────────────────────────────────────────

  console.log('Creating listings...');
  const insertedListingIds: number[] = [];
  const listingToBuild: Parameters<typeof db.insert<typeof listings>>['0'] extends { values: infer V } ? never : any[] = [];

  const titlePrefixes: Record<string, string[]> = {
    house: ['Spacious', 'Elegant', 'Modern', 'Charming', 'Beautiful', 'Well-Maintained', 'Renovated', 'Traditional', 'Luxury', 'Cozy'],
    apartment: ['Modern', 'Stylish', 'Bright', 'City-View', 'Furnished', 'Luxury', 'Compact', 'High-Rise', 'Prime', 'Contemporary'],
    room: ['Cozy', 'Furnished', 'Budget', 'Private', 'Sunny', 'Clean', 'Quiet', 'Affordable', 'Spacious', 'Well-Lit'],
  };

  const descTemplates = [
    (br: number, type: string, city: string, features: string) =>
      `Beautiful ${br}-bedroom ${type} located in ${city}. ${features} Ideal for families or professionals looking for a comfortable living space.`,
    (br: number, type: string, city: string, features: string) =>
      `Well-maintained ${br}-bedroom ${type} in prime ${city} area. ${features} Close to schools, hospitals, and shopping centres.`,
    (br: number, type: string, city: string, features: string) =>
      `Stunning ${br}-bedroom ${type} available for rent in ${city}. ${features} Perfect for those who value comfort and convenience.`,
    (br: number, type: string, city: string, features: string) =>
      `This ${br}-bedroom ${type} in ${city} offers excellent value. ${features} Quiet neighbourhood with easy access to public transport.`,
    (br: number, type: string, city: string, features: string) =>
      `Newly refurbished ${br}-bedroom ${type} in ${city}. ${features} Move-in ready with all modern amenities.`,
  ];

  for (let i = 0; i < 400; i++) {
    const loc = pick(locations);
    const propType = pick(propertyTypes);
    const bedrooms = propType === 'room' ? 1 : randInt(1, 5);
    const bathrooms = propType === 'room' ? randInt(0, 1) : randInt(1, Math.max(1, bedrooms));
    const areaSqft = propType === 'room' ? randInt(300, 800) : propType === 'apartment' ? randInt(500, 2500) : randInt(1000, 5000);

    let rent: number;
    if (propType === 'room') rent = randInt(15000, 60000);
    else if (propType === 'apartment') rent = randInt(35000, 250000);
    else rent = randInt(50000, 400000);

    const statusRand = Math.random();
    let status: 'active' | 'pending' | 'archived' | 'rejected' | 'rented' | 'expired';
    if (statusRand < 0.60) status = 'active';
    else if (statusRand < 0.78) status = 'pending';
    else if (statusRand < 0.85) status = 'archived';
    else if (statusRand < 0.90) status = 'rejected';
    else if (statusRand < 0.95) status = 'rented';
    else status = 'expired';

    const isActive = status === 'active';
    const verified = isActive ? Math.random() > 0.15 : false;
    const visited = verified && Math.random() > 0.3;
    const createdDate = daysAgo(randInt(1, 120));
    const publishedAt = isActive ? new Date(createdDate.getTime() + randInt(1, 5) * 86_400_000) : null;
    const expiresAt = publishedAt ? new Date(publishedAt.getTime() + 30 * 86_400_000) : null;

    const hasFiber = Math.random() > 0.35;
    const powerBackup = pick(powerBackupOptions);
    const waterSource = pick(waterSourceOptions);
    const isGated = propType !== 'room' && Math.random() > 0.45;
    const hasGuard = isGated && Math.random() > 0.55;
    const parking = propType !== 'room' && Math.random() > 0.3;

    const featureBits: string[] = [];
    if (hasFiber) featureBits.push('Fiber internet available.');
    if (parking) featureBits.push('Parking included.');
    if (isGated) featureBits.push('Gated community.');
    if (hasGuard) featureBits.push('24/7 security.');

    const prefix = pick(titlePrefixes[propType]);
    const brText = bedrooms === 1 ? '1BR' : `${bedrooms}BR`;
    const title = `${prefix} ${brText} ${propType === 'apartment' ? 'Apartment' : propType === 'house' ? 'House' : 'Room'} in ${loc.city}`;

    const landlordId = pick(landlordIds);
    const isBusinessListing = Math.random() > 0.75 && insertedBusinessAccounts.length > 0;

    listingToBuild.push({
      landlordId,
      title,
      description: pick(descTemplates)(bedrooms, propType, loc.city, featureBits.join(' ')),
      status,
      address: `${randInt(1, 300)} ${pick(streetNames)}, ${loc.city}`,
      city: loc.city,
      district: loc.district,
      latitude: (loc.lat + randFloat(-0.03, 0.03)).toFixed(8),
      longitude: (loc.lng + randFloat(-0.03, 0.03)).toFixed(8),
      propertyType: propType,
      bedrooms,
      bathrooms,
      areaSqft,
      rentPerMonth: rent.toString(),
      depositMonths: randInt(2, 6),
      utilitiesIncluded: Math.random() > 0.7,
      serviceCharge: propType === 'apartment' && Math.random() > 0.4 ? randInt(2000, 15000).toString() : null,
      powerBackup: powerBackup || null,
      waterSource,
      waterTankSize: waterSource.includes('tank') || waterSource.includes('borehole') ? randInt(500, 5000) : null,
      hasFiber,
      fiberISPs: hasFiber ? pick(fiberISPOptions) : null,
      acUnits: randInt(0, bedrooms + 1) || null,
      fans: randInt(1, bedrooms * 3),
      ventilation: pick(ventilationOptions),
      isGated,
      hasGuard,
      hasCCTV: propType !== 'room' && Math.random() > 0.5,
      hasBurglarBars: Math.random() > 0.35,
      parking,
      parkingSpaces: parking ? randInt(1, 3) : null,
      petsAllowed: propType !== 'room' && Math.random() > 0.6,
      noticePeriodDays: pick([30, 30, 30, 45, 60]),
      verified,
      verifiedAt: verified ? new Date(createdDate.getTime() + randInt(1, 3) * 86_400_000) : null,
      verifiedBy: verified ? pick(allStaffIds) : null,
      visited,
      visitedAt: visited ? new Date(createdDate.getTime() + randInt(2, 5) * 86_400_000) : null,
      visitedBy: visited ? pick(opsIds) : null,
      rejectionReason: status === 'rejected' ? pick(rejectionReasons) : null,
      rejectedAt: status === 'rejected' ? new Date(createdDate.getTime() + randInt(1, 5) * 86_400_000) : null,
      rejectedBy: status === 'rejected' ? pick(allStaffIds) : null,
      photos: JSON.stringify(
        Array.from({ length: randInt(1, 6) }, () => pick(propertyPhotos))
      ),
      createdAt: createdDate,
      publishedAt,
      expiresAt,
      createdBy: isBusinessListing ? pick(allStaffIds) : null,
      businessAccountId: isBusinessListing ? pick(insertedBusinessAccounts).id : null,
    });
  }

  for (let i = 0; i < listingToBuild.length; i += batchSize) {
    const batch = listingToBuild.slice(i, i + batchSize);
    const rows = await db.insert(listings).values(batch).returning();
    insertedListingIds.push(...rows.map((r) => r.id));
  }
  console.log(`  ✓ ${insertedListingIds.length} listings`);

  // ── Step 8: Link contact numbers to listings (~150) ──────────────────────

  console.log('Linking contact numbers to listings...');
  let linkCount = 0;
  const linkedPairs = new Set<string>();

  for (let i = 0; i < Math.min(150, insertedListingIds.length); i++) {
    const listingId = insertedListingIds[i];
    const numLinks = randInt(1, 2);
    for (let j = 0; j < numLinks; j++) {
      const cn = pick(contactNumberIds);
      const key = `${listingId}-${cn.id}`;
      if (linkedPairs.has(key)) continue;
      linkedPairs.add(key);

      await db.insert(listingContactNumbers).values({
        listingId,
        contactNumberId: cn.id,
        isNew: Math.random() > 0.7,
        wasChanged: Math.random() > 0.85,
      });
      linkCount++;
    }
  }
  console.log(`  ✓ ${linkCount} listing-contact links`);

  // ── Step 9: Create leads (300) ───────────────────────────────────────────

  console.log('Creating leads...');
  const activeListingIds = insertedListingIds.slice(0, Math.floor(insertedListingIds.length * 0.6));
  const insertedLeadIds: number[] = [];
  const leadsToInsert: any[] = [];

  const leadStatuses: Array<'new' | 'contacted' | 'view_scheduled' | 'no_show' | 'interested' | 'closed_won' | 'closed_lost'> = [
    'new', 'new', 'new', 'contacted', 'contacted', 'view_scheduled', 'view_scheduled',
    'interested', 'interested', 'no_show', 'closed_won', 'closed_lost',
  ];

  for (let i = 0; i < 300; i++) {
    const first = pick(firstNames);
    const last = pick(lastNames);
    const created = daysAgo(randInt(0, 90));
    const prefDate = futureDate(created, 14);

    leadsToInsert.push({
      listingId: pick(activeListingIds),
      tenantName: `${first} ${last}`,
      tenantEmail: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}${randInt(1, 999)}@gmail.com`,
      tenantPhone: sriLankanPhone(),
      preferredDate: prefDate,
      preferredTime: pick(['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', 'Weekend morning', 'Weekend afternoon']),
      notes: pick(leadNotes) || null,
      status: pick(leadStatuses),
      assignedTo: Math.random() > 0.4 ? pick(allStaffIds) : null,
      createdAt: created,
    });
  }

  for (let i = 0; i < leadsToInsert.length; i += batchSize) {
    const batch = leadsToInsert.slice(i, i + batchSize);
    const rows = await db.insert(leads).values(batch).returning();
    insertedLeadIds.push(...rows.map((r) => r.id));
  }
  console.log(`  ✓ ${insertedLeadIds.length} leads`);

  // ── Step 10: Create viewings (150) ───────────────────────────────────────

  console.log('Creating viewings...');
  const viewScheduledLeadIds = insertedLeadIds.filter((_, i) =>
    ['view_scheduled', 'interested', 'closed_won', 'no_show'].includes(leadsToInsert[i]?.status)
  );
  let viewingCount = 0;
  const viewingsToInsert: any[] = [];

  for (let i = 0; i < 150; i++) {
    const leadIdx = i < viewScheduledLeadIds.length ? viewScheduledLeadIds[i] : pick(insertedLeadIds);
    const origLead = leadsToInsert[insertedLeadIds.indexOf(leadIdx)] || leadsToInsert[0];
    const listingId = origLead.listingId;
    const scheduled = futureDate(origLead.createdAt || daysAgo(30), 14);
    const isPast = scheduled < new Date();

    viewingsToInsert.push({
      leadId: leadIdx,
      listingId,
      scheduledAt: scheduled,
      confirmedByLandlord: Math.random() > 0.3,
      confirmedByTenant: Math.random() > 0.2,
      notes: pick(viewingNotes) || null,
      outcome: isPast ? pick(viewingOutcomes) : null,
      createdAt: new Date(scheduled.getTime() - randInt(1, 5) * 86_400_000),
    });
  }

  for (let i = 0; i < viewingsToInsert.length; i += batchSize) {
    const batch = viewingsToInsert.slice(i, i + batchSize);
    await db.insert(viewings).values(batch);
    viewingCount += batch.length;
  }
  console.log(`  ✓ ${viewingCount} viewings`);

  // ── Step 11: Saved searches (50) ─────────────────────────────────────────

  console.log('Creating saved searches...');
  const allTenantIds = [...tenantIds];
  const savedSearchToInsert: any[] = [];

  for (let i = 0; i < 50; i++) {
    const uid = pick(allTenantIds);
    const loc = pick(locations);
    savedSearchToInsert.push({
      userId: uid,
      name: pick(savedSearchNames),
      searchParams: JSON.stringify({
        city: loc.city,
        district: loc.district,
        minPrice: randInt(20000, 60000),
        maxPrice: randInt(80000, 300000),
        bedrooms: randInt(1, 4),
        propertyType: pick(propertyTypes),
      }),
      emailAlerts: Math.random() > 0.3,
      whatsappAlerts: Math.random() > 0.7,
      createdAt: daysAgo(randInt(1, 60)),
    });
  }

  for (let i = 0; i < savedSearchToInsert.length; i += batchSize) {
    const batch = savedSearchToInsert.slice(i, i + batchSize);
    await db.insert(savedSearches).values(batch);
  }
  console.log(`  ✓ ${savedSearchToInsert.length} saved searches`);

  // ── Step 12: Audit logs (100) ────────────────────────────────────────────

  console.log('Creating audit logs...');
  const auditActions = [
    { action: 'listing_created' as const, entityType: 'listing' },
    { action: 'listing_updated' as const, entityType: 'listing' },
    { action: 'listing_approved' as const, entityType: 'listing' },
    { action: 'listing_rejected' as const, entityType: 'listing' },
    { action: 'listing_archived' as const, entityType: 'listing' },
    { action: 'lead_created' as const, entityType: 'lead' },
    { action: 'lead_status_changed' as const, entityType: 'lead' },
    { action: 'viewing_scheduled' as const, entityType: 'viewing' },
    { action: 'viewing_outcome' as const, entityType: 'viewing' },
    { action: 'user_created' as const, entityType: 'user' },
    { action: 'business_account_created' as const, entityType: 'business_account' },
    { action: 'member_added' as const, entityType: 'business_account_member' },
    { action: 'contact_verified' as const, entityType: 'contact_number' },
    { action: 'kyc_verified' as const, entityType: 'landlord' },
    { action: 'property_visited' as const, entityType: 'listing' },
    { action: 'data_exported' as const, entityType: 'export' },
  ];
  const auditLogsToInsert: any[] = [];

  for (let i = 0; i < 100; i++) {
    const auditDef = pick(auditActions);
    let entityId: number | null = null;
    if (auditDef.entityType === 'listing') entityId = pick(insertedListingIds);
    else if (auditDef.entityType === 'lead') entityId = pick(insertedLeadIds);
    else if (auditDef.entityType === 'user') entityId = pick(insertedUserIds);

    auditLogsToInsert.push({
      action: auditDef.action,
      entityType: auditDef.entityType,
      entityId,
      userId: pick(allStaffIds),
      metadata: JSON.stringify({ source: 'seed', note: `Sample audit log #${i + 1}` }),
      ipAddress: `192.168.${randInt(1, 255)}.${randInt(1, 255)}`,
      createdAt: daysAgo(randInt(0, 90)),
    });
  }

  for (let i = 0; i < auditLogsToInsert.length; i += batchSize) {
    const batch = auditLogsToInsert.slice(i, i + batchSize);
    await db.insert(auditLogs).values(batch);
  }
  console.log(`  ✓ ${auditLogsToInsert.length} audit logs`);

  // ── Summary ──────────────────────────────────────────────────────────────

  const total =
    insertedUserIds.length +
    landlordRecords.length +
    insertedBusinessAccounts.length +
    memberCount +
    contactNumberIds.length +
    insertedListingIds.length +
    linkCount +
    insertedLeadIds.length +
    viewingCount +
    savedSearchToInsert.length +
    auditLogsToInsert.length;

  console.log('\n════════════════════════════════════════════════');
  console.log('  SEED COMPLETE — Record Summary');
  console.log('════════════════════════════════════════════════');
  console.log(`  Users:                  ${insertedUserIds.length}`);
  console.log(`  Landlords:              ${landlordRecords.length}`);
  console.log(`  Business Accounts:      ${insertedBusinessAccounts.length}`);
  console.log(`  Business Members:       ${memberCount}`);
  console.log(`  Contact Numbers:        ${contactNumberIds.length}`);
  console.log(`  Listings:               ${insertedListingIds.length}`);
  console.log(`  Listing-Contact Links:  ${linkCount}`);
  console.log(`  Leads:                  ${insertedLeadIds.length}`);
  console.log(`  Viewings:               ${viewingCount}`);
  console.log(`  Saved Searches:         ${savedSearchToInsert.length}`);
  console.log(`  Audit Logs:             ${auditLogsToInsert.length}`);
  console.log('────────────────────────────────────────────────');
  console.log(`  TOTAL:                  ${total}`);
  console.log('════════════════════════════════════════════════\n');
}

seedSampleData()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
