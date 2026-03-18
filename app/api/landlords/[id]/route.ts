import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { landlords } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';

/**
 * PATCH /api/landlords/[id]
 * Update landlord plan tier. Admin/ops only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'admin' && user.role !== 'ops') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const landlordId = Number(resolvedParams.id);

  if (isNaN(landlordId) || landlordId <= 0) {
    return NextResponse.json({ error: 'Invalid landlord ID' }, { status: 400 });
  }

  const body = await request.json();
  const { landlordPlanTier, landlordPlanExpiresAt } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (landlordPlanTier !== undefined) {
    const valid = ['free', 'starter', 'pro', 'agency', 'basic', 'premium'].includes(
      String(landlordPlanTier).toLowerCase()
    );
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid plan tier. Use: free, starter, pro, agency (basic/premium legacy)' },
        { status: 400 }
      );
    }
    updates.landlordPlanTier = String(landlordPlanTier).toLowerCase();
  }

  if (landlordPlanExpiresAt !== undefined) {
    updates.landlordPlanExpiresAt = landlordPlanExpiresAt
      ? new Date(landlordPlanExpiresAt)
      : null;
  }

  const [updated] = await db
    .update(landlords)
    .set(updates as any)
    .where(eq(landlords.id, landlordId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Landlord not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
