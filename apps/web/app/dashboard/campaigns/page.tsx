import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { listCreatorCampaigns } from '@/server/campaigns/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your campaigns' };

const statusBadge: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800 border-slate-300',
  live: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  succeeded: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  failed: 'bg-red-50 text-red-900 border-red-300',
  cancelled: 'bg-slate-50 text-slate-600 border-slate-300',
  hidden: 'bg-amber-50 text-amber-900 border-amber-300',
};

export default async function CampaignsListPage() {
  const user = await requireUser();
  const campaigns = await listCreatorCampaigns(user.id);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your campaigns</h1>
        <Link
          href="/dashboard/campaigns/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New campaign
        </Link>
      </header>

      {campaigns.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          No campaigns yet. Start your first one to get a draft you can iterate on before
          publishing.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/campaigns/${c.id}/edit`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{c.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {c.category} · goal £{(c.goalPence / 100).toLocaleString('en-GB')}
                    {c.deadlineAt
                      ? ` · ends ${c.deadlineAt.toLocaleDateString('en-GB')}`
                      : ' · no deadline set'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${statusBadge[c.status] ?? 'border-slate-300 bg-slate-50 text-slate-700'}`}
                >
                  {c.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
