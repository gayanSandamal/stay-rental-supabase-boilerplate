import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings, landlords, users } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, desc } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { logAudit } from '@/lib/db/audit-logger';

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled('enableDataExport')) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }

  const user = await getUser();
  if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allListings = await db
    .select({
      id: listings.id,
      title: listings.title,
      status: listings.status,
      address: listings.address,
      city: listings.city,
      district: listings.district,
      propertyType: listings.propertyType,
      bedrooms: listings.bedrooms,
      bathrooms: listings.bathrooms,
      areaSqft: listings.areaSqft,
      rentPerMonth: listings.rentPerMonth,
      depositMonths: listings.depositMonths,
      verified: listings.verified,
      visited: listings.visited,
      createdAt: listings.createdAt,
      publishedAt: listings.publishedAt,
      expiresAt: listings.expiresAt,
      landlordName: users.name,
      landlordEmail: users.email,
    })
    .from(listings)
    .leftJoin(landlords, eq(listings.landlordId, landlords.id))
    .leftJoin(users, eq(landlords.userId, users.id))
    .orderBy(desc(listings.createdAt));

  const headers = [
    'ID', 'Title', 'Status', 'Address', 'City', 'District', 'Type',
    'Bedrooms', 'Bathrooms', 'Area (sqft)', 'Rent/Month (LKR)', 'Deposit (months)',
    'Verified', 'Visited', 'Created At', 'Published At', 'Expires At',
    'Landlord Name', 'Landlord Email',
  ];

  const rows = allListings.map((l) => [
    l.id,
    `"${(l.title || '').replace(/"/g, '""')}"`,
    l.status,
    `"${(l.address || '').replace(/"/g, '""')}"`,
    l.city,
    l.district ?? '',
    l.propertyType ?? '',
    l.bedrooms,
    l.bathrooms ?? '',
    l.areaSqft ?? '',
    l.rentPerMonth,
    l.depositMonths ?? '',
    l.verified ? 'Yes' : 'No',
    l.visited ? 'Yes' : 'No',
    l.createdAt ? new Date(l.createdAt).toISOString() : '',
    l.publishedAt ? new Date(l.publishedAt).toISOString() : '',
    l.expiresAt ? new Date(l.expiresAt).toISOString() : '',
    `"${(l.landlordName || '').replace(/"/g, '""')}"`,
    l.landlordEmail ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  await logAudit({
    action: 'data_exported',
    entityType: 'listing',
    userId: user.id,
    metadata: { count: allListings.length, format: 'csv' },
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="listings-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
