import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { viewings, leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getLeadById, getUser } from '@/lib/db/queries';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { leadId, scheduledAt, notes } = body;

    if (!leadId || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, scheduledAt' },
        { status: 400 }
      );
    }

    const lead = await getLeadById(Number(leadId));
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const scheduled = new Date(scheduledAt);
    if (isNaN(scheduled.getTime())) {
      return NextResponse.json(
        { error: 'Invalid scheduledAt date' },
        { status: 400 }
      );
    }

    const [newViewing] = await db
      .insert(viewings)
      .values({
        leadId: lead.id,
        listingId: lead.listingId,
        scheduledAt: scheduled,
        notes: notes || null,
        confirmedByLandlord: false,
        confirmedByTenant: false,
      })
      .returning();

    // Update lead status to view_scheduled
    await db
      .update(leads)
      .set({ status: 'view_scheduled', updatedAt: new Date() })
      .where(eq(leads.id, lead.id));

    return NextResponse.json(
      { success: true, viewing: newViewing },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating viewing:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create viewing' },
      { status: 500 }
    );
  }
}
