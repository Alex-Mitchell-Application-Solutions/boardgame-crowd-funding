import { and, eq, sql } from 'drizzle-orm';
import { campaigns, pledges, pricingConfig, type CampaignStatus } from '@bgcf/db';
import { getDb } from '../db';
import { resolvePlatformFeePct } from '../lib/fees';
import { QUEUES, type ChargePledgePayload, type FinalizeCampaignPayload } from '../queues';

export type EnqueueChargePledge = (payload: ChargePledgePayload) => Promise<void>;

/**
 * Handler for the `finalize_campaign` job. Decides whether the campaign
 * hit its goal and either fans out `charge_pledge` jobs or cancels every
 * pending pledge.
 *
 * Transactional shape:
 *   1. Lock the campaign row (FOR UPDATE) so concurrent finalize attempts
 *      serialise — pg-boss may retry if a previous instance crashed
 *      mid-fan-out, and Railway cron can fire overlapping invocations.
 *   2. Bail if the row's already past `live` — defensive; the cron-level
 *      query also filters on `status = 'live'`.
 *   3. Snapshot pricing into the job payload for every pledge. We use the
 *      campaign's `fee_override_pct` if present, else the global config.
 *   4. Goal hit → status='succeeded', launch one `charge_pledge` per
 *      pending pledge. Goal missed → status='failed', flip pending pledges
 *      to `cancelled` (no charge attempted).
 *
 * Charge fan-out is fire-and-forget: each `charge_pledge` job runs
 * independently and writes its own audit row. The webhook handlers
 * reconcile success/failure against the pledge row.
 */
export async function handleFinalizeCampaign(
  payload: FinalizeCampaignPayload,
  enqueueChargePledge: EnqueueChargePledge,
): Promise<{ outcome: 'succeeded' | 'failed' | 'already_finalized'; pledgesAffected: number }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const campaignRows = await tx
      .select({
        id: campaigns.id,
        status: campaigns.status,
        goalPence: campaigns.goalPence,
        totalPledgedPence: campaigns.totalPledgedPence,
        feeOverridePct: campaigns.feeOverridePct,
        deadlineAt: campaigns.deadlineAt,
      })
      .from(campaigns)
      .where(eq(campaigns.id, payload.campaignId))
      .for('update')
      .limit(1);

    const campaign = campaignRows[0];
    if (!campaign) throw new Error(`campaign_not_found:${payload.campaignId}`);
    if (campaign.status !== 'live') {
      return { outcome: 'already_finalized' as const, pledgesAffected: 0 };
    }

    const goalHit = campaign.totalPledgedPence >= campaign.goalPence;
    const newStatus: CampaignStatus = goalHit ? 'succeeded' : 'failed';

    if (goalHit) {
      // Snapshot fee pricing once and pass it to every charge_pledge job.
      const config = await tx.select().from(pricingConfig).where(eq(pricingConfig.id, 1)).limit(1);
      const cfg = config[0];
      if (!cfg) throw new Error('pricing_config_missing');
      const appliedFeePct = resolvePlatformFeePct({
        globalPlatformFeePct: Number(cfg.platformFeePct),
        campaignFeeOverridePct: campaign.feeOverridePct ? Number(campaign.feeOverridePct) : null,
      });
      const pricingSnapshot = {
        appliedFeePct,
        stripeFeePct: Number(cfg.stripeFeePct),
        stripeFeeFixedPence: cfg.stripeFeeFixedPence,
      };

      const pendingPledges = await tx
        .select({ id: pledges.id })
        .from(pledges)
        .where(and(eq(pledges.campaignId, campaign.id), eq(pledges.status, 'pending')));

      // Flip campaign first so user-visible state reflects "succeeded"
      // immediately. Charges land asynchronously over the next minutes.
      await tx
        .update(campaigns)
        .set({
          status: newStatus,
          finalizedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(campaigns.id, campaign.id));

      // Enqueue all the per-pledge jobs. pg-boss inserts run inside the
      // outer transaction (it talks to the same Postgres) — if any fail,
      // the whole finalize rolls back and pg-boss retries the
      // finalize_campaign job from scratch.
      for (const pledge of pendingPledges) {
        await enqueueChargePledge({
          pledgeId: pledge.id,
          pricingSnapshot,
        });
      }

      return { outcome: 'succeeded' as const, pledgesAffected: pendingPledges.length };
    }

    // Goal missed → flip the campaign + cancel pending pledges. No
    // PaymentIntents created; backers' cards never charged.
    const cancelled = await tx
      .update(pledges)
      .set({
        status: 'cancelled',
        cancelledAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(pledges.campaignId, campaign.id), eq(pledges.status, 'pending')))
      .returning({ id: pledges.id });

    await tx
      .update(campaigns)
      .set({
        status: newStatus,
        finalizedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(campaigns.id, campaign.id));

    return { outcome: 'failed' as const, pledgesAffected: cancelled.length };
  });
}

// Re-export queue name for the cron entrypoint to use.
export const FINALIZE_CAMPAIGN_QUEUE = QUEUES.finalizeCampaign;
