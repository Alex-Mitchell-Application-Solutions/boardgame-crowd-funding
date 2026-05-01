import Link from 'next/link';
import { redirect } from 'next/navigation';
import { campaignCategory } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getCreatorProfile } from '@/server/creators/queries';
import { createCampaign } from '@/server/campaigns/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New campaign' };

export default async function NewCampaignPage() {
  const user = await requireUser();
  const profile = await getCreatorProfile(user.id);
  if (!profile) {
    redirect(
      '/dashboard/connect?error=' +
        encodeURIComponent('Set up your creator profile before launching a campaign.'),
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
        <p className="text-sm text-slate-600">
          Pick a working title, a category, and a goal. You can fill in everything else (story,
          reward tiers, media, deadline) on the next page.
        </p>
      </header>

      <form action={createCampaign} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Working title</span>
          <input
            type="text"
            name="title"
            required
            minLength={3}
            maxLength={120}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            name="category"
            required
            defaultValue=""
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="" disabled>
              Pick one…
            </option>
            {campaignCategory.enumValues.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Funding goal (in pence)</span>
          <input
            type="number"
            name="goalPence"
            required
            min={100}
            step={1}
            placeholder="e.g. 1000000 (= £10,000)"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <span className="mt-1 block text-xs text-slate-500">
            All amounts are stored in pence to avoid float rounding. £10 = 1000.
          </span>
        </label>

        <div className="flex items-center justify-between pt-2">
          <Link href="/dashboard/campaigns" className="text-sm text-slate-600 hover:underline">
            ← Back to campaigns
          </Link>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create draft →
          </button>
        </div>
      </form>
    </main>
  );
}
