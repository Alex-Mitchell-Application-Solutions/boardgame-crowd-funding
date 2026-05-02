import { describe, expect, it } from 'vitest';
import { computePledgeTotal, PLEDGE_AMOUNT_LIMITS } from './amount';

describe('computePledgeTotal', () => {
  it('sums a single tier line', () => {
    expect(computePledgeTotal([{ unitPricePence: 2500, quantity: 1 }])).toEqual({
      ok: true,
      totalPence: 2500,
    });
  });

  it('sums multiple lines', () => {
    expect(
      computePledgeTotal([
        { unitPricePence: 2500, quantity: 2 },
        { unitPricePence: 1000, quantity: 1 },
      ]),
    ).toEqual({ ok: true, totalPence: 6000 });
  });

  it('allows a zero-priced line as long as total clears the minimum', () => {
    expect(
      computePledgeTotal([
        { unitPricePence: 0, quantity: 1 }, // free add-on
        { unitPricePence: 2500, quantity: 1 },
      ]),
    ).toEqual({ ok: true, totalPence: 2500 });
  });

  it('rejects empty pledges', () => {
    expect(computePledgeTotal([])).toEqual({ ok: false, error: { kind: 'no_items' } });
  });

  it('rejects below-minimum totals', () => {
    expect(computePledgeTotal([{ unitPricePence: 50, quantity: 1 }])).toEqual({
      ok: false,
      error: {
        kind: 'total_below_minimum',
        minimumPence: PLEDGE_AMOUNT_LIMITS.MIN_PLEDGE_PENCE,
      },
    });
  });

  it('rejects non-integer or zero quantity', () => {
    expect(computePledgeTotal([{ unitPricePence: 2500, quantity: 0 }])).toMatchObject({
      ok: false,
      error: { kind: 'invalid_quantity', index: 0 },
    });
    expect(computePledgeTotal([{ unitPricePence: 2500, quantity: 1.5 }])).toMatchObject({
      ok: false,
      error: { kind: 'invalid_quantity', index: 0 },
    });
  });

  it('rejects negative unit price', () => {
    expect(computePledgeTotal([{ unitPricePence: -100, quantity: 1 }])).toMatchObject({
      ok: false,
      error: { kind: 'negative_unit_price', index: 0 },
    });
  });

  it('reports the index of the offending item', () => {
    const result = computePledgeTotal([
      { unitPricePence: 2500, quantity: 1 },
      { unitPricePence: 1000, quantity: 0 },
    ]);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_quantity', index: 1 } });
  });
});
