import Link from 'next/link';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pledge saved' };

/**
 * Stripe redirects here after the SetupIntent confirms. The webhook handler
 * has likely already persisted the payment_method on the pledge by the time
 * the backer lands here, but we don't strictly need it to — the page is a
 * landing spot, not a verification gate.
 */
export default async function PledgeSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ setup_intent?: string; redirect_status?: string }>;
}) {
  const { slug } = await params;
  const { redirect_status: status } = await searchParams;
  await requireUser();

  const isSucceeded = status === 'succeeded';

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
      {isSucceeded ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            Thanks for backing this project!
          </h1>
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            Your card is saved. We&apos;ll only charge it at the campaign&apos;s deadline if the
            funding goal is met. You&apos;ll get an email confirmation either way.
          </p>
          <p className="text-sm text-slate-600">
            You can change or cancel your pledge anytime before the deadline from your account.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Pledge couldn&apos;t complete</h1>
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            Stripe couldn&apos;t finish saving your card{status ? ` (${status})` : ''}. You can try
            again with a different card.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/c/${slug}`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Back to campaign
        </Link>
        <Link
          href="/account"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Your pledges
        </Link>
      </div>
    </main>
  );
}
