import Link from 'next/link';
import { campaignCategory, type CampaignCategory } from '@bgcf/db';
import { listLiveCampaigns } from '@/server/campaigns/queries';
import { CampaignCard } from '@/components/campaigns/CampaignCard';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Browse campaigns',
  description: 'Discover tabletop and boardgame campaigns currently raising on the platform.',
};

type SearchParams = {
  q?: string;
  category?: string;
};

function isCategory(value: string | undefined): value is CampaignCategory {
  return value !== undefined && (campaignCategory.enumValues as readonly string[]).includes(value);
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const category = isCategory(params.category) ? params.category : undefined;

  const { items } = await listLiveCampaigns({ q, category });

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Browse campaigns</h1>
        <p className="text-sm text-slate-600">Live and recently-funded tabletop campaigns.</p>
      </header>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <label className="flex-1">
          <span className="sr-only">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by title…"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </label>
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
        >
          Search
        </button>
      </form>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by category">
        <CategoryChip current={category} target={undefined} q={q} label="All" />
        {campaignCategory.enumValues.map((c) => (
          <CategoryChip key={c} current={category} target={c} q={q} label={c} />
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          No campaigns match those filters yet.
          {q ? ' Try a different search.' : ''}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CategoryChip({
  current,
  target,
  q,
  label,
}: {
  current: CampaignCategory | undefined;
  target: CampaignCategory | undefined;
  q: string | undefined;
  label: string;
}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (target) params.set('category', target);
  const isActive = current === target;
  return (
    <Link
      href={`/browse${params.toString() ? `?${params.toString()}` : ''}`}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
        isActive
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
      }`}
    >
      {label}
    </Link>
  );
}
