import 'server-only';
import type { CampaignUpdate } from '@bgcf/db';
import { MarkdownContent } from '@/components/MarkdownContent';

type Props = {
  updates: CampaignUpdate[];
};

/**
 * Renders the public-facing updates feed on a campaign page. The query
 * already filters out drafts and (for non-backers) backers-only posts, so
 * we just have to render whatever lands here.
 */
export function UpdatesSection({ updates }: Props) {
  if (updates.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Updates</h2>
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          No updates yet. The creator will post here as the campaign progresses.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Updates</h2>
      <ol className="space-y-6">
        {updates.map((u) => (
          <li key={u.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <header className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">{u.title}</h3>
              <p className="text-xs text-slate-500">
                {u.publishedAt ? formatDate(u.publishedAt) : 'Draft'}
                {u.isBackersOnly ? ' · Backers only' : ''}
              </p>
            </header>
            <div className="mt-3">
              <MarkdownContent source={u.bodyMd} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
  }).format(d);
}
