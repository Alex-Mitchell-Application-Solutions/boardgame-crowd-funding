import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { getEnv } from '@/server/env';
import { getPublicCampaignBySlug } from '@/server/campaigns/queries';
import { PledgeForm } from '@/components/pledges/PledgeForm';
import { CampaignProgressBar } from '@/components/campaigns/CampaignProgressBar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Back this project' };

export default async function PledgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getPublicCampaignBySlug(slug);
  if (!campaign) notFound();
  if (campaign.status !== 'live') {
    // Succeeded campaigns are publicly viewable but no longer accept new pledges.
    redirect(`/c/${slug}`);
  }
  await requireUser();

  const env = getEnv();
  if (!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <main className="mx-auto max-w-xl space-y-4 px-6 py-12">
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Stripe isn&apos;t configured for this environment. Set{' '}
          <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> and try again.
        </p>
      </main>
    );
  }

  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/c/${slug}/back/success`;

  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 lg:grid-cols-[1fr_320px]">
      <section className="space-y-6">
        <header className="space-y-1">
          <Link href={`/c/${slug}`} className="text-xs font-medium text-slate-500 hover:underline">
            ← Back to campaign
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Back {campaign.title}</h1>
          <p className="text-sm text-slate-600">
            We save your card now and only charge it at the campaign&apos;s deadline if the goal is
            hit.
          </p>
        </header>

        <PledgeForm
          campaignId={campaign.id}
          slug={slug}
          publishableKey={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
          tiers={campaign.rewardTiers}
          returnUrl={returnUrl}
        />
      </section>

      <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-base font-semibold">{campaign.title}</h2>
        {campaign.tagline ? <p className="text-sm text-slate-600">{campaign.tagline}</p> : null}
        <CampaignProgressBar
          raisedPence={campaign.totalPledgedPence}
          goalPence={campaign.goalPence}
          pledgeCount={campaign.pledgeCount}
          deadlineAt={campaign.deadlineAt}
        />
      </aside>
    </main>
  );
}
