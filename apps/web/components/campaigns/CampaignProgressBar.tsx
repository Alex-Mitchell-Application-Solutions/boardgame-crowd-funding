import { formatPence, progressFraction, timeRemaining } from '@/lib/format';

type Props = {
  raisedPence: number;
  goalPence: number;
  pledgeCount: number;
  deadlineAt: Date | null;
};

/**
 * Reusable progress block — pence raised, goal, pledge count, and a bar
 * clamped to 100% so post-goal raises don't visually overflow.
 */
export function CampaignProgressBar({ raisedPence, goalPence, pledgeCount, deadlineAt }: Props) {
  const fraction = progressFraction(raisedPence, goalPence);
  const percent = Math.round(fraction * 100);

  return (
    <div className="space-y-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-emerald-600 transition-[width]"
          style={{ width: `${percent}%` }}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="sr-only">Raised</dt>
          <dd className="font-semibold text-slate-900">
            {formatPence(raisedPence)}{' '}
            <span className="text-xs font-normal text-slate-500">
              of {formatPence(goalPence)} ({percent}%)
            </span>
          </dd>
        </div>
        <div>
          <dt className="sr-only">Backers</dt>
          <dd className="text-slate-700">
            {pledgeCount.toLocaleString('en-GB')} backer
            {pledgeCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Time remaining</dt>
          <dd className="text-slate-700">{timeRemaining(deadlineAt)}</dd>
        </div>
      </dl>
    </div>
  );
}
