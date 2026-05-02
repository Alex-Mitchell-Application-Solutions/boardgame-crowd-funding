// Pure helpers for computing pledge totals from line items.

const MIN_PLEDGE_PENCE = 100; // £1 — also enforced by DB CHECK on pledges.amount_pence.

export type PledgeLineInput = {
  /** Frozen unit price in pence at pledge time. */
  unitPricePence: number;
  /** Quantity (>= 1). */
  quantity: number;
};

export type PledgeAmountError =
  | { kind: 'no_items' }
  | { kind: 'invalid_quantity'; index: number }
  | { kind: 'negative_unit_price'; index: number }
  | { kind: 'total_below_minimum'; minimumPence: number };

/**
 * Sum a pledge's line items into a total. Returns either the integer pence
 * total or a discriminated-error so the caller can surface a specific
 * message. Refuses zero-line pledges (a backer must claim at least one tier
 * or a no-reward custom amount line).
 */
export function computePledgeTotal(
  items: PledgeLineInput[],
): { ok: true; totalPence: number } | { ok: false; error: PledgeAmountError } {
  if (items.length === 0) return { ok: false, error: { kind: 'no_items' } };

  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return { ok: false, error: { kind: 'invalid_quantity', index: i } };
    }
    if (!Number.isInteger(item.unitPricePence) || item.unitPricePence < 0) {
      return { ok: false, error: { kind: 'negative_unit_price', index: i } };
    }
    total += item.quantity * item.unitPricePence;
  }

  if (total < MIN_PLEDGE_PENCE) {
    return { ok: false, error: { kind: 'total_below_minimum', minimumPence: MIN_PLEDGE_PENCE } };
  }

  return { ok: true, totalPence: total };
}

export const PLEDGE_AMOUNT_LIMITS = { MIN_PLEDGE_PENCE } as const;
