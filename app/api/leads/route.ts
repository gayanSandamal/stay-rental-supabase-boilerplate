import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { brokerLeads, businessAccountMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Broker lead routing (FORGE.md Concept 3 — explicitly the least-validated
 * of the three broker-pivot concepts: no SL data exists on lead value or
 * broker willingness to pay). A renter states a requirement once; any
 * business-account member can browse and claim it. No WhatsApp push —
 * that needs an approved Meta template this pass cannot register — so
 * distribution is "brokers check the list," not "brokers get pinged."
 */
export async function POST(request: NextRequest) {
  try {
    await loadFeatureFlags();
    if (!isFeatureEnabled('enableLeadRouting')) {
      return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    const ip = getClientIp(request);
    const rl = checkRateLimit(ip, 'POST', '/api/leads');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const body = await request.json();
    const { city, district, bedrooms, budgetMin, budgetMax, notes, contactPhone, contactName } =
      body;

    if (!city || typeof city !== 'string') {
      return NextResponse.json({ error: 'City is required' }, { status: 400 });
    }
    if (!contactPhone || typeof contactPhone !== 'string' || contactPhone.trim().length < 7) {
      return NextResponse.json({ error: 'A valid contact phone is required' }, { status: 400 });
    }

    const [lead] = await db
      .insert(brokerLeads)
      .values({
        city: city.trim(),
        district: typeof district === 'string' ? district.trim() || null : null,
        bedrooms: Number.isInteger(bedrooms) ? bedrooms : null,
        budgetMin: Number.isInteger(budgetMin) ? budgetMin : null,
        budgetMax: Number.isInteger(budgetMax) ? budgetMax : null,
        notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) || null : null,
        contactPhone: contactPhone.trim(),
        contactName: typeof contactName === 'string' ? contactName.trim() || null : null,
      })
      .returning();

    return NextResponse.json({ success: true, lead: { id: lead.id } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
}

/**
 * Broker-facing list. Any active member of any business account can browse
 * open leads — deliberately not scoped to "your city's leads only" yet,
 * since with zero real leads there's nothing to prioritise; narrow this once
 * real volume exists.
 */
export async function GET(request: NextRequest) {
  try {
    await loadFeatureFlags();
    if (!isFeatureEnabled('enableLeadRouting')) {
      return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
    if (!isAdminOrOps) {
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.isActive, true)
        ),
      });
      if (!membership) {
        return NextResponse.json(
          { error: 'Only business-account members can view leads' },
          { status: 403 }
        );
      }
    }

    const openLeads = await db
      .select()
      .from(brokerLeads)
      .where(eq(brokerLeads.status, 'open'))
      .orderBy(desc(brokerLeads.createdAt))
      .limit(50);

    return NextResponse.json({ success: true, leads: openLeads });
  } catch (error: any) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
