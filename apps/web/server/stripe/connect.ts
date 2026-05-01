import 'server-only';
import { getStripe } from './client';
import { getEnv } from '../env';

/**
 * Create a Stripe Connect Express account for a creator. Returns the
 * Stripe account id; persistence onto `creator_profiles` is the caller's
 * responsibility.
 *
 * The account is "Express" — Stripe-hosted onboarding, but our platform
 * controls the dashboard experience. Country pinned to GB for v1; we'll
 * make this dynamic when we expand internationally.
 */
export async function createConnectAccount(userId: string): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'GB',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    metadata: { user_id: userId },
  });
  return account.id;
}

/**
 * Create a one-shot account-link URL that takes the creator into
 * Stripe-hosted onboarding. Links expire (~5 minutes); call this fresh
 * each time the creator clicks "Start" or "Continue".
 *
 * Stripe redirects to `return_url` on completion (or close), and to
 * `refresh_url` if the link has expired.
 */
export async function createOnboardingLink(stripeAccountId: string): Promise<string> {
  const stripe = getStripe();
  const env = getEnv();
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: 'account_onboarding',
    return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/connect/return`,
    refresh_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/connect/refresh`,
  });
  return link.url;
}

/**
 * Capability flags lifted from a Stripe Account object. Mirrors the
 * shape persisted in `creator_profiles` so the webhook handler can pass
 * the result straight to a DB update.
 */
export type ConnectAccountStatus = {
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
};

export function readAccountStatus(account: {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}): ConnectAccountStatus {
  return {
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
  };
}
