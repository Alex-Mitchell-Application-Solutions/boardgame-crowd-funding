import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { getCreatorProfile } from '@/server/creators/queries';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Connection complete',
};

/**
 * Stripe redirects creators here when they finish (or close) the
 * Express onboarding flow. The actual capability flags arrive via the
 * `account.updated` webhook — this page just gives the creator a
 * landing spot and the latest status from the database.
 */
export default async function ConnectReturnPage() {
  const user = await requireUser();
  const profile = await getCreatorProfile(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      {profile?.stripeChargesEnabled ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Stripe onboarding complete. You can launch a campaign.
        </p>
      ) : (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Stripe is still verifying your details. We&apos;ll update your status here automatically
          when it&apos;s done — usually a few seconds, occasionally up to a few minutes for
          additional verification.
        </p>
      )}
      <Link href="/dashboard" className="text-sm font-medium underline">
        ← Back to dashboard
      </Link>
    </main>
  );
}
