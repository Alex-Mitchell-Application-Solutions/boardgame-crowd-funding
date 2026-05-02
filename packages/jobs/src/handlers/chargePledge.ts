import { eq, sql } from 'drizzle-orm';
import { campaigns, creatorProfiles, pledges } from '@bgcf/db';
import { getDb } from '../db';
import { getStripe } from '../stripe';
import { calculatePledgeFees } from '../lib/fees';
import { type ChargePledgePayload } from '../queues';

/**
 * Charge one pledge off-session via Stripe Connect. The pricing snapshot
 * was captured by `finalize_campaign` so every pledge in the campaign
 * settles at the same rate even if `pricing_config` is updated mid-run.
 *
 * Stripe call shape:
 *   stripe.paymentIntents.create({
 *     amount, currency,
 *     customer, payment_method,
 *     off_session: true, confirm: true,
 *     application_fee_amount, // our platform cut
 *     transfer_data: { destination }, // creator's connected account
 *   })
 *
 * This action only INITIATES the charge. The actual reconciliation
 * (writing pledge_transactions, flipping pledge → 'charged') happens in
 * the `payment_intent.succeeded` / `payment_intent.payment_failed` webhook
 * handlers — those run with the *real* Stripe fee from BalanceTransaction.
 *
 * Retry semantics:
 *   - Transient errors (network blips, lock timeouts) → throw, pg-boss
 *     retries with exponential backoff.
 *   - Card declines (stripe error type === 'StripeCardError') → don't
 *     retry; flip the pledge to 'failed' here so the backer sees it
 *     immediately. Stripe will already have triggered a
 *     payment_intent.payment_failed webhook in parallel; that handler
 *     is a no-op when the pledge is already in 'failed'.
 */
export async function handleChargePledge(payload: ChargePledgePayload): Promise<void> {
  const db = getDb();
  const stripe = getStripe();

  // Pull everything we need in one round-trip — pledge + campaign +
  // creator's Connect account id.
  const rows = await db
    .select({
      pledge: pledges,
      campaignCurrency: campaigns.currency,
      campaignId: campaigns.id,
      creatorStripeAccountId: creatorProfiles.stripeAccountId,
    })
    .from(pledges)
    .innerJoin(campaigns, eq(campaigns.id, pledges.campaignId))
    .innerJoin(creatorProfiles, eq(creatorProfiles.userId, campaigns.creatorId))
    .where(eq(pledges.id, payload.pledgeId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error(`pledge_not_found:${payload.pledgeId}`);
  if (row.pledge.status !== 'pending') {
    // Already charged / cancelled / failed. Idempotent no-op.
    return;
  }
  if (!row.pledge.stripePaymentMethodId) {
    // SetupIntent never confirmed. Flip to failed so it doesn't sit
    // around blocking the campaign payout report.
    await db
      .update(pledges)
      .set({ status: 'failed', updatedAt: sql`now()` })
      .where(eq(pledges.id, row.pledge.id));
    return;
  }
  if (!row.creatorStripeAccountId) {
    // Connect onboarding incomplete on the creator's side. Should never
    // happen — publishCampaign() gates on charges_enabled. Defensive.
    throw new Error(`creator_stripe_account_missing:${row.pledge.id}`);
  }

  const fees = calculatePledgeFees({
    grossPence: row.pledge.amountPence,
    appliedFeePct: payload.pricingSnapshot.appliedFeePct,
    stripeFeePct: payload.pricingSnapshot.stripeFeePct,
    stripeFeeFixedPence: payload.pricingSnapshot.stripeFeeFixedPence,
  });

  try {
    const pi = await stripe.paymentIntents.create({
      amount: row.pledge.amountPence,
      currency: row.campaignCurrency,
      customer: row.pledge.stripeCustomerId,
      payment_method: row.pledge.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      application_fee_amount: fees.platformFeePence,
      transfer_data: { destination: row.creatorStripeAccountId },
      metadata: {
        pledge_id: row.pledge.id,
        campaign_id: row.campaignId,
        applied_fee_pct: String(payload.pricingSnapshot.appliedFeePct),
      },
    });

    // Persist the PI id straight away so the webhook can correlate even
    // if the worker crashes between this point and webhook arrival.
    await db
      .update(pledges)
      .set({ stripePaymentIntentId: pi.id, updatedAt: sql`now()` })
      .where(eq(pledges.id, row.pledge.id));
  } catch (err) {
    // Card declines are not retryable. Stripe types them as
    // StripeCardError or 'card_error' code; treat both as terminal.
    const errorObj = err as { type?: string; code?: string };
    const isCardError = errorObj.type === 'StripeCardError' || errorObj.code === 'card_declined';
    if (isCardError) {
      await db
        .update(pledges)
        .set({ status: 'failed', updatedAt: sql`now()` })
        .where(eq(pledges.id, row.pledge.id));
      return;
    }
    // Anything else is transient. Re-throw so pg-boss retries.
    throw err;
  }
}
