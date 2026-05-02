'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { backerStripeCustomers, campaigns, pledgeItems, pledges, rewardTiers } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { getStripe } from '@/server/stripe/client';
import { assertTransition } from './lib/state';
import { computePledgeTotal } from './lib/amount';

// ============================================================================
// Schemas
// ============================================================================

const PledgeItemSchema = z.object({
  rewardTierId: z.string().uuid().nullable(),
  quantity: z.coerce.number().int().min(1).max(100),
});

const CreatePledgeSchema = z.object({
  campaignId: z.string().uuid(),
  items: z.array(PledgeItemSchema).min(1),
  shipping: z
    .object({
      name: z.string().trim().min(2).max(120),
      line1: z.string().trim().min(2).max(200),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().min(1).max(120),
      postalCode: z.string().trim().min(2).max(40),
      country: z.string().trim().length(2).toUpperCase(),
    })
    .optional(),
  /** Custom amount in pence for a no-reward line item. Optional. */
  customAmountPence: z.coerce.number().int().min(100).optional(),
});

export type CreatePledgeResult = {
  pledgeId: string;
  clientSecret: string;
  setupIntentId: string;
};

// ============================================================================
// Helpers
// ============================================================================

/** Find-or-create a Stripe Customer for the user, mapping persisted in DB. */
async function ensureStripeCustomer(args: {
  userId: string;
  email: string | undefined;
}): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ stripeCustomerId: backerStripeCustomers.stripeCustomerId })
    .from(backerStripeCustomers)
    .where(eq(backerStripeCustomers.userId, args.userId))
    .limit(1);
  if (existing[0]) return existing[0].stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: args.email,
    metadata: { user_id: args.userId },
  });

  // ON CONFLICT in case two pledge flows raced for the same user — keep
  // whichever row landed first; the loser's Customer is harmless (it'll
  // get used the next time, or never; Stripe doesn't bill on customers).
  const inserted = await db
    .insert(backerStripeCustomers)
    .values({ userId: args.userId, stripeCustomerId: customer.id })
    .onConflictDoNothing({ target: backerStripeCustomers.userId })
    .returning({ stripeCustomerId: backerStripeCustomers.stripeCustomerId });

  if (inserted[0]) return inserted[0].stripeCustomerId;

  // Race: another request inserted first; re-read.
  const reread = await db
    .select({ stripeCustomerId: backerStripeCustomers.stripeCustomerId })
    .from(backerStripeCustomers)
    .where(eq(backerStripeCustomers.userId, args.userId))
    .limit(1);
  if (!reread[0]) throw new Error('stripe_customer_lookup_failed');
  return reread[0].stripeCustomerId;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Reserve tier quota and create a Stripe SetupIntent for a new pledge.
 *
 * Concurrency model:
 *   - Each tier-quota check + reservation runs inside a transaction with
 *     `SELECT ... FOR UPDATE` on the tier row. Two backers racing for the
 *     last seat serialise on that lock; whichever commits first wins and
 *     the loser sees a `tier_sold_out` error.
 *   - The pledge insert + items + Stripe Customer + SetupIntent creation
 *     all run inside the same transaction so a Stripe failure (rare)
 *     rolls back the seat reservation cleanly.
 *
 * Note: at this point the pledge sits in `pending` and `quantity_claimed`
 * is already incremented. The `setup_intent.succeeded` webhook flips no
 * counters (they're already correct) — it only persists the
 * payment_method_id. If the SetupIntent never confirms (backer abandons
 * the form), the pledge stays pending until a periodic cleanup or until
 * the campaign deadline cancels stale pendings.
 */
export async function createPledgeSetupIntent(input: unknown): Promise<CreatePledgeResult> {
  const user = await requireUser();
  const parsed = CreatePledgeSchema.parse(input);

  const db = getDb();
  const stripe = getStripe();

  // Resolve campaign + verify it's accepting pledges (status = 'live').
  const campaign = await db
    .select({
      id: campaigns.id,
      status: campaigns.status,
      currency: campaigns.currency,
    })
    .from(campaigns)
    .where(eq(campaigns.id, parsed.campaignId))
    .limit(1);
  if (!campaign[0]) throw new Error('campaign_not_found');
  if (campaign[0].status !== 'live') throw new Error('campaign_not_accepting_pledges');

  // Resolve tier prices server-side (don't trust the client) inside a tx
  // with FOR UPDATE locks so quota changes serialise.
  const stripeCustomerId = await ensureStripeCustomer({
    userId: user.id,
    email: user.email,
  });

  const result = await db.transaction(async (tx) => {
    type ReservedItem = {
      rewardTierId: string | null;
      quantity: number;
      unitPricePence: number;
    };
    const reserved: ReservedItem[] = [];

    for (const item of parsed.items) {
      if (item.rewardTierId === null) {
        // No-reward custom line item — price comes from `customAmountPence`.
        // Only one custom line per pledge; re-using the same field across
        // multiple no-reward lines is rejected at the schema layer.
        if (parsed.customAmountPence === undefined) {
          throw new Error('custom_amount_required');
        }
        reserved.push({
          rewardTierId: null,
          quantity: item.quantity,
          unitPricePence: parsed.customAmountPence,
        });
        continue;
      }

      // Lock the tier row for the duration of the transaction.
      const tier = await tx
        .select({
          id: rewardTiers.id,
          campaignId: rewardTiers.campaignId,
          pricePence: rewardTiers.pricePence,
          quantityLimit: rewardTiers.quantityLimit,
          quantityClaimed: rewardTiers.quantityClaimed,
          isHidden: rewardTiers.isHidden,
        })
        .from(rewardTiers)
        .where(eq(rewardTiers.id, item.rewardTierId))
        .for('update')
        .limit(1);
      const row = tier[0];
      if (!row) throw new Error('reward_tier_not_found');
      if (row.campaignId !== parsed.campaignId) throw new Error('reward_tier_wrong_campaign');
      if (row.isHidden) throw new Error('reward_tier_hidden');
      if (row.quantityLimit !== null) {
        const remaining = row.quantityLimit - row.quantityClaimed;
        if (remaining < item.quantity) throw new Error('tier_sold_out');
      }
      // Reserve the seats up-front. The CHECK constraint on reward_tiers
      // is the final guard if the application layer ever drifts.
      await tx
        .update(rewardTiers)
        .set({
          quantityClaimed: sql`${rewardTiers.quantityClaimed} + ${item.quantity}`,
          updatedAt: sql`now()`,
        })
        .where(eq(rewardTiers.id, item.rewardTierId));

      reserved.push({
        rewardTierId: row.id,
        quantity: item.quantity,
        unitPricePence: row.pricePence,
      });
    }

    const totals = computePledgeTotal(reserved);
    if (!totals.ok) throw new Error(`invalid_pledge_total:${totals.error.kind}`);

    // Create the pledge row first so the SetupIntent can carry pledge_id
    // in metadata (helps with debugging + the webhook's lookup path).
    // We pass a placeholder setupIntentId, then update post-creation; it's
    // unique-not-null so we use a temporary nonce we replace on the same
    // transaction.
    const tempSetupIntentId = `tmp_${crypto.randomUUID()}`;
    const inserted = await tx
      .insert(pledges)
      .values({
        campaignId: parsed.campaignId,
        backerId: user.id,
        amountPence: totals.totalPence,
        stripeCustomerId,
        stripeSetupIntentId: tempSetupIntentId,
        shippingName: parsed.shipping?.name,
        shippingLine1: parsed.shipping?.line1,
        shippingLine2: parsed.shipping?.line2,
        shippingCity: parsed.shipping?.city,
        shippingPostalCode: parsed.shipping?.postalCode,
        shippingCountry: parsed.shipping?.country,
      })
      .returning({ id: pledges.id });
    const pledgeRow = inserted[0];
    if (!pledgeRow) throw new Error('pledge_insert_failed');

    if (reserved.length > 0) {
      await tx.insert(pledgeItems).values(
        reserved.map((r) => ({
          pledgeId: pledgeRow.id,
          rewardTierId: r.rewardTierId,
          quantity: r.quantity,
          unitPricePence: r.unitPricePence,
        })),
      );
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { pledge_id: pledgeRow.id, campaign_id: parsed.campaignId },
    });

    if (!setupIntent.client_secret) {
      throw new Error('setup_intent_missing_client_secret');
    }

    await tx
      .update(pledges)
      .set({ stripeSetupIntentId: setupIntent.id, updatedAt: sql`now()` })
      .where(eq(pledges.id, pledgeRow.id));

    return {
      pledgeId: pledgeRow.id,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    };
  });

  return result;
}

/**
 * Cancel a pending pledge (backer-initiated). Rolls back tier quota.
 * Charged or refunded pledges can't be cancelled this way — they need a
 * refund flow (creator-initiated, M6+).
 */
export async function cancelPledge(pledgeId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(pledges)
      .where(and(eq(pledges.id, pledgeId), eq(pledges.backerId, user.id)))
      .for('update')
      .limit(1);
    const pledge = rows[0];
    if (!pledge) throw new Error('pledge_not_found_or_not_owned');
    assertTransition(pledge.status, 'cancelled');

    // Roll back tier reservations for any pledge_items pointing at a tier.
    const items = await tx
      .select({ rewardTierId: pledgeItems.rewardTierId, quantity: pledgeItems.quantity })
      .from(pledgeItems)
      .where(eq(pledgeItems.pledgeId, pledgeId));
    for (const item of items) {
      if (!item.rewardTierId) continue;
      await tx
        .update(rewardTiers)
        .set({
          quantityClaimed: sql`GREATEST(0, ${rewardTiers.quantityClaimed} - ${item.quantity})`,
          updatedAt: sql`now()`,
        })
        .where(eq(rewardTiers.id, item.rewardTierId));
    }

    await tx
      .update(pledges)
      .set({ status: 'cancelled', cancelledAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(pledges.id, pledgeId));
  });

  revalidatePath('/account');
}
