import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { userContactNumbers, businessAccountMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const contactNumberId = Number(resolvedParams.id);

    if (isNaN(contactNumberId) || contactNumberId <= 0) {
      return NextResponse.json({ error: 'Invalid contact number ID' }, { status: 400 });
    }

    const body = await request.json();
    const { phoneNumber, isWhatsApp, label, isActive } = body;

    // Verify contact number exists and belongs to user or their business account
    const contactNumber = await db.query.userContactNumbers.findFirst({
      where: eq(userContactNumbers.id, contactNumberId),
    });

    if (!contactNumber) {
      return NextResponse.json(
        { error: 'Contact number not found' },
        { status: 404 }
      );
    }

    // Check ownership
    let hasAccess = false;
    if (contactNumber.userId === user.id) {
      hasAccess = true;
    } else if (contactNumber.businessAccountId) {
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.businessAccountId, contactNumber.businessAccountId),
          eq(businessAccountMembers.isActive, true)
        ),
      });
      hasAccess = !!membership;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check for duplicate phone number (excluding current one)
    if (phoneNumber && phoneNumber.trim() !== contactNumber.phoneNumber) {
      const existing = await db.query.userContactNumbers.findFirst({
        where: and(
          contactNumber.userId
            ? eq(userContactNumbers.userId, contactNumber.userId)
            : undefined,
          contactNumber.businessAccountId
            ? eq(userContactNumbers.businessAccountId, contactNumber.businessAccountId)
            : undefined,
          eq(userContactNumbers.phoneNumber, phoneNumber.trim()),
          eq(userContactNumbers.id, contactNumberId)
        ),
      });

      if (existing) {
        return NextResponse.json(
          { error: 'This phone number already exists' },
          { status: 400 }
        );
      }
    }

    // Update contact number
    const updates: any = {
      updatedAt: new Date(),
    };

    if (phoneNumber !== undefined) {
      updates.phoneNumber = phoneNumber.trim();
    }
    if (isWhatsApp !== undefined) {
      updates.isWhatsApp = Boolean(isWhatsApp);
    }
    if (label !== undefined) {
      updates.label = label?.trim() || null;
    }
    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    const [updatedContactNumber] = await db
      .update(userContactNumbers)
      .set(updates)
      .where(eq(userContactNumbers.id, contactNumberId))
      .returning();

    return NextResponse.json(
      { success: true, contactNumber: updatedContactNumber },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error updating contact number:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update contact number' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const contactNumberId = Number(resolvedParams.id);

    if (isNaN(contactNumberId) || contactNumberId <= 0) {
      return NextResponse.json({ error: 'Invalid contact number ID' }, { status: 400 });
    }

    // Verify contact number exists and belongs to user or their business account
    const contactNumber = await db.query.userContactNumbers.findFirst({
      where: eq(userContactNumbers.id, contactNumberId),
    });

    if (!contactNumber) {
      return NextResponse.json(
        { error: 'Contact number not found' },
        { status: 404 }
      );
    }

    // Check ownership
    let hasAccess = false;
    if (contactNumber.userId === user.id) {
      hasAccess = true;
    } else if (contactNumber.businessAccountId) {
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.businessAccountId, contactNumber.businessAccountId),
          eq(businessAccountMembers.isActive, true)
        ),
      });
      hasAccess = !!membership;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Soft delete by setting isActive to false
    await db
      .update(userContactNumbers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userContactNumbers.id, contactNumberId));

    return NextResponse.json(
      { success: true, message: 'Contact number deleted' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error deleting contact number:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete contact number' },
      { status: 500 }
    );
  }
}

