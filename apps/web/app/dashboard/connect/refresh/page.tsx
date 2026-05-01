import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { getCreatorProfile } from '@/server/creators/queries';
import { createOnboardingLink } from '@/server/stripe/connect';

export const dynamic = 'force-dynamic';

/**
 * Stripe redirects here when an onboarding link has expired. We
 * generate a fresh link and bounce the creator straight back into
 * Stripe-hosted onboarding.
 */
export default async function ConnectRefreshPage() {
  const user = await requireUser();
  const profile = await getCreatorProfile(user.id);
  if (!profile?.stripeAccountId) {
    redirect('/dashboard/connect');
  }
  const url = await createOnboardingLink(profile.stripeAccountId);
  redirect(url);
}
