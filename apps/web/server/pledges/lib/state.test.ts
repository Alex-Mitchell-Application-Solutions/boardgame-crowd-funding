import { describe, expect, it } from 'vitest';
import type { PledgeStatusValue } from '@bgcf/db';
import { assertTransition, canTransition, IllegalPledgeTransitionError } from './state';

describe('pledge state machine', () => {
  it.each<[PledgeStatusValue, PledgeStatusValue]>([
    ['pending', 'charged'],
    ['pending', 'failed'],
    ['pending', 'cancelled'],
    ['charged', 'refunded'],
    ['failed', 'pending'],
  ])('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each<[PledgeStatusValue, PledgeStatusValue]>([
    ['pending', 'refunded'],
    ['charged', 'failed'],
    ['charged', 'pending'],
    ['failed', 'charged'],
    ['failed', 'cancelled'],
    ['refunded', 'pending'],
    ['refunded', 'charged'],
    ['cancelled', 'pending'],
  ])('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(IllegalPledgeTransitionError);
  });

  it('refunded and cancelled are terminal', () => {
    const all: PledgeStatusValue[] = ['pending', 'charged', 'failed', 'refunded', 'cancelled'];
    for (const target of all) {
      expect(canTransition('refunded', target)).toBe(false);
      expect(canTransition('cancelled', target)).toBe(false);
    }
  });

  it('rejects identity transitions', () => {
    expect(canTransition('pending', 'pending')).toBe(false);
    expect(canTransition('charged', 'charged')).toBe(false);
  });
});
