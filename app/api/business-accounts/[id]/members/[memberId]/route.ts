import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, businessAccounts } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> | { id: string; memberId: string } }
) {
  try {
    const user = await getUser();
    if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const businessAccountId = Number(resolvedParams.id);
    const memberId = Number(resolvedParams.memberId);

    if (isNaN(businessAccountId) || businessAccountId <= 0) {
      return NextResponse.json(
        { error: 'Invalid business account ID' },
        { status: 400 }
      );
    }

    if (isNaN(memberId) || memberId <= 0) {
      return NextResponse.json(
        { error: 'Invalid member ID' },
        { status: 400 }
      );
    }

    // Verify business account exists
    const account = await db.query.businessAccounts.findFirst({
      where: eq(businessAccounts.id, businessAccountId),
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Business account not found' },
        { status: 404 }
      );
    }

    // Verify member exists and belongs to this business account
    const member = await db.query.businessAccountMembers.findFirst({
      where: and(
        eq(businessAccountMembers.id, memberId),
        eq(businessAccountMembers.businessAccountId, businessAccountId)
      ),
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Team member not found' },
        { status: 404 }
      );
    }

    // Delete the member
    await db
      .delete(businessAccountMembers)
      .where(eq(businessAccountMembers.id, memberId));

    return NextResponse.json(
      { success: true, message: 'Team member removed successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove team member' },
      { status: 500 }
    );
  }
}

