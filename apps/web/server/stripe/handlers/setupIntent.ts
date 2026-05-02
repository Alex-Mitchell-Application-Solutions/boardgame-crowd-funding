import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { campaigns, notifications, pledges } from '@bgcf/db';
import { getDb } from '../../db';
import { buildNotification } from '../../notifications/lib/factories';

/**
 * `setup_intent.succeeded` — Stripe has saved the backer's card. We persist
 * the resulting payment method id on the pledge so the M6 finalize cron can
 * charge it off-session at deadline. We also bump the campaign's
 * denormalised totals so the public `/c/[slug]` and `/browse` pages reflect
 * the new pledge without re-aggregating on every render.
 *
 * Tier `quantity_claimed` is NOT touched here — it was already incremented
 * inside the createPledgeSetupIntent transaction. That's deliberate: a
 * pledge whose SetupIntent never confirms (backer abandons the form) keeps
 * its seat reserved until cancelPledge or campaign-end cleanup releases it.
 */
export async function handleSetupIntentSucceeded(event: Stripe.Event): Promise<void> {
  const setupIntent = event.data.object as Stripe.SetupIntent;
  const paymentMethodId =
    typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : (setupIntent.payment_method?.id ?? null);

  if (!paymentMethodId) {
    console.warn(`[stripe.setup_intent.succeeded] no payment method on ${setupIntent.id}`);
    return;
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(pledges)
      .set({
        stripePaymentMethodId: paymentMethodId,
        updatedAt: sql`now()`,
      })
      .where(eq(pledges.stripeSetupIntentId, setupIntent.id))
      .returning({
        id: pledges.id,
        backerId: pledges.backerId,
        campaignId: pledges.campaignId,
        amountPence: pledges.amountPence,
      });

    const pledge = updated[0];
    if (!pledge) {
      // Race with the Server Action that just inserted the pledge — Stripe
      // can fire the webhook before our update lands. The webhook's
      // transactional idempotency will roll us back; Stripe's retry will
      // succeed on the next attempt.
      throw new Error(
        `pledge_not_found_for_setup_intent:${setupIntent.id} — webhook arrived before insert; will retry`,
      );
    }

    const campaignRows = await tx
      .update(campaigns)
      .set({
        totalPledgedPence: sql`${campaigns.totalPledgedPence} + ${pledge.amountPence}`,
        pledgeCount: sql`${campaigns.pledgeCount} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(campaigns.id, pledge.campaignId))
      .returning({
        title: campaigns.title,
        slug: campaigns.slug,
      });
    const campaign = campaignRows[0];

    if (campaign) {
      await tx.insert(notifications).values(
        buildNotification({
          userId: pledge.backerId,
          kind: 'pledge_confirmed',
          payload: {
            pledgeId: pledge.id,
            campaignId: pledge.campaignId,
            campaignTitle: campaign.title,
            campaignSlug: campaign.slug,
            amountPence: pledge.amountPence,
          },
        }),
      );
    }
  });
}

/**
 * `setup_intent.setup_failed` — backer's card setup failed (declined, 3DS
 * abandonment, etc.). Flip the pledge to `failed` so the dashboard surfaces
 * the retry CTA. The tier quota stays reserved so the backer can retry
 * with a different card without losing their seat — matches Kickstarter
 * behaviour where pledge slots stay held during card-fix windows.
 */
export async function handleSetupIntentFailed(event: Stripe.Event): Promise<void> {
  const setupIntent = event.data.object as Stripe.SetupIntent;
  const db = getDb();
  const updated = await db
    .update(pledges)
    .set({ status: 'failed', updatedAt: sql`now()` })
    .where(eq(pledges.stripeSetupIntentId, setupIntent.id))
    .returning({ id: pledges.id });

  if (updated.length === 0) {
    console.warn(`[stripe.setup_intent.setup_failed] no pledge for ${setupIntent.id}`);
  }
}
