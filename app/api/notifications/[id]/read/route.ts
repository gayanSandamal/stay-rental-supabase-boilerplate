import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { markNotificationAsRead } from '@/lib/notifications';

export async function PATCH(
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
    return NextResponse.json({ error: 'Invalid notification ID' }, { status: 400 });
  }

  await markNotificationAsRead(id, user.id);
  return NextResponse.json({ success: true });
}
