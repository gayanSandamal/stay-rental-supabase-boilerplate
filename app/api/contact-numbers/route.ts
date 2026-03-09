import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { userContactNumbers, businessAccountMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and, or } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business account membership if any
    const businessMembership = await db.query.businessAccountMembers.findFirst({
      where: and(
        eq(businessAccountMembers.userId, user.id),
        eq(businessAccountMembers.isActive, true)
      ),
    });

    // Fetch contact numbers for user and/or business account
    const contactNumbers = await db.query.userContactNumbers.findMany({
      where: or(
        eq(userContactNumbers.userId, user.id),
        businessMembership
          ? eq(userContactNumbers.businessAccountId, businessMembership.businessAccountId)
          : undefined
      ),
      orderBy: (contactNumbers, { desc }) => [desc(contactNumbers.createdAt)],
    });

    return NextResponse.json({ contactNumbers }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching contact numbers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch contact numbers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { phoneNumber, isWhatsApp, label, businessAccountId } = body;

    if (!phoneNumber || !phoneNumber.trim()) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Validate that either userId or businessAccountId is provided, but not both
    let finalUserId: number | null = null;
    let finalBusinessAccountId: number | null = null;

    if (businessAccountId) {
      // Verify user is a member of this business account
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.businessAccountId, businessAccountId),
          eq(businessAccountMembers.isActive, true)
        ),
      });

      if (!membership) {
        return NextResponse.json(
          { error: 'Unauthorized: Not a member of this business account' },
          { status: 403 }
        );
      }

      finalBusinessAccountId = businessAccountId;
    } else {
      finalUserId = user.id;
    }

    // Check for duplicate phone number
    const existing = await db.query.userContactNumbers.findFirst({
      where: and(
        finalUserId ? eq(userContactNumbers.userId, finalUserId) : undefined,
        finalBusinessAccountId
          ? eq(userContactNumbers.businessAccountId, finalBusinessAccountId)
          : undefined,
        eq(userContactNumbers.phoneNumber, phoneNumber.trim())
      ),
    });

    if (existing) {
      return NextResponse.json(
        { error: 'This phone number already exists' },
        { status: 400 }
      );
    }

    const [newContactNumber] = await db
      .insert(userContactNumbers)
      .values({
        userId: finalUserId,
        businessAccountId: finalBusinessAccountId,
        phoneNumber: phoneNumber.trim(),
        isWhatsApp: Boolean(isWhatsApp),
        label: label?.trim() || null,
        isActive: true,
      })
      .returning();

    return NextResponse.json(
      { success: true, contactNumber: newContactNumber },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating contact number:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create contact number' },
      { status: 500 }
    );
  }
}

