import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, businessAccountMembers, users } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';

export async function POST(request: NextRequest) {
  try {
    await loadFeatureFlags();
    const user = await getUser();
    const isAdminOrOps = user && (user.role === 'admin' || user.role === 'ops');
    const selfServeAllowed = isFeatureEnabled('enableSelfServeBusinessAccounts');

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminOrOps && !selfServeAllowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, phone, address } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Self-serve creator becomes the account's owner. businessAccountMembers
    // enforces one account per user (userId is unique), so this also fails
    // cleanly for someone who already belongs to one — no separate check
    // needed, the insert below reports it.
    if (!isAdminOrOps) {
      const existingMembership = await db.query.businessAccountMembers.findFirst({
        where: eq(businessAccountMembers.userId, user.id),
      });
      if (existingMembership) {
        return NextResponse.json(
          { error: 'You already belong to a business account' },
          { status: 400 }
        );
      }
    }

    // Check if email already exists
    const existing = await db.query.businessAccounts.findFirst({
      where: eq(businessAccounts.email, email),
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Business account with this email already exists' },
        { status: 400 }
      );
    }

    const [newAccount] = await db
      .insert(businessAccounts)
      .values({
        name,
        email,
        phone: phone || null,
        address: address || null,
        createdBy: user.id,
        status: 'active',
      })
      .returning();

    // Self-serve creation makes the creator the owner immediately — an
    // admin-created account (isAdminOrOps path) does NOT auto-add the admin
    // as a member, matching the existing back-office flow where ops invites
    // members separately.
    if (!isAdminOrOps) {
      await db.insert(businessAccountMembers).values({
        businessAccountId: newAccount.id,
        userId: user.id,
        role: 'owner',
        isActive: true,
      });
      // Auto-upgrade tenant to landlord, same rule as first-listing creation
      // in app/api/listings/route.ts — a business account with no landlord
      // capability behind it can't do anything useful.
      if (user.role === 'tenant') {
        await db
          .update(users)
          .set({ role: 'landlord', updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }
    }

    return NextResponse.json(
      { success: true, businessAccount: newAccount },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating business account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create business account' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await db.select().from(businessAccounts);

    return NextResponse.json({ success: true, businessAccounts: accounts });
  } catch (error: any) {
    console.error('Error fetching business accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch business accounts' },
      { status: 500 }
    );
  }
}
