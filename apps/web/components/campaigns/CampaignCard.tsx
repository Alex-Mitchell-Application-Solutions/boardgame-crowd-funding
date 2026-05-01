import Link from 'next/link';
import type { BrowseCard } from '@/server/campaigns/queries';
import { publicUrl } from '@/server/storage';
import { formatPence, progressFraction, timeRemaining } from '@/lib/format';

type Props = { campaign: BrowseCard };

export function CampaignCard({ campaign }: Props) {
  const fraction = progressFraction(campaign.totalPledgedPence, campaign.goalPence);
  const percent = Math.round(fraction * 100);
  const coverUrl = (() => {
    if (!campaign.coverR2Key) return null;
    try {
      return publicUrl(campaign.coverR2Key);
    } catch {
      return null;
    }
  })();

  return (
    <Link
      href={`/c/${campaign.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-wide text-slate-400">
            No cover image
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm">
          {campaign.category}
        </span>
        {campaign.status === 'succeeded' ? (
          <span className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 shadow-sm">
            Funded
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-slate-900">
            {campaign.title}
          </h3>
          {campaign.tagline ? (
            <p className="line-clamp-2 text-sm text-slate-600">{campaign.tagline}</p>
          ) : null}
        </div>
        <div className="mt-auto space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-600" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-900">
              {formatPence(campaign.totalPledgedPence)}{' '}
              <span className="font-normal text-slate-500">({percent}%)</span>
            </span>
            <span className="text-slate-500">{timeRemaining(campaign.deadlineAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
