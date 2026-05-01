import 'server-only';
import Stripe from 'stripe';
import { getEnv } from '../env';

let stripeClient: Stripe | null = null;

/**
 * Lazily-constructed Stripe SDK client bound to the platform's secret
 * key. Throws a clear error if STRIPE_SECRET_KEY is missing — env.ts
 * keeps it optional so build-time module loading doesn't crash, but
 * runtime callers always need it.
 */
export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY is required to use Stripe — see env.example and docs/SETUP.md.',
    );
  }
  stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
  });
  return stripeClient;
}
