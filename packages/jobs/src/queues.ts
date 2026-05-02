// Job queue names and typed payloads. Centralised so the cron entrypoint
// (in apps/web) and the worker handlers (here) can't drift on shape.
//
// All payloads are plain JSON-serialisable objects since pg-boss persists
// them to a Postgres table. No Date instances — use ISO strings.

export const QUEUES = {
  finalizeCampaign: 'finalize_campaign',
  chargePledge: 'charge_pledge',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type FinalizeCampaignPayload = {
  campaignId: string;
};

/**
 * Payload for a single pledge charge. The pricing snapshot is captured at
 * `finalize_campaign` time so every pledge in a campaign settles at the
 * same fee rate even if `pricing_config` is updated mid-fan-out.
 */
export type ChargePledgePayload = {
  pledgeId: string;
  /** Snapshot taken at finalize time — drives the actual fee maths. */
  pricingSnapshot: {
    appliedFeePct: number;
    stripeFeePct: number;
    stripeFeeFixedPence: number;
  };
};

export type QueuePayloadMap = {
  [QUEUES.finalizeCampaign]: FinalizeCampaignPayload;
  [QUEUES.chargePledge]: ChargePledgePayload;
};
