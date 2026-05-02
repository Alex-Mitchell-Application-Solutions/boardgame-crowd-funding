// Fee calculation for pledges. Pure function — no I/O, no rounding ambiguity.
// 100% covered by unit + property-based tests.
//
// Sum invariant: gross == platformFee + stripeFee + netToCreator.
// Rounding: platformFee = floor(gross * appliedFeePct). Stripe fee is
// estimated as floor(gross * stripeFeePct) + stripeFeeFixedPence (the
// authoritative value comes from BalanceTransaction.fee at webhook time
// and gets stored in pledge_transactions; this estimate is for
// forward-looking math only).

export type FeeInput = {
  /** Pledge amount in pence (>= 0). */
  grossPence: number;
  /** Platform fee fraction in [0, 0.5]. Applied to gross, floor-rounded. */
  appliedFeePct: number;
  /** Stripe fee fraction in [0, 0.1]. Applied to gross, floor-rounded. */
  stripeFeePct: number;
  /** Stripe fixed-fee component in pence (>= 0). */
  stripeFeeFixedPence: number;
};

export type FeeBreakdown = {
  grossPence: number;
  platformFeePence: number;
  stripeFeePence: number;
  netToCreatorPence: number;
  appliedFeePct: number;
};

export class InvalidFeeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFeeInputError';
  }
}

export function calculatePledgeFees(input: FeeInput): FeeBreakdown {
  if (!Number.isInteger(input.grossPence) || input.grossPence < 0) {
    throw new InvalidFeeInputError('grossPence must be a non-negative integer');
  }
  if (input.appliedFeePct < 0 || input.appliedFeePct > 0.5) {
    throw new InvalidFeeInputError('appliedFeePct must be in [0, 0.5]');
  }
  if (input.stripeFeePct < 0 || input.stripeFeePct > 0.1) {
    throw new InvalidFeeInputError('stripeFeePct must be in [0, 0.1]');
  }
  if (!Number.isInteger(input.stripeFeeFixedPence) || input.stripeFeeFixedPence < 0) {
    throw new InvalidFeeInputError('stripeFeeFixedPence must be a non-negative integer');
  }

  const platformFeePence = Math.floor(input.grossPence * input.appliedFeePct);
  const stripeFeeRaw =
    Math.floor(input.grossPence * input.stripeFeePct) + input.stripeFeeFixedPence;
  // Don't let estimate exceed gross - platform_fee (would produce a negative
  // creator payout). Tiny pledges where stripe_fixed alone overruns the gross
  // bottom out at "creator nets 0", platform takes nothing.
  const room = Math.max(0, input.grossPence - platformFeePence);
  const stripeFeePence = Math.min(stripeFeeRaw, room);
  const netToCreatorPence = input.grossPence - platformFeePence - stripeFeePence;

  return {
    grossPence: input.grossPence,
    platformFeePence,
    stripeFeePence,
    netToCreatorPence,
    appliedFeePct: input.appliedFeePct,
  };
}

/**
 * Resolve the platform fee fraction for a campaign — uses the per-campaign
 * override if set, otherwise the global config. Pure helper so the same
 * resolution logic runs in finalize_campaign (snapshot at finalize time
 * into the job payload) and in any future "what would the creator net"
 * preview UI.
 */
export function resolvePlatformFeePct(args: {
  globalPlatformFeePct: number;
  campaignFeeOverridePct: number | null;
}): number {
  return args.campaignFeeOverridePct ?? args.globalPlatformFeePct;
}
