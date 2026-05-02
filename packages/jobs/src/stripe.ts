import Stripe from 'stripe';
import { getWorkerEnv } from './env';

let cached: Stripe | undefined;

export function getStripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(getWorkerEnv().STRIPE_SECRET_KEY, { typescript: true });
  return cached;
}
