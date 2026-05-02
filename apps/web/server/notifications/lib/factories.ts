import 'server-only';
import type { NewNotification, NotificationKind } from '@bgcf/db';

// Typed payload shape per NotificationKind. Centralised so producers and
// consumers (Bell, /account/notifications, future email templates) agree
// on the keys.
//
// Add a new entry here whenever you add a new NotificationKind in
// schema.ts. The factory function below is the only allowed way to
// create a notification row — that keeps the JSONB payload column from
// drifting into a free-for-all of inconsistent shapes.

export type NotificationPayloads = {
  pledge_confirmed: {
    pledgeId: string;
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
    amountPence: number;
  };
  pledge_charged: {
    pledgeId: string;
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
    amountPence: number;
  };
  pledge_charge_failed: {
    pledgeId: string;
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
  };
  pledge_refunded: {
    pledgeId: string;
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
    amountPence: number;
  };
  campaign_succeeded: {
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
  };
  campaign_failed: {
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
  };
  campaign_update_posted: {
    campaignId: string;
    campaignTitle: string;
    campaignSlug: string;
    updateId: string;
    updateTitle: string;
  };
  comment_reply: {
    campaignId: string;
    campaignSlug: string;
    commentId: string;
    parentCommentId: string;
    actorId: string;
  };
  connect_onboarding_incomplete: {
    creatorUserId: string;
  };
};

export type NotificationOf<K extends NotificationKind> = {
  userId: string;
  kind: K;
  payload: NotificationPayloads[K];
};

/**
 * Build a NewNotification row. The discriminated input ties `kind` to
 * its payload shape; passing wrong-shaped data is a TypeScript error,
 * not a runtime surprise. Pass the result to `db.insert(notifications)`.
 */
export function buildNotification<K extends NotificationKind>(args: {
  userId: string;
  kind: K;
  payload: NotificationPayloads[K];
}): NewNotification {
  return {
    userId: args.userId,
    kind: args.kind,
    // Store the payload as a Record<string, unknown>; the column type
    // forgets the per-kind shape on the way back out (callers re-type
    // when reading via getNotifications + a kind-discriminated switch).
    payload: args.payload as Record<string, unknown>,
  };
}

/**
 * Type-narrow a notification's payload by its kind. Useful in UI code
 * that switches on row.kind to render a per-kind component.
 *
 *   if (n.kind === 'pledge_charged') {
 *     const p = readPayload(n, 'pledge_charged');
 *     // p is now typed as NotificationPayloads['pledge_charged']
 *   }
 */
export function readPayload<K extends NotificationKind>(
  notification: { kind: NotificationKind; payload: Record<string, unknown> },
  kind: K,
): NotificationPayloads[K] {
  if (notification.kind !== kind) {
    throw new Error(`notification kind mismatch: expected ${kind}, got ${notification.kind}`);
  }
  return notification.payload as NotificationPayloads[K];
}
