import Link from 'next/link';
import type { NotificationPreferences } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getNotificationPreferences } from '@/server/notifications/queries';
import { updateNotificationPreferences } from '@/server/notifications/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notification preferences' };

// (label, in-app key, email key) — drives the table layout below. Order
// matters; matches the kinds users see most often first.
const KINDS: ReadonlyArray<{
  label: string;
  description: string;
  inappKey: keyof NotificationPreferences;
  emailKey: keyof NotificationPreferences;
}> = [
  {
    label: 'Pledge confirmed',
    description: 'When you successfully pledge to a campaign.',
    inappKey: 'inappPledgeConfirmed',
    emailKey: 'emailPledgeConfirmed',
  },
  {
    label: 'Pledge charged',
    description: 'When the campaign hits its goal and we charge your card.',
    inappKey: 'inappPledgeCharged',
    emailKey: 'emailPledgeCharged',
  },
  {
    label: 'Charge failed',
    description: 'If your saved card declines at deadline.',
    inappKey: 'inappPledgeChargeFailed',
    emailKey: 'emailPledgeChargeFailed',
  },
  {
    label: 'Refund issued',
    description: 'When a creator issues a refund on a pledge of yours.',
    inappKey: 'inappPledgeRefunded',
    emailKey: 'emailPledgeRefunded',
  },
  {
    label: 'Campaign succeeded',
    description: 'When a campaign you backed (or run) hits its goal.',
    inappKey: 'inappCampaignSucceeded',
    emailKey: 'emailCampaignSucceeded',
  },
  {
    label: 'Campaign failed',
    description: 'When a campaign you backed (or run) misses its goal.',
    inappKey: 'inappCampaignFailed',
    emailKey: 'emailCampaignFailed',
  },
  {
    label: 'Update posted',
    description: 'When a creator posts an update on a campaign you backed.',
    inappKey: 'inappCampaignUpdatePosted',
    emailKey: 'emailCampaignUpdatePosted',
  },
  {
    label: 'Comment reply',
    description: 'When someone replies to your comment.',
    inappKey: 'inappCommentReply',
    emailKey: 'emailCommentReply',
  },
  {
    label: 'Stripe onboarding nudge',
    description: 'Reminders to finish Connect onboarding (creators only).',
    inappKey: 'inappConnectOnboardingIncomplete',
    emailKey: 'emailConnectOnboardingIncomplete',
  },
];

export default async function PreferencesPage() {
  const user = await requireUser();
  const stored = await getNotificationPreferences(user.id);
  const prefs = stored ?? defaultsFor(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notification preferences</h1>
        <Link
          href="/account/notifications"
          className="text-sm font-medium text-slate-600 hover:underline"
        >
          ← Notifications
        </Link>
      </header>

      <p className="text-sm text-slate-600">
        Choose which alerts you want, and on which channel. Email is wired in M8 — for now we always
        insert the in-app row regardless of the email setting.
      </p>

      <form action={updateNotificationPreferences} className="space-y-4">
        <table className="w-full divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">
                Kind
              </th>
              <th scope="col" className="px-4 py-3 text-center">
                In-app
              </th>
              <th scope="col" className="px-4 py-3 text-center">
                Email
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {KINDS.map((k) => (
              <tr key={k.label}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{k.label}</p>
                  <p className="text-xs text-slate-500">{k.description}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    name={k.inappKey}
                    defaultChecked={Boolean(prefs[k.inappKey])}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    name={k.emailKey}
                    defaultChecked={Boolean(prefs[k.emailKey])}
                    className="rounded"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Save preferences
          </button>
        </div>
      </form>
    </main>
  );
}

/**
 * In-memory default row for users who haven't saved preferences yet. The
 * column defaults are all-true at the DB level, so we mirror that here
 * for first-render so all checkboxes are pre-checked. Saving the form
 * will insert the real row.
 */
function defaultsFor(userId: string): NotificationPreferences {
  return {
    userId,
    inappPledgeConfirmed: true,
    inappPledgeCharged: true,
    inappPledgeChargeFailed: true,
    inappPledgeRefunded: true,
    inappCampaignSucceeded: true,
    inappCampaignFailed: true,
    inappCampaignUpdatePosted: true,
    inappCommentReply: true,
    inappConnectOnboardingIncomplete: true,
    emailPledgeConfirmed: true,
    emailPledgeCharged: true,
    emailPledgeChargeFailed: true,
    emailPledgeRefunded: true,
    emailCampaignSucceeded: true,
    emailCampaignFailed: true,
    emailCampaignUpdatePosted: true,
    emailCommentReply: true,
    emailConnectOnboardingIncomplete: true,
    updatedAt: new Date(),
  };
}
