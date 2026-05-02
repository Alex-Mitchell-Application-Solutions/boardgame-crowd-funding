import { describe, expect, it } from 'vitest';
import { buildNotification, readPayload } from './factories';

describe('buildNotification', () => {
  it('produces a NewNotification with the expected fields', () => {
    const row = buildNotification({
      userId: 'user-1',
      kind: 'pledge_confirmed',
      payload: {
        pledgeId: 'pledge-1',
        campaignId: 'campaign-1',
        campaignTitle: 'Test',
        campaignSlug: 'test',
        amountPence: 2500,
      },
    });
    expect(row).toMatchObject({
      userId: 'user-1',
      kind: 'pledge_confirmed',
      payload: { amountPence: 2500 },
    });
  });

  it('handles every kind with its discriminated payload', () => {
    // Smoke-test that the factory accepts every kind without TypeScript
    // gymnastics at the call site.
    expect(
      buildNotification({
        userId: 'u',
        kind: 'campaign_succeeded',
        payload: { campaignId: 'c', campaignTitle: 't', campaignSlug: 's' },
      }).kind,
    ).toBe('campaign_succeeded');
    expect(
      buildNotification({
        userId: 'u',
        kind: 'comment_reply',
        payload: {
          campaignId: 'c',
          campaignSlug: 's',
          commentId: 'c1',
          parentCommentId: 'c0',
          actorId: 'a',
        },
      }).kind,
    ).toBe('comment_reply');
  });
});

describe('readPayload', () => {
  it('returns the typed payload when the kind matches', () => {
    const n = {
      kind: 'pledge_charged' as const,
      payload: {
        pledgeId: 'p',
        campaignId: 'c',
        campaignTitle: 't',
        campaignSlug: 's',
        amountPence: 100,
      },
    };
    expect(readPayload(n, 'pledge_charged').amountPence).toBe(100);
  });

  it('throws on kind mismatch', () => {
    const n = { kind: 'pledge_charged' as const, payload: {} };
    expect(() => readPayload(n, 'campaign_succeeded')).toThrow(/kind mismatch/);
  });
});
