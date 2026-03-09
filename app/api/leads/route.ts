import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { leads } from '@/lib/db/schema';
import { getListingById } from '@/lib/db/queries';
import { logLeadAction } from '@/lib/db/audit-logger';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { sendLeadConfirmationToTenant, sendLeadNotificationToOps } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip, 'POST', '/api/leads');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const body = await request.json();
    const {
      listingId,
      tenantName,
      tenantEmail,
      tenantPhone,
      preferredDate,
      preferredTime,
      notes,
    } = body;

    // Validate required fields
    if (!listingId || !tenantName || !tenantEmail || !tenantPhone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify listing exists and is active
    const listing = await getListingById(listingId);
    if (!listing || listing.status !== 'active') {
      return NextResponse.json(
        { error: 'Listing not found or not available' },
        { status: 404 }
      );
    }

    // Create lead
    const [newLead] = await db
      .insert(leads)
      .values({
        listingId,
        tenantName,
        tenantEmail,
        tenantPhone,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        preferredTime: preferredTime || null,
        notes: notes || null,
        status: 'new',
      })
      .returning();

    await logLeadAction('lead_created', newLead.id, undefined, {
      listingId,
      tenantEmail,
      tenantName,
    });

    // Send automated emails (non-blocking)
    sendLeadConfirmationToTenant(
      tenantName,
      tenantEmail,
      listing.title,
      listingId
    ).catch(() => {});

    sendLeadNotificationToOps(
      tenantName,
      tenantEmail,
      tenantPhone,
      listing.title,
      listingId,
      preferredDate ? new Date(preferredDate).toLocaleDateString() : undefined,
      preferredTime
    ).catch(() => {});

    return NextResponse.json(
      { success: true, lead: newLead },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating lead:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create lead' },
      { status: 500 }
    );
  }
}

