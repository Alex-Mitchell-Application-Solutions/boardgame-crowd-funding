import type { PledgeStatusValue } from '@bgcf/db';

// Pure status-transition state machine for pledges. Mirrors the campaign
// state machine pattern (see ../campaigns/lib/state.ts).
//
// Allowed transitions:
//
//   pending   → charged | failed | cancelled
//   charged   → refunded
//   failed    → pending           (backer retries with a new payment method)
//   refunded  → (terminal)
//   cancelled → (terminal)

const allowed: Record<PledgeStatusValue, ReadonlySet<PledgeStatusValue>> = {
  pending: new Set<PledgeStatusValue>(['charged', 'failed', 'cancelled']),
  charged: new Set<PledgeStatusValue>(['refunded']),
  failed: new Set<PledgeStatusValue>(['pending']),
  refunded: new Set<PledgeStatusValue>(),
  cancelled: new Set<PledgeStatusValue>(),
};

export class IllegalPledgeTransitionError extends Error {
  constructor(
    public readonly from: PledgeStatusValue,
    public readonly to: PledgeStatusValue,
  ) {
    super(`Illegal pledge status transition: ${from} → ${to}`);
    this.name = 'IllegalPledgeTransitionError';
  }
}

export function canTransition(from: PledgeStatusValue, to: PledgeStatusValue): boolean {
  return allowed[from].has(to);
}

export function assertTransition(from: PledgeStatusValue, to: PledgeStatusValue): void {
  if (!canTransition(from, to)) {
    throw new IllegalPledgeTransitionError(from, to);
  }
}
