import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { pledgeTransactions, pledges } from '@bgcf/db';
import { getDb } from '../../db';

/**
 * `charge.refunded` — fired after a successful refund (creator-initiated
 * via the refundPledge Server Action). We persist a refund-kind audit
 * row and flip the pledge to `refunded`.
 *
 * Stripe sends one charge.refunded event per refund, even for partial
 * refunds (we only support full refunds in v1, but the schema permits
 * partials so the audit row records the actual amount).
 */
export async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const db = getDb();

  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!piId) {
    console.warn(`[stripe.charge.refunded] no payment_intent on charge ${charge.id}`);
    return;
  }

  // The refund itself is the most recent one on the charge. Stripe
  // sends amount in the smallest unit.
  const refund = charge.refunds?.data?.[0];
  const refundAmount = refund?.amount ?? charge.amount_refunded;
  const refundId = refund?.id ?? null;

  await db.transaction(async (tx) => {
    const pledge = await tx
      .update(pledges)
      .set({ status: 'refunded', updatedAt: sql`now()` })
      .where(eq(pledges.stripePaymentIntentId, piId))
      .returning({ id: pledges.id });

    if (!pledge[0]) {
      console.warn(`[stripe.charge.refunded] no pledge for pi ${piId}`);
      return;
    }

    // For refunds, fees come back to us reverse-proportionally. We log
    // gross = refundAmount; stripe_fee + platform_fee = 0 in the simple
    // full-refund case (Stripe returns the application fee + reverses
    // the transfer). Audit row exists primarily as a record.
    await tx.insert(pledgeTransactions).values({
      pledgeId: pledge[0].id,
      kind: 'refund',
      grossPence: refundAmount,
      stripeFeePence: 0,
      platformFeePence: 0,
      netToCreatorPence: -refundAmount, // creator returns the funds.
      appliedFeePct: '0.0000',
      stripeChargeId: charge.id,
      stripePaymentIntentId: piId,
      stripeRefundId: refundId,
    });
  });
}
