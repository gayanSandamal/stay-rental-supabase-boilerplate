import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { savedSearches } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const id = Number(resolvedParams.id);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const result = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: 'Saved search not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
