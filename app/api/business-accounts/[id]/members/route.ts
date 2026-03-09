import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, users, businessAccounts } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const businessAccountId = Number(resolvedParams.id);

    const body = await request.json();
    const { userId, role = 'member' } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Verify user exists
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const existingMember = await db.query.businessAccountMembers.findFirst({
      where: eq(businessAccountMembers.userId, userId),
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of a business account' },
        { status: 400 }
      );
    }

    const [newMember] = await db
      .insert(businessAccountMembers)
      .values({
        businessAccountId,
        userId,
        role,
        isActive: true,
      })
      .returning();

    return NextResponse.json(
      { success: true, member: newMember },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error adding team member:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add team member' },
      { status: 500 }
    );
  }
}
