import Link from 'next/link';
import type { Notification, NotificationKind } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { listNotifications } from '@/server/notifications/queries';
import { markAllNotificationsRead, markNotificationRead } from '@/server/notifications/actions';
import { readPayload } from '@/server/notifications/lib/factories';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, 100);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <Link
          href="/account/notifications/preferences"
          className="text-sm font-medium text-slate-600 hover:underline"
        >
          Preferences
        </Link>
      </header>

      {items.some((i) => !i.readAt) ? (
        <form action={markAllNotificationsRead}>
          <button type="submit" className="text-xs font-medium text-slate-600 hover:underline">
            Mark all as read
          </button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-600">
          You have no notifications yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'bg-white' : 'bg-slate-50'}>
              <NotificationRow notification={n} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function NotificationRow({ notification }: { notification: Notification }) {
  const { href, summary } = describe(notification);
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <Link href={href} className="min-w-0 flex-1 text-sm text-slate-800 hover:underline">
        <p className="font-medium">{summary}</p>
        <p className="mt-0.5 text-xs text-slate-500">{formatRelative(notification.createdAt)}</p>
      </Link>
      {notification.readAt ? null : (
        <form action={markNotificationRead.bind(null, notification.id)}>
          <button
            type="submit"
            className="shrink-0 text-xs font-medium text-slate-600 hover:underline"
          >
            Mark read
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Per-kind summary line + deep link. Adding a new kind adds a case here;
 * the discriminated NotificationPayloads typing forces all kinds to be
 * handled, so a future addition to schema.ts will fail typecheck until
 * we wire in its row.
 */
function describe(n: Notification): { href: string; summary: string } {
  switch (n.kind as NotificationKind) {
    case 'pledge_confirmed': {
      const p = readPayload(n, 'pledge_confirmed');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `Pledge confirmed for "${p.campaignTitle}".`,
      };
    }
    case 'pledge_charged': {
      const p = readPayload(n, 'pledge_charged');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `You've been charged ${formatPence(p.amountPence)} for "${p.campaignTitle}".`,
      };
    }
    case 'pledge_charge_failed': {
      const p = readPayload(n, 'pledge_charge_failed');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `Charge failed for "${p.campaignTitle}". Please update your card.`,
      };
    }
    case 'pledge_refunded': {
      const p = readPayload(n, 'pledge_refunded');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `${formatPence(p.amountPence)} refunded for "${p.campaignTitle}".`,
      };
    }
    case 'campaign_succeeded': {
      const p = readPayload(n, 'campaign_succeeded');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `"${p.campaignTitle}" hit its goal.`,
      };
    }
    case 'campaign_failed': {
      const p = readPayload(n, 'campaign_failed');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `"${p.campaignTitle}" did not hit its goal. No card was charged.`,
      };
    }
    case 'campaign_update_posted': {
      const p = readPayload(n, 'campaign_update_posted');
      return {
        href: `/c/${p.campaignSlug}`,
        summary: `New update on "${p.campaignTitle}": ${p.updateTitle}`,
      };
    }
    case 'comment_reply': {
      const p = readPayload(n, 'comment_reply');
      return {
        href: `/c/${p.campaignSlug}#comment-${p.commentId}`,
        summary: 'Someone replied to your comment.',
      };
    }
    case 'connect_onboarding_incomplete': {
      return {
        href: '/dashboard/connect',
        summary: 'Finish your Stripe Connect onboarding to publish campaigns.',
      };
    }
  }
}

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d);
}
