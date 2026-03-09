import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { leads, listings } from '@/lib/db/schema';
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

  const allLeads = await db
    .select({
      id: leads.id,
      tenantName: leads.tenantName,
      tenantEmail: leads.tenantEmail,
      tenantPhone: leads.tenantPhone,
      preferredDate: leads.preferredDate,
      preferredTime: leads.preferredTime,
      notes: leads.notes,
      status: leads.status,
      createdAt: leads.createdAt,
      listingId: leads.listingId,
      listingTitle: listings.title,
      listingCity: listings.city,
    })
    .from(leads)
    .leftJoin(listings, eq(leads.listingId, listings.id))
    .orderBy(desc(leads.createdAt));

  const headers = [
    'ID', 'Tenant Name', 'Tenant Email', 'Tenant Phone',
    'Preferred Date', 'Preferred Time', 'Notes', 'Status',
    'Created At', 'Listing ID', 'Listing Title', 'Listing City',
  ];

  const rows = allLeads.map((l) => [
    l.id,
    `"${(l.tenantName || '').replace(/"/g, '""')}"`,
    l.tenantEmail,
    l.tenantPhone,
    l.preferredDate ? new Date(l.preferredDate).toISOString().split('T')[0] : '',
    l.preferredTime ?? '',
    `"${(l.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    l.status,
    l.createdAt ? new Date(l.createdAt).toISOString() : '',
    l.listingId,
    `"${(l.listingTitle || '').replace(/"/g, '""')}"`,
    l.listingCity ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  await logAudit({
    action: 'data_exported',
    entityType: 'lead',
    userId: user.id,
    metadata: { count: allLeads.length, format: 'csv' },
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
