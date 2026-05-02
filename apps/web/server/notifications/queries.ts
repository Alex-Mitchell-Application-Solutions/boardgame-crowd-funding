import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  notificationPreferences,
  notifications,
  type Notification,
  type NotificationPreferences,
} from '@bgcf/db';
import { getDb } from '../db';

/** Most-recent first, capped. */
export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Used by the bell badge — fast count of unread. */
export async function getUnreadCount(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.n ?? 0;
}

/** Get-or-default preferences. Missing row → all-true defaults. */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
