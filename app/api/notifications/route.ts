import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import {
  getNotificationsForUser,
  getUnreadCountForUser,
  markAllNotificationsAsRead,
} from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 100);
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForUser(user.id, limit),
    getUnreadCountForUser(user.id),
  ]);

  return NextResponse.json({
    notifications,
    unreadCount,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.action === 'mark_all_read') {
    await markAllNotificationsAsRead(user.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
