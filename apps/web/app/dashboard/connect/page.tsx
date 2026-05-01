import { requireUser } from '@/server/auth';
import { getCreatorProfile } from '@/server/creators/queries';
import {
  createCreatorProfile,
  refreshStripeOnboardingLink,
  startStripeOnboarding,
} from '@/server/creators/actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Connect your account',
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const profile = await getCreatorProfile(user.id);
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your account</h1>
        <p className="text-sm text-slate-600">
          Set up your creator profile and link a Stripe account so you can receive backer pledges.
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-medium">1. Creator profile</h2>
        {profile ? (
          <p className="text-sm text-slate-600">
            Profile: <span className="font-medium">{profile.displayName}</span>
            {profile.bio ? ` — ${profile.bio}` : ''}
          </p>
        ) : (
          <p className="text-sm text-slate-600">No creator profile yet. Create one below.</p>
        )}

        <form action={createCreatorProfile} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Display name</span>
            <input
              name="displayName"
              required
              minLength={2}
              maxLength={80}
              defaultValue={profile?.displayName ?? ''}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Bio (optional)</span>
            <textarea
              name="bio"
              rows={3}
              maxLength={2000}
              defaultValue={profile?.bio ?? ''}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {profile ? 'Update profile' : 'Create profile'}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-medium">2. Stripe account</h2>
        <ConnectStatus profile={profile} />
      </section>
    </main>
  );
}

function ConnectStatus({ profile }: { profile: Awaited<ReturnType<typeof getCreatorProfile>> }) {
  if (!profile) {
    return (
      <p className="text-sm text-slate-600">
        Create a creator profile first, then come back here to link Stripe.
      </p>
    );
  }

  if (profile.stripeChargesEnabled) {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Connected. You&apos;re ready to launch a campaign.
      </p>
    );
  }

  if (profile.stripeAccountId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Stripe onboarding is in progress but not finished. Continue where you left off.
        </p>
        <form action={refreshStripeOnboardingLink}>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Continue Stripe onboarding →
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        We&apos;ll send you to Stripe to verify your identity and connect a payout account.
      </p>
      <form action={startStripeOnboarding}>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Start Stripe onboarding →
        </button>
      </form>
    </div>
  );
}
