import type { CampaignStatus } from '@bgcf/db';

// Pure status-transition state machine. The Server Action that invokes a
// transition (`publishCampaign`, finalize cron, etc.) calls
// `assertTransition(from, to)` before issuing the UPDATE. Centralising the
// rules here keeps the contract testable and makes invalid state changes
// loud failures rather than data drift.
//
// Allowed transitions:
//
//   draft     → live | cancelled | hidden
//   live      → succeeded | failed | cancelled       (cancelled = creator-pulled mid-campaign)
//   succeeded → hidden                               (admin moderation only)
//   failed    → hidden                               (admin moderation only)
//   cancelled → (terminal)
//   hidden    → live | succeeded | failed             (admin un-hide, revert to prior state)

const allowed: Record<CampaignStatus, ReadonlySet<CampaignStatus>> = {
  draft: new Set<CampaignStatus>(['live', 'cancelled', 'hidden']),
  live: new Set<CampaignStatus>(['succeeded', 'failed', 'cancelled']),
  succeeded: new Set<CampaignStatus>(['hidden']),
  failed: new Set<CampaignStatus>(['hidden']),
  cancelled: new Set<CampaignStatus>(),
  hidden: new Set<CampaignStatus>(['live', 'succeeded', 'failed']),
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: CampaignStatus,
    public readonly to: CampaignStatus,
  ) {
    super(`Illegal campaign status transition: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return allowed[from].has(to);
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}
