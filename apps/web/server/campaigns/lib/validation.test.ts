import { describe, expect, it } from 'vitest';
import {
  validateDeadline,
  validateGoalPence,
  validateTierPricePence,
  VALIDATION_LIMITS,
} from './validation';

const DAY = 1000 * 60 * 60 * 24;
const NOW = new Date('2026-05-01T12:00:00Z');

describe('validateGoalPence', () => {
  it('accepts the minimum (£1)', () => {
    expect(validateGoalPence(VALIDATION_LIMITS.MIN_GOAL_PENCE)).toBeNull();
  });

  it('accepts a typical campaign goal (£10,000)', () => {
    expect(validateGoalPence(1_000_000)).toBeNull();
  });

  it('rejects below minimum', () => {
    expect(validateGoalPence(99)).toEqual({
      kind: 'goal_below_minimum',
      minimumPence: VALIDATION_LIMITS.MIN_GOAL_PENCE,
    });
  });

  it('rejects zero and negative', () => {
    expect(validateGoalPence(0)).toMatchObject({ kind: 'goal_below_minimum' });
    expect(validateGoalPence(-1)).toMatchObject({ kind: 'goal_below_minimum' });
  });

  it('rejects non-integer (fractions of a penny)', () => {
    expect(validateGoalPence(100.5)).toEqual({ kind: 'goal_not_integer' });
  });
});

describe('validateTierPricePence', () => {
  it('accepts the minimum and typical tier prices', () => {
    expect(validateTierPricePence(VALIDATION_LIMITS.MIN_PLEDGE_PENCE)).toBeNull();
    expect(validateTierPricePence(5_000)).toBeNull();
  });

  it('rejects below minimum', () => {
    expect(validateTierPricePence(50)).toMatchObject({ kind: 'tier_price_below_minimum' });
  });
});

describe('validateDeadline', () => {
  it('accepts a deadline at the minimum window', () => {
    const at = new Date(NOW.getTime() + VALIDATION_LIMITS.MIN_DEADLINE_DAYS * DAY + 1000);
    expect(validateDeadline(at, NOW)).toBeNull();
  });

  it('accepts a deadline at the maximum window', () => {
    const at = new Date(NOW.getTime() + VALIDATION_LIMITS.MAX_DEADLINE_DAYS * DAY - 1000);
    expect(validateDeadline(at, NOW)).toBeNull();
  });

  it('rejects deadlines too soon', () => {
    const at = new Date(NOW.getTime() + 6 * DAY);
    expect(validateDeadline(at, NOW)).toEqual({
      kind: 'deadline_too_soon',
      minimumDays: VALIDATION_LIMITS.MIN_DEADLINE_DAYS,
    });
  });

  it('rejects deadlines too far in the future', () => {
    const at = new Date(NOW.getTime() + 91 * DAY);
    expect(validateDeadline(at, NOW)).toEqual({
      kind: 'deadline_too_far',
      maximumDays: VALIDATION_LIMITS.MAX_DEADLINE_DAYS,
    });
  });

  it('rejects deadlines in the past', () => {
    const at = new Date(NOW.getTime() - DAY);
    expect(validateDeadline(at, NOW)).toMatchObject({ kind: 'deadline_too_soon' });
  });
});
