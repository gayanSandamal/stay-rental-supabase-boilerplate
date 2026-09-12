import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { brokerLeads, businessAccountMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { eq, and } from 'drizzle-orm';

/**
 * Claiming reveals the renter's contact details (only returned to the
 * claimant, not in the open GET /api/leads list) and moves the lead out of
 * rotation — first claim wins, no un-claim. Simple enough to be wrong at
 * scale, which is fine: FORGE.md is explicit this concept ships to learn
 * whether there's any scale to be wrong at.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await loadFeatureFlags();
    if (!isFeatureEnabled('enableLeadRouting')) {
      return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.query.businessAccountMembers.findFirst({
      where: and(
        eq(businessAccountMembers.userId, user.id),
        eq(businessAccountMembers.isActive, true)
      ),
    });
    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
    if (!membership && !isAdminOrOps) {
      return NextResponse.json(
        { error: 'Only business-account members can claim leads' },
        { status: 403 }
      );
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const leadId = Number(resolvedParams.id);
    if (isNaN(leadId) || leadId <= 0) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
    }

    // Guard the transition in the WHERE clause, not just an if-check — two
    // simultaneous claims otherwise both "succeed" against a status read
    // moments apart. Only 'open' -> 'claimed' via this single UPDATE can win.
    const [claimed] = await db
      .update(brokerLeads)
      .set({
        status: 'claimed',
        claimedByBusinessAccountId: membership?.businessAccountId ?? null,
        claimedAt: new Date(),
      })
      .where(and(eq(brokerLeads.id, leadId), eq(brokerLeads.status, 'open')))
      .returning();

    if (!claimed) {
      return NextResponse.json(
        { error: 'Lead not found or already claimed' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, lead: claimed });
  } catch (error: any) {
    console.error('Error claiming lead:', error);
    return NextResponse.json({ error: 'Failed to claim lead' }, { status: 500 });
  }
}
