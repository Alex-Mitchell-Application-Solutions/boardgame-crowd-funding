import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CampaignMedia, RewardTier } from '@bgcf/db';
import { getPublicCampaignBySlug } from '@/server/campaigns/queries';
import { publicUrl } from '@/server/storage';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CampaignProgressBar } from '@/components/campaigns/CampaignProgressBar';
import { formatPence } from '@/lib/format';

type PublicCampaign = NonNullable<Awaited<ReturnType<typeof getPublicCampaignBySlug>>>;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getPublicCampaignBySlug(slug);
  if (!campaign) return { title: 'Campaign not found' };

  const cover = campaign.media.find((m) => m.kind === 'cover');
  const ogImage = cover ? safePublicUrl(cover.r2Key) : null;

  return {
    title: campaign.title,
    description: campaign.tagline ?? undefined,
    openGraph: {
      title: campaign.title,
      description: campaign.tagline ?? undefined,
      type: 'website',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: campaign.title,
      description: campaign.tagline ?? undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getPublicCampaignBySlug(slug);
  if (!campaign) notFound();

  const cover = campaign.media.find((m) => m.kind === 'cover');
  const gallery = campaign.media.filter((m) => m.kind !== 'cover');
  const visibleTiers = campaign.rewardTiers
    .filter((t) => !t.isHidden)
    .sort((a, b) => a.position - b.position);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <CoverHero campaign={campaign} cover={cover} />

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <article className="space-y-10">
          <section>
            <h2 className="sr-only">Campaign story</h2>
            <MarkdownContent source={campaign.storyMd} />
          </section>

          {gallery.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Gallery</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((m) => (
                  <li key={m.id}>
                    <GalleryItem media={m} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>

        <aside className="space-y-6">
          <RewardTierList slug={campaign.slug} tiers={visibleTiers} />
        </aside>
      </div>
    </main>
  );
}

function CoverHero({
  campaign,
  cover,
}: {
  campaign: PublicCampaign;
  cover: CampaignMedia | undefined;
}) {
  const coverUrl = cover ? safePublicUrl(cover.r2Key) : null;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center text-sm text-slate-500">
            No cover image
          </div>
        )}
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          {campaign.category}
          {campaign.status === 'succeeded' ? ' · Funded' : ''}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{campaign.title}</h1>
        {campaign.tagline ? <p className="text-lg text-slate-600">{campaign.tagline}</p> : null}
        <CampaignProgressBar
          raisedPence={campaign.totalPledgedPence}
          goalPence={campaign.goalPence}
          pledgeCount={campaign.pledgeCount}
          deadlineAt={campaign.deadlineAt}
        />
      </div>
    </section>
  );
}

function GalleryItem({ media }: { media: CampaignMedia }) {
  const url = safePublicUrl(media.r2Key);
  if (!url) return null;
  if (media.mimeType.startsWith('image/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="aspect-[4/3] w-full rounded-md border border-slate-200 object-cover"
      />
    );
  }
  if (media.mimeType.startsWith('video/')) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="aspect-[4/3] w-full rounded-md border border-slate-200 bg-black object-cover"
      />
    );
  }
  return null;
}

function RewardTierList({ slug, tiers }: { slug: string; tiers: RewardTier[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Reward tiers</h2>
        <Link
          href={`/c/${slug}/back`}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Back this project
        </Link>
      </div>
      {tiers.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          No reward tiers yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {tiers.map((tier) => (
            <li key={tier.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold">{tier.title}</h3>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  {formatPence(tier.pricePence)}
                </span>
              </div>
              <div className="mt-2">
                <MarkdownContent source={tier.descriptionMd} />
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {tier.quantityLimit !== null ? (
                  <div>
                    <dt className="sr-only">Availability</dt>
                    <dd>
                      {Math.max(0, tier.quantityLimit - tier.quantityClaimed)} of{' '}
                      {tier.quantityLimit} left
                    </dd>
                  </div>
                ) : null}
                {tier.estimatedDelivery ? (
                  <div>
                    <dt className="sr-only">Estimated delivery</dt>
                    <dd>Est. delivery {tier.estimatedDelivery}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">{timeRemainingHint(tiers)}</p>
    </div>
  );
}

function timeRemainingHint(tiers: RewardTier[]): string {
  const limited = tiers.filter((t) => t.quantityLimit !== null);
  if (limited.length === 0) return '';
  const lowest = limited.reduce(
    (best, t) => Math.min(best, (t.quantityLimit ?? 0) - t.quantityClaimed),
    Infinity,
  );
  if (lowest === Infinity || lowest > 5) return '';
  return `Limited tiers running low — only ${lowest} left on the most-claimed limited tier.`;
}

function safePublicUrl(key: string): string | null {
  try {
    return publicUrl(key);
  } catch {
    return null;
  }
}
