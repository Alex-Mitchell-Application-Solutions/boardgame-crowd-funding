import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { creatorProfiles } from '@bgcf/db';
import { getDb } from '../../db';
import { readAccountStatus } from '../connect';

/**
 * `account.updated` is the source of truth for Connect-account
 * capability flags. Stripe fires it whenever an account's verification
 * status, payouts, or charge capability changes. We mirror the relevant
 * flags onto `creator_profiles` so app code can gate features (e.g.
 * draft → live campaign transition) without round-tripping to Stripe.
 *
 * Ordering: this can race with the Server Action that just wrote the
 * `stripe_account_id` onto the profile (Stripe sends `account.updated`
 * within milliseconds of `accounts.create`). If the row isn't found
 * yet, log and let pg-boss retries pick it up — for now, log and skip.
 */
export async function handleAccountUpdated(event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  const status = readAccountStatus(account);

  const db = getDb();
  const result = await db
    .update(creatorProfiles)
    .set({
      stripeChargesEnabled: status.stripeChargesEnabled,
      stripePayoutsEnabled: status.stripePayoutsEnabled,
      stripeDetailsSubmitted: status.stripeDetailsSubmitted,
      updatedAt: sql`now()`,
    })
    .where(eq(creatorProfiles.stripeAccountId, account.id))
    .returning({ userId: creatorProfiles.userId });

  if (result.length === 0) {
    // Race with profile creation, or webhook for a Connect account that
    // doesn't belong to us. Safe to skip — the next `account.updated`
    // will reconcile, and the daily reconcile cron (M2.x) will catch
    // any permanently dropped events.
    console.warn(`[stripe.account.updated] no creator_profile for account ${account.id}`);
  }
}
