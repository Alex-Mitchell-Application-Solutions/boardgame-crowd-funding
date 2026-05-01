import { describe, expect, it } from 'vitest';
import type { CampaignStatus } from '@bgcf/db';
import { assertTransition, canTransition, IllegalTransitionError } from './state';

describe('campaign state machine', () => {
  it.each<[CampaignStatus, CampaignStatus]>([
    ['draft', 'live'],
    ['draft', 'cancelled'],
    ['draft', 'hidden'],
    ['live', 'succeeded'],
    ['live', 'failed'],
    ['live', 'cancelled'],
    ['succeeded', 'hidden'],
    ['failed', 'hidden'],
    ['hidden', 'live'],
    ['hidden', 'succeeded'],
    ['hidden', 'failed'],
  ])('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each<[CampaignStatus, CampaignStatus]>([
    ['draft', 'succeeded'],
    ['draft', 'failed'],
    ['live', 'draft'],
    ['live', 'hidden'],
    ['succeeded', 'live'],
    ['succeeded', 'failed'],
    ['failed', 'live'],
    ['failed', 'succeeded'],
    ['cancelled', 'live'],
    ['cancelled', 'draft'],
  ])('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
  });

  it('rejects identity transitions', () => {
    expect(canTransition('draft', 'draft')).toBe(false);
    expect(() => assertTransition('live', 'live')).toThrow(IllegalTransitionError);
  });

  it('cancelled is terminal', () => {
    const allTargets: CampaignStatus[] = [
      'draft',
      'live',
      'succeeded',
      'failed',
      'cancelled',
      'hidden',
    ];
    for (const target of allTargets) {
      expect(canTransition('cancelled', target)).toBe(false);
    }
  });
});
