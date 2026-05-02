import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { pledgeTransactions, pledges } from '@bgcf/db';
import { getDb } from '../../db';
import { getStripe } from '../client';

/**
 * `payment_intent.succeeded` — the off-session charge from charge_pledge
 * landed. Write the audit row using the *actual* Stripe fee from the
 * BalanceTransaction (not our forward-looking estimate), and flip the
 * pledge to `charged`.
 *
 * Why fetch the BalanceTransaction:
 *   The Charge object on a PI gives us a `balance_transaction` id but
 *   not the fee itself. The BalanceTransaction has the canonical `fee`
 *   field (in the same currency, in the smallest unit). We only need
 *   one extra round-trip per pledge — acceptable for the charge cadence
 *   we expect (few hundred per campaign, fanned out at 50/sec).
 */
export async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const stripe = getStripe();
  const db = getDb();

  // Resolve the latest Charge on the PI; it carries the BalanceTransaction.
  const charge = pi.latest_charge
    ? typeof pi.latest_charge === 'string'
      ? await stripe.charges.retrieve(pi.latest_charge)
      : pi.latest_charge
    : null;

  if (!charge) {
    throw new Error(`payment_intent_no_charge:${pi.id}`);
  }

  const balanceTxnId =
    typeof charge.balance_transaction === 'string'
      ? charge.balance_transaction
      : (charge.balance_transaction?.id ?? null);
  const stripeFeePence = balanceTxnId
    ? (await stripe.balanceTransactions.retrieve(balanceTxnId)).fee
    : 0;

  // Application fee = our platform_fee_amount, set when we created the PI.
  const platformFeePence =
    typeof pi.application_fee_amount === 'number' ? pi.application_fee_amount : 0;
  const grossPence = pi.amount;
  const netToCreatorPence = Math.max(0, grossPence - stripeFeePence - platformFeePence);

  // applied_fee_pct is in PI metadata (set by charge_pledge). Best-effort
  // — fall back to grossPence > 0 derived value if missing.
  const appliedFeePctRaw = pi.metadata?.applied_fee_pct;
  const appliedFeePct = appliedFeePctRaw
    ? Number(appliedFeePctRaw)
    : grossPence > 0
      ? platformFeePence / grossPence
      : 0;

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(pledges)
      .set({
        status: 'charged',
        stripePaymentIntentId: pi.id,
        chargedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(pledges.stripePaymentIntentId, pi.id))
      .returning({ id: pledges.id });

    const pledge = updated[0];
    if (!pledge) {
      // Race: charge_pledge might not have persisted the PI id yet, OR
      // the PI metadata.pledge_id is the only link. Try metadata.
      const pledgeIdFromMetadata = pi.metadata?.pledge_id;
      if (!pledgeIdFromMetadata) {
        throw new Error(`pledge_not_found_for_pi:${pi.id}`);
      }
      const updatedById = await tx
        .update(pledges)
        .set({
          status: 'charged',
          stripePaymentIntentId: pi.id,
          chargedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(pledges.id, pledgeIdFromMetadata))
        .returning({ id: pledges.id });
      if (!updatedById[0]) throw new Error(`pledge_not_found_for_pi:${pi.id}`);

      await tx.insert(pledgeTransactions).values({
        pledgeId: updatedById[0].id,
        kind: 'charge',
        grossPence,
        stripeFeePence,
        platformFeePence,
        netToCreatorPence,
        appliedFeePct: String(appliedFeePct),
        stripeChargeId: charge.id,
        stripePaymentIntentId: pi.id,
      });
      return;
    }

    await tx.insert(pledgeTransactions).values({
      pledgeId: pledge.id,
      kind: 'charge',
      grossPence,
      stripeFeePence,
      platformFeePence,
      netToCreatorPence,
      appliedFeePct: String(appliedFeePct),
      stripeChargeId: charge.id,
      stripePaymentIntentId: pi.id,
    });
  });
}

/**
 * `payment_intent.payment_failed` — Stripe gave up on the off-session
 * charge (decline, expired card, etc.). Flip the pledge to `failed` so
 * the dashboard can surface the gap. The charge_pledge handler may have
 * already done this for `StripeCardError` failures; if so, this is a
 * no-op via the WHERE clause.
 */
export async function handlePaymentIntentFailed(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const db = getDb();

  await db
    .update(pledges)
    .set({ status: 'failed', stripePaymentIntentId: pi.id, updatedAt: sql`now()` })
    .where(eq(pledges.stripePaymentIntentId, pi.id));
}
