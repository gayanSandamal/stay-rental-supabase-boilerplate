import { db } from '@/lib/db/drizzle';
import { notifications, users } from '@/lib/db/schema';
import { eq, and, inArray, desc, isNull } from 'drizzle-orm';

export type NotificationType = 'new_lead' | 'saved_search_alert' | 'viewing_scheduled' | 'listing_approved';

export async function createNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
    })
    .returning();
  return notification;
}

export async function createNotificationsForOpsAndAdmin(params: {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  const opsAndAdmin = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ['ops', 'admin']));

  const created = await Promise.all(
    opsAndAdmin.map((u) =>
      createNotification({
        userId: u.id,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link,
      })
    )
  );
  return created;
}

export async function getNotificationsForUser(userId: number, limit = 50) {
  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCountForUser(userId: number) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsAsRead(userId: number) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
