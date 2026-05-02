'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { notificationPreferences, notifications } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';

export async function markNotificationRead(notificationId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
      ),
    );
  revalidatePath('/account/notifications');
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath('/account/notifications');
}

const PREF_KEYS = [
  'inappPledgeConfirmed',
  'inappPledgeCharged',
  'inappPledgeChargeFailed',
  'inappPledgeRefunded',
  'inappCampaignSucceeded',
  'inappCampaignFailed',
  'inappCampaignUpdatePosted',
  'inappCommentReply',
  'inappConnectOnboardingIncomplete',
  'emailPledgeConfirmed',
  'emailPledgeCharged',
  'emailPledgeChargeFailed',
  'emailPledgeRefunded',
  'emailCampaignSucceeded',
  'emailCampaignFailed',
  'emailCampaignUpdatePosted',
  'emailCommentReply',
  'emailConnectOnboardingIncomplete',
] as const;

type PrefKey = (typeof PREF_KEYS)[number];

/**
 * Update notification preferences. Form fields are checkbox-style: a
 * field present in formData with value 'on' means true; absent means
 * false. Defaults are seeded server-side (all true) so a user toggling
 * one off and saving doesn't accidentally turn off everything they
 * didn't render in the form.
 */
export async function updateNotificationPreferences(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  const values: Record<PrefKey, boolean> = Object.fromEntries(
    PREF_KEYS.map((k) => [k, formData.get(k) === 'on']),
  ) as Record<PrefKey, boolean>;

  await db
    .insert(notificationPreferences)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...values, updatedAt: sql`now()` },
    });

  revalidatePath('/account/notifications/preferences');
}
