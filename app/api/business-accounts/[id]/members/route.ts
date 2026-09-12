import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, users, businessAccounts } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and, isNull } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const businessAccountId = Number(resolvedParams.id);

    // Every other dynamic route validates this; these two did not. `Number('x')`
    // is NaN, which reaches Drizzle and fails as a 500 rather than a 400.
    if (isNaN(businessAccountId) || businessAccountId <= 0) {
      return NextResponse.json({ error: 'Invalid business account ID' }, { status: 400 });
    }

    // Global admin/ops, OR an active owner/admin member of THIS account —
    // a plain 'member' cannot invite. Closes STATUS.md's "member.role
    // carries no differentiated permissions" gap for team management.
    if (user.role !== 'admin' && user.role !== 'ops') {
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.businessAccountId, businessAccountId),
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.isActive, true)
        ),
      });
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { role = 'member' } = body;
    let { userId } = body;

    // Self-serve callers send `email`, not `userId` — before this, the
    // self-serve invite form called GET /api/user?email= to resolve it
    // client-side, which is admin/ops-only (it returns phone/waPhone/
    // subscription data) and made every self-serve invite fail with
    // "User not found" for a caller who is neither. The lookup now happens
    // HERE, server-side, with only existence exposed to the caller — never
    // the target user's PII.
    if (!userId && typeof body.email === 'string' && isFeatureEnabled('enableSelfServeBusinessAccounts')) {
      // Same eq()+isNull(deletedAt) match as GET /api/user?email= — no
      // lowercasing, matching that route's existing (pre-broker-pivot)
      // behavior exactly rather than introducing new normalization.
      const byEmail = await db.query.users.findFirst({
        where: and(eq(users.email, body.email.trim()), isNull(users.deletedAt)),
      });
      if (!byEmail) {
        return NextResponse.json(
          { error: 'User not found. They need an Easy Rent account first.' },
          { status: 404 }
        );
      }
      userId = byEmail.id;
    }

    if (!userId || typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json(
        { error: 'A valid user ID is required' },
        { status: 400 }
      );
    }

    // `role` was written straight through from the body. It drives
    // business-account-scoped permissions, so it must be one of the three the
    // rest of the app understands — not an arbitrary string.
    if (!['owner', 'admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be one of: owner, admin, member' },
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
