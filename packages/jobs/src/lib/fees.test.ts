import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculatePledgeFees, InvalidFeeInputError, resolvePlatformFeePct } from './fees';

const STRIPE_PCT = 0.015;
const STRIPE_FIXED = 20;
const PLATFORM_PCT = 0.03;

describe('calculatePledgeFees', () => {
  it('worked example: £25 pledge with default fees', () => {
    // gross = 2500p; platform = floor(2500 * 0.03) = 75p;
    // stripe = floor(2500 * 0.015) + 20 = 37 + 20 = 57p;
    // net = 2500 - 75 - 57 = 2368p (£23.68).
    expect(
      calculatePledgeFees({
        grossPence: 2500,
        appliedFeePct: PLATFORM_PCT,
        stripeFeePct: STRIPE_PCT,
        stripeFeeFixedPence: STRIPE_FIXED,
      }),
    ).toEqual({
      grossPence: 2500,
      platformFeePence: 75,
      stripeFeePence: 57,
      netToCreatorPence: 2368,
      appliedFeePct: PLATFORM_PCT,
    });
  });

  it('worked example: £100 pledge', () => {
    // platform = 300; stripe = 150 + 20 = 170; net = 9530.
    expect(
      calculatePledgeFees({
        grossPence: 10_000,
        appliedFeePct: PLATFORM_PCT,
        stripeFeePct: STRIPE_PCT,
        stripeFeeFixedPence: STRIPE_FIXED,
      }),
    ).toMatchObject({
      grossPence: 10_000,
      platformFeePence: 300,
      stripeFeePence: 170,
      netToCreatorPence: 9530,
    });
  });

  it('clamps stripe fee so net stays non-negative on tiny pledges', () => {
    // £0.30 pledge; platform = 0; stripe-raw = 0+20 = 20; cap = gross - platform = 30; result = 20.
    const small = calculatePledgeFees({
      grossPence: 30,
      appliedFeePct: PLATFORM_PCT,
      stripeFeePct: STRIPE_PCT,
      stripeFeeFixedPence: STRIPE_FIXED,
    });
    expect(small.netToCreatorPence).toBe(10);
    expect(small.platformFeePence + small.stripeFeePence + small.netToCreatorPence).toBe(30);
  });

  it('clamps stripe fee when fixed alone exceeds remaining room', () => {
    // £0.05 pledge; platform = 0; stripe-raw = 0+20 = 20; room = 5; stripe = 5; net = 0.
    const tiny = calculatePledgeFees({
      grossPence: 5,
      appliedFeePct: PLATFORM_PCT,
      stripeFeePct: STRIPE_PCT,
      stripeFeeFixedPence: STRIPE_FIXED,
    });
    expect(tiny).toEqual({
      grossPence: 5,
      platformFeePence: 0,
      stripeFeePence: 5,
      netToCreatorPence: 0,
      appliedFeePct: PLATFORM_PCT,
    });
  });

  it('per-campaign fee override is honoured', () => {
    const overridden = calculatePledgeFees({
      grossPence: 10_000,
      appliedFeePct: 0.0, // 0% — promotional override
      stripeFeePct: STRIPE_PCT,
      stripeFeeFixedPence: STRIPE_FIXED,
    });
    expect(overridden.platformFeePence).toBe(0);
    expect(overridden.netToCreatorPence).toBe(10_000 - 170);
  });

  it.each([
    [-1, 'gross negative'],
    [1.5, 'gross non-integer'],
  ])('rejects invalid grossPence: %s (%s)', (grossPence) => {
    expect(() =>
      calculatePledgeFees({
        grossPence,
        appliedFeePct: PLATFORM_PCT,
        stripeFeePct: STRIPE_PCT,
        stripeFeeFixedPence: STRIPE_FIXED,
      }),
    ).toThrow(InvalidFeeInputError);
  });

  it('rejects out-of-range fee percentages', () => {
    const base = {
      grossPence: 1000,
      stripeFeePct: STRIPE_PCT,
      stripeFeeFixedPence: STRIPE_FIXED,
    };
    expect(() => calculatePledgeFees({ ...base, appliedFeePct: -0.01 })).toThrow();
    expect(() => calculatePledgeFees({ ...base, appliedFeePct: 0.51 })).toThrow();
    expect(() =>
      calculatePledgeFees({ ...base, appliedFeePct: PLATFORM_PCT, stripeFeePct: 0.11 }),
    ).toThrow();
  });

  // ─────── Property-based ───────

  it('property: gross == platform + stripe + net for any valid input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 0.1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 1000 }),
        (gross, platformPct, stripePct, fixed) => {
          const result = calculatePledgeFees({
            grossPence: gross,
            appliedFeePct: platformPct,
            stripeFeePct: stripePct,
            stripeFeeFixedPence: fixed,
          });
          expect(result.platformFeePence + result.stripeFeePence + result.netToCreatorPence).toBe(
            gross,
          );
        },
      ),
    );
  });

  it('property: every fee component is a non-negative integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 0.1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 1000 }),
        (gross, platformPct, stripePct, fixed) => {
          const result = calculatePledgeFees({
            grossPence: gross,
            appliedFeePct: platformPct,
            stripeFeePct: stripePct,
            stripeFeeFixedPence: fixed,
          });
          for (const component of [
            result.platformFeePence,
            result.stripeFeePence,
            result.netToCreatorPence,
          ]) {
            expect(Number.isInteger(component)).toBe(true);
            expect(component).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });

  it('property: platformFee == floor(gross * pct)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
        (gross, pct) => {
          const result = calculatePledgeFees({
            grossPence: gross,
            appliedFeePct: pct,
            stripeFeePct: 0,
            stripeFeeFixedPence: 0,
          });
          expect(result.platformFeePence).toBe(Math.floor(gross * pct));
        },
      ),
    );
  });
});

describe('resolvePlatformFeePct', () => {
  it('uses the override when present', () => {
    expect(resolvePlatformFeePct({ globalPlatformFeePct: 0.03, campaignFeeOverridePct: 0.0 })).toBe(
      0.0,
    );
    expect(
      resolvePlatformFeePct({ globalPlatformFeePct: 0.03, campaignFeeOverridePct: 0.05 }),
    ).toBe(0.05);
  });

  it('falls back to global when no override', () => {
    expect(
      resolvePlatformFeePct({ globalPlatformFeePct: 0.03, campaignFeeOverridePct: null }),
    ).toBe(0.03);
  });
});
