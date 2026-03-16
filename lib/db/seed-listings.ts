import { db } from './drizzle';
import { listings, landlords, users } from './schema';
import { eq } from 'drizzle-orm';

// Sri Lankan cities and districts
const cities = [
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
];

const propertyTypes = ['house', 'apartment', 'room'] as const;
const powerBackupOptions = ['generator', 'solar', 'ups', ''] as const;
const waterSourceOptions = ['mains', 'tank', 'borehole', 'mains_tank', 'mains_borehole'] as const;
const ventilationOptions = ['excellent', 'good', 'fair', 'poor'] as const;
const fiberISPOptions = ['SLT', 'Dialog', 'Mobitel', 'SLT, Dialog', 'Dialog, Mobitel', 'SLT, Dialog, Mobitel'] as const;

// Property photo URLs from Unsplash
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
];

function randomElement<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateListing(index: number, landlordId: number, adminUserId: number, opsUserId: number) {
  const location = randomElement(cities);
  const propertyType = randomElement(propertyTypes);
  const bedrooms = propertyType === 'room' ? 1 : randomInt(1, 5);
  const bathrooms = propertyType === 'room' ? randomInt(0, 1) : randomInt(1, bedrooms);
  const areaSqft = propertyType === 'room' 
    ? randomInt(400, 800) 
    : propertyType === 'apartment'
    ? randomInt(600, 2000)
    : randomInt(1500, 4000);
  
  // Price based on property type and size
  let baseRent = 0;
  if (propertyType === 'room') {
    baseRent = randomInt(30000, 60000);
  } else if (propertyType === 'apartment') {
    baseRent = randomInt(50000, 150000);
  } else {
    baseRent = randomInt(80000, 300000);
  }
  
  const rentPerMonth = baseRent.toString();
  const depositMonths = randomInt(2, 6);
  const serviceCharge = propertyType === 'apartment' && Math.random() > 0.3 
    ? (randomInt(3000, 15000)).toString() 
    : null;
  
  const powerBackup = randomElement(powerBackupOptions);
  const waterSource = randomElement(waterSourceOptions);
  const waterTankSize = waterSource.includes('tank') ? randomInt(500, 3000) : null;
  const hasFiber = Math.random() > 0.4;
  const fiberISPs = hasFiber ? randomElement(fiberISPOptions) : null;
  
  const acUnits = randomInt(0, bedrooms + 2);
  const fans = randomInt(2, bedrooms * 3);
  const ventilation = randomElement(ventilationOptions);
  
  const isGated = propertyType !== 'room' && Math.random() > 0.5;
  const hasGuard = isGated && Math.random() > 0.6;
  const hasCCTV = propertyType !== 'room' && Math.random() > 0.5;
  const hasBurglarBars = Math.random() > 0.3;
  
  const parking = propertyType !== 'room' && Math.random() > 0.3;
  const parkingSpaces = parking ? randomInt(1, 3) : null;
  const petsAllowed = propertyType !== 'room' && Math.random() > 0.6;
  
  // Status distribution: 70% active, 20% pending, 10% other
  const statusRand = Math.random();
  let status: 'active' | 'pending' | 'archived' | 'rejected' = 'pending';
  let publishedAt: Date | null = null;
  let expiresAt: Date | null = null;
  let verified = false;
  let verifiedAt: Date | null = null;
  let verifiedBy: number | null = null;
  let visited = false;
  let visitedAt: Date | null = null;
  let visitedBy: number | null = null;
  
  if (statusRand < 0.7) {
    status = 'active';
    verified = true;
    visited = Math.random() > 0.3;
    publishedAt = new Date(Date.now() - randomInt(0, 6) * 24 * 60 * 60 * 1000);
    expiresAt = new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    verifiedAt = new Date(publishedAt.getTime() - randomInt(1, 3) * 24 * 60 * 60 * 1000);
    verifiedBy = adminUserId;
    if (visited) {
      visitedAt = new Date(publishedAt.getTime() - randomInt(1, 2) * 24 * 60 * 60 * 1000);
      visitedBy = opsUserId;
    }
  } else if (statusRand < 0.9) {
    status = 'pending';
  } else if (statusRand < 0.95) {
    status = 'archived';
  } else {
    status = 'rejected';
  }
  
  // Generate title
  const propertyTypeName = propertyType === 'apartment' ? 'Apartment' : propertyType === 'house' ? 'House' : 'Room';
  const bedroomText = bedrooms === 1 ? '1BR' : `${bedrooms}BR`;
  const title = `${propertyTypeName} ${bedroomText} in ${location.city}`;
  
  // Generate description
  const descriptions = [
    `Beautiful ${bedrooms}-bedroom ${propertyType} in ${location.city}. ${propertyType === 'house' ? 'Spacious property with garden. ' : propertyType === 'apartment' ? 'Modern apartment with great amenities. ' : 'Cozy room perfect for students or professionals. '}Close to schools, hospitals, and shopping centers.`,
    `Well-maintained ${bedrooms}-bedroom ${propertyType} located in ${location.city}. ${parking ? 'Parking available. ' : ''}${hasFiber ? 'Fiber internet ready. ' : ''}Ideal for ${propertyType === 'room' ? 'students or young professionals' : 'families or professionals'}.`,
    `Stunning ${bedrooms}-bedroom ${propertyType} in prime ${location.city} location. ${isGated ? 'Gated community. ' : ''}${hasGuard ? '24/7 security. ' : ''}All modern amenities included.`,
  ];
  const description = randomElement(descriptions);
  
  // Generate address
  const streetNumbers = ['123', '456', '789', '12', '34', '56', '78', '90', '100', '200'];
  const streetNames = ['Galle Road', 'High Level Road', 'Main Street', 'Church Street', 'Temple Road', 'School Lane', 'Hospital Road', 'Market Street'];
  const address = `${randomElement(streetNumbers)} ${randomElement(streetNames)}, ${location.city}`;
  
  // Select random photos
  const numPhotos = randomInt(1, 6);
  const selectedPhotos = [];
  const shuffledPhotos = [...propertyPhotos].sort(() => Math.random() - 0.5);
  for (let i = 0; i < numPhotos; i++) {
    selectedPhotos.push(shuffledPhotos[i % shuffledPhotos.length]);
  }
  
  return {
    landlordId,
    title,
    description,
    status,
    address,
    city: location.city,
    district: location.district,
    latitude: (location.lat + randomFloat(-0.05, 0.05)).toFixed(8),
    longitude: (location.lng + randomFloat(-0.05, 0.05)).toFixed(8),
    propertyType,
    bedrooms,
    bathrooms,
    areaSqft: propertyType !== 'room' ? areaSqft : null,
    rentPerMonth,
    depositMonths,
    utilitiesIncluded: Math.random() > 0.7,
    serviceCharge,
    powerBackup: powerBackup || null,
    waterSource: waterSource || null,
    waterTankSize,
    hasFiber,
    fiberISPs,
    acUnits: acUnits > 0 ? acUnits : null,
    fans: fans > 0 ? fans : null,
    ventilation: ventilation || null,
    isGated,
    hasGuard,
    hasCCTV,
    hasBurglarBars,
    parking,
    parkingSpaces,
    petsAllowed,
    noticePeriodDays: randomInt(30, 60),
    verified,
    verifiedAt,
    verifiedBy,
    visited,
    visitedAt,
    visitedBy,
    photos: JSON.stringify(selectedPhotos),
    publishedAt,
    expiresAt,
    createdAt: new Date(Date.now() - randomInt(0, 30) * 24 * 60 * 60 * 1000),
  };
}

async function seedListings() {
  console.log('Starting to seed 100 property listings...');

  // Get or create a landlord
  let landlordUser = await db.query.users.findFirst({
    where: eq(users.email, 'landlord@test.com'),
  });

  if (!landlordUser) {
    console.log('Landlord user not found. Please run the main seed script first.');
    process.exit(1);
  }

  let landlord = await db.query.landlords.findFirst({
    where: eq(landlords.userId, landlordUser.id),
  });

  if (!landlord) {
    console.log('Landlord record not found. Please run the main seed script first.');
    process.exit(1);
  }

  // Get admin and ops users for verification
  const adminUser = await db.query.users.findFirst({
    where: eq(users.email, 'admin@easyrent.com'),
  });

  const opsUser = await db.query.users.findFirst({
    where: eq(users.email, 'ops@easyrent.com'),
  });

  if (!adminUser || !opsUser) {
    console.log('Admin or Ops user not found. Please run the main seed script first.');
    process.exit(1);
  }

  // Generate 100 listings
  const listingsToInsert = [];
  for (let i = 0; i < 100; i++) {
    listingsToInsert.push(
      generateListing(i, landlord.id, adminUser.id, opsUser.id)
    );
  }

  // Insert in batches of 20
  const batchSize = 20;
  for (let i = 0; i < listingsToInsert.length; i += batchSize) {
    const batch = listingsToInsert.slice(i, i + batchSize);
    await db.insert(listings).values(batch);
    console.log(`Inserted listings ${i + 1} to ${Math.min(i + batchSize, listingsToInsert.length)}`);
  }

  console.log(`✅ Successfully created ${listingsToInsert.length} property listings!`);
  
  // Count by status
  const activeCount = listingsToInsert.filter(l => l.status === 'active').length;
  const pendingCount = listingsToInsert.filter(l => l.status === 'pending').length;
  const archivedCount = listingsToInsert.filter(l => l.status === 'archived').length;
  const rejectedCount = listingsToInsert.filter(l => l.status === 'rejected').length;
  
  console.log(`\nStatus breakdown:`);
  console.log(`  Active: ${activeCount}`);
  console.log(`  Pending: ${pendingCount}`);
  console.log(`  Archived: ${archivedCount}`);
  console.log(`  Rejected: ${rejectedCount}`);
}

seedListings()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('\nSeed process finished. Exiting...');
    process.exit(0);
  });

