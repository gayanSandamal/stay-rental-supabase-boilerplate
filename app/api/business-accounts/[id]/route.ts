import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, businessAccountMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

/**
 * Update a business account's own details. Before this, STATUS.md flagged
 * "there is no update or suspend endpoint at all — status can only be
 * changed by direct SQL." This closes the update half (name/phone/address);
 * `status` stays admin/ops-only — a self-serve owner suspending their own
 * account is not a real use case, and status changes are consequential
 * enough to keep behind the existing back-office gate.
 */
export async function PATCH(
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
    if (isNaN(businessAccountId) || businessAccountId <= 0) {
      return NextResponse.json({ error: 'Invalid business account ID' }, { status: 400 });
    }

    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';

    if (!isAdminOrOps) {
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.businessAccountId, businessAccountId),
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.isActive, true)
        ),
      });
      // Only owner/admin members may edit account details — a plain
      // 'member' has listing rights via lib/auth/listing-access.ts but not
      // account-settings rights (STATUS.md's "member.role carries no
      // differentiated permissions" gap, closed here).
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.phone === 'string') updates.phone = body.phone.trim() || null;
    if (typeof body.address === 'string') updates.address = body.address.trim() || null;
    // status is deliberately never accepted here — admin/ops only, via SQL
    // or a future dedicated back-office action, not this self-serve route.

    // admin/ops may additionally set kycVerified — the business account's
    // OWN verification (0064), never a self-serve field.
    if (isAdminOrOps && typeof body.kycVerified === 'boolean') {
      updates.kycVerified = body.kycVerified;
      updates.kycVerifiedAt = body.kycVerified ? new Date() : null;
      updates.kycVerifiedBy = body.kycVerified ? user.id : null;
    }

    const [updated] = await db
      .update(businessAccounts)
      .set(updates)
      .where(eq(businessAccounts.id, businessAccountId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Business account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, businessAccount: updated });
  } catch (error: any) {
    console.error('Error updating business account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update business account' },
      { status: 500 }
    );
  }
}
