import { describe, expect, it } from 'vitest';
import { readAccountStatus } from './connect';

describe('readAccountStatus', () => {
  it('coerces all-true Stripe Account flags', () => {
    expect(
      readAccountStatus({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    ).toEqual({
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
    });
  });

  it('coerces all-false Stripe Account flags', () => {
    expect(
      readAccountStatus({
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      }),
    ).toEqual({
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
    });
  });

  it('treats undefined flags as false', () => {
    expect(readAccountStatus({})).toEqual({
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
    });
  });

  it('handles a partially-onboarded account (charges only)', () => {
    expect(
      readAccountStatus({
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
      }),
    ).toEqual({
      stripeChargesEnabled: true,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: true,
    });
  });
});
