// Domain-rule validators for campaign create/update flows. Pure functions —
// Server Actions wrap these and translate failures into user-facing errors.

const MIN_GOAL_PENCE = 100; // £1 — also enforced by DB CHECK constraint.
const MIN_PLEDGE_PENCE = 100; // £1 — same floor for reward tier prices.

const MIN_DEADLINE_DAYS = 7;
const MAX_DEADLINE_DAYS = 90;

export type ValidationError =
  | { kind: 'goal_below_minimum'; minimumPence: number }
  | { kind: 'goal_not_integer' }
  | { kind: 'tier_price_below_minimum'; minimumPence: number }
  | { kind: 'tier_price_below_micropledge_threshold' }
  | { kind: 'deadline_too_soon'; minimumDays: number }
  | { kind: 'deadline_too_far'; maximumDays: number };

export function validateGoalPence(goalPence: number): ValidationError | null {
  if (!Number.isInteger(goalPence)) return { kind: 'goal_not_integer' };
  if (goalPence < MIN_GOAL_PENCE) {
    return { kind: 'goal_below_minimum', minimumPence: MIN_GOAL_PENCE };
  }
  return null;
}

export function validateTierPricePence(pricePence: number): ValidationError | null {
  if (!Number.isInteger(pricePence))
    return { kind: 'tier_price_below_minimum', minimumPence: MIN_PLEDGE_PENCE };
  if (pricePence < MIN_PLEDGE_PENCE) {
    return { kind: 'tier_price_below_minimum', minimumPence: MIN_PLEDGE_PENCE };
  }
  return null;
}

/**
 * Deadlines must be at least MIN_DEADLINE_DAYS away (give backers time to
 * pledge) and at most MAX_DEADLINE_DAYS away (long campaigns lose momentum
 * and tie up payment-method authorisations near their expiry — see
 * docs/PLAN.md "Card expiry between pledge and deadline").
 */
export function validateDeadline(deadlineAt: Date, now: Date = new Date()): ValidationError | null {
  const ms = deadlineAt.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < MIN_DEADLINE_DAYS) {
    return { kind: 'deadline_too_soon', minimumDays: MIN_DEADLINE_DAYS };
  }
  if (days > MAX_DEADLINE_DAYS) {
    return { kind: 'deadline_too_far', maximumDays: MAX_DEADLINE_DAYS };
  }
  return null;
}

export const VALIDATION_LIMITS = {
  MIN_GOAL_PENCE,
  MIN_PLEDGE_PENCE,
  MIN_DEADLINE_DAYS,
  MAX_DEADLINE_DAYS,
} as const;
