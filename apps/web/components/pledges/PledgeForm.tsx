'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { RewardTier } from '@bgcf/db';
import { createPledgeSetupIntent } from '@/server/pledges/actions';
import { formatPence } from '@/lib/format';

type Props = {
  campaignId: string;
  slug: string;
  publishableKey: string;
  tiers: RewardTier[];
  /** Where to redirect on success — typically /c/[slug]/back/success. */
  returnUrl: string;
};

type Step = 'pick' | 'shipping' | 'payment';

let stripePromiseCache: Promise<Stripe | null> | null = null;
function getStripeBrowser(publishableKey: string): Promise<Stripe | null> {
  // Memoise across re-renders so we don't re-fetch the Stripe.js bundle.
  if (!stripePromiseCache) stripePromiseCache = loadStripe(publishableKey);
  return stripePromiseCache;
}

/**
 * The pledge form is a client component because Stripe's PaymentElement
 * requires the client-side SDK. The flow is:
 *
 *   1. Backer picks a tier and (optionally) a custom add-on amount
 *      ("pick" step).
 *   2. Backer enters shipping address ("shipping" step).
 *   3. We POST to createPledgeSetupIntent (Server Action) which reserves
 *      tier seats inside a transaction and returns a SetupIntent
 *      client_secret. We swap to the "payment" step and mount Stripe
 *      Elements with that secret. The backer enters card details and
 *      confirms; Stripe redirects to `returnUrl` on success.
 */
export function PledgeForm({ campaignId, slug, publishableKey, tiers, returnUrl }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    tiers.find((t) => !t.isHidden)?.id ?? null,
  );
  const [customAmount, setCustomAmount] = useState<string>('');
  const [shipping, setShipping] = useState({
    name: '',
    line1: '',
    line2: '',
    city: '',
    postalCode: '',
    country: 'GB',
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;

  const totalPence = useMemo(() => {
    let total = 0;
    if (selectedTier) total += selectedTier.pricePence;
    const custom = parseInt(customAmount, 10);
    if (Number.isInteger(custom) && custom > 0) total += custom;
    return total;
  }, [selectedTier, customAmount]);

  function onPickContinue() {
    if (!selectedTier && !(parseInt(customAmount, 10) > 0)) {
      setError('Pick a tier or enter a custom amount.');
      return;
    }
    setError(null);
    setStep('shipping');
  }

  function onShippingContinue() {
    if (!shipping.name || !shipping.line1 || !shipping.city || !shipping.postalCode) {
      setError('Please complete the shipping address.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const items: { rewardTierId: string | null; quantity: number }[] = [];
        if (selectedTier) {
          items.push({ rewardTierId: selectedTier.id, quantity: 1 });
        }
        const customNum = parseInt(customAmount, 10);
        if (Number.isInteger(customNum) && customNum > 0) {
          items.push({ rewardTierId: null, quantity: 1 });
        }
        const result = await createPledgeSetupIntent({
          campaignId,
          items,
          shipping,
          customAmountPence: Number.isInteger(customNum) && customNum > 0 ? customNum : undefined,
        });
        setClientSecret(result.clientSecret);
        setStep('payment');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        setError(humanise(message));
      }
    });
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      {step === 'pick' ? (
        <PickStep
          tiers={tiers}
          selectedTierId={selectedTierId}
          setSelectedTierId={setSelectedTierId}
          customAmount={customAmount}
          setCustomAmount={setCustomAmount}
          totalPence={totalPence}
          onContinue={onPickContinue}
        />
      ) : null}

      {step === 'shipping' ? (
        <ShippingStep
          shipping={shipping}
          setShipping={setShipping}
          totalPence={totalPence}
          onBack={() => setStep('pick')}
          onContinue={onShippingContinue}
          isPending={isPending}
        />
      ) : null}

      {step === 'payment' && clientSecret ? (
        <PaymentStep
          publishableKey={publishableKey}
          clientSecret={clientSecret}
          returnUrl={returnUrl}
          totalPence={totalPence}
          onBack={() => setStep('shipping')}
          slug={slug}
        />
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------

function Stepper({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    pick: '1. Pick',
    shipping: '2. Shipping',
    payment: '3. Payment',
  };
  return (
    <ol className="flex gap-2 text-sm font-medium">
      {(['pick', 'shipping', 'payment'] as const).map((s) => (
        <li
          key={s}
          className={`rounded-md px-3 py-1 ${
            step === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {labels[s]}
        </li>
      ))}
    </ol>
  );
}

function PickStep({
  tiers,
  selectedTierId,
  setSelectedTierId,
  customAmount,
  setCustomAmount,
  totalPence,
  onContinue,
}: {
  tiers: RewardTier[];
  selectedTierId: string | null;
  setSelectedTierId: (id: string | null) => void;
  customAmount: string;
  setCustomAmount: (v: string) => void;
  totalPence: number;
  onContinue: () => void;
}) {
  const visibleTiers = tiers.filter((t) => !t.isHidden);
  return (
    <div className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">Pick a tier</legend>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 p-3 hover:bg-slate-50">
            <input
              type="radio"
              name="tier"
              value=""
              checked={selectedTierId === null}
              onChange={() => setSelectedTierId(null)}
              className="mt-1"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium">No-reward pledge</span>
              <span className="block text-xs text-slate-500">
                Just back the project — set your own amount below.
              </span>
            </span>
          </label>
          {visibleTiers.map((tier) => (
            <label
              key={tier.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 p-3 hover:bg-slate-50"
            >
              <input
                type="radio"
                name="tier"
                value={tier.id}
                checked={selectedTierId === tier.id}
                onChange={() => setSelectedTierId(tier.id)}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{tier.title}</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatPence(tier.pricePence)}
                  </span>
                </span>
                {tier.quantityLimit !== null ? (
                  <span className="block text-xs text-slate-500">
                    {Math.max(0, tier.quantityLimit - tier.quantityClaimed)} of {tier.quantityLimit}{' '}
                    left
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Custom add-on amount (pence)</span>
        <input
          type="number"
          min={0}
          step={1}
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="0"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Leave at 0 if you only want the tier reward.
        </span>
      </label>

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <p className="text-sm">
          Total:{' '}
          <span className="font-semibold text-slate-900">
            {totalPence > 0 ? formatPence(totalPence) : '—'}
          </span>
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={totalPence <= 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function ShippingStep({
  shipping,
  setShipping,
  totalPence,
  onBack,
  onContinue,
  isPending,
}: {
  shipping: {
    name: string;
    line1: string;
    line2: string;
    city: string;
    postalCode: string;
    country: string;
  };
  setShipping: (s: typeof shipping) => void;
  totalPence: number;
  onBack: () => void;
  onContinue: () => void;
  isPending: boolean;
}) {
  function set<K extends keyof typeof shipping>(key: K, value: string) {
    setShipping({ ...shipping, [key]: value });
  }
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Shipping address</h2>
      <p className="text-xs text-slate-500">
        Used by the creator to ship physical rewards. Required even for digital-only tiers in v1.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name" value={shipping.name} onChange={(v) => set('name', v)} />
        <Field
          label="Country (ISO-2)"
          value={shipping.country}
          onChange={(v) => set('country', v.toUpperCase())}
          maxLength={2}
        />
        <Field
          label="Address line 1"
          value={shipping.line1}
          onChange={(v) => set('line1', v)}
          className="sm:col-span-2"
        />
        <Field
          label="Address line 2 (optional)"
          value={shipping.line2}
          onChange={(v) => set('line2', v)}
          className="sm:col-span-2"
        />
        <Field label="City" value={shipping.city} onChange={(v) => set('city', v)} />
        <Field
          label="Postal code"
          value={shipping.postalCode}
          onChange={(v) => set('postalCode', v)}
        />
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <button type="button" onClick={onBack} className="text-sm text-slate-600 hover:underline">
          ← Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {isPending ? 'Reserving…' : `Continue to payment (${formatPence(totalPence)})`}
        </button>
      </div>
    </div>
  );
}

function PaymentStep({
  publishableKey,
  clientSecret,
  returnUrl,
  totalPence,
  onBack,
  slug,
}: {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  totalPence: number;
  onBack: () => void;
  slug: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Card details</h2>
      <p className="text-xs text-slate-500">
        Your card won&apos;t be charged today. We save it now and only charge it at the
        campaign&apos;s deadline if the goal is hit.
      </p>
      <Elements stripe={getStripeBrowser(publishableKey)} options={{ clientSecret }}>
        <ConfirmCard returnUrl={returnUrl} totalPence={totalPence} onBack={onBack} slug={slug} />
      </Elements>
    </div>
  );
}

function ConfirmCard({
  returnUrl,
  totalPence,
  onBack,
}: {
  returnUrl: string;
  totalPence: number;
  onBack: () => void;
  slug: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  // Avoid double-submits on re-render under concurrent React.
  useEffect(() => {
    submittedRef.current = false;
  }, [stripe, elements]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements: elements as StripeElements,
      confirmParams: { return_url: returnUrl },
    });
    if (result.error) {
      setError(result.error.message ?? 'Card could not be saved.');
      setSubmitting(false);
      submittedRef.current = false;
      return;
    }
    // On success Stripe redirects to returnUrl; nothing more to do here.
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? 'Saving card…' : `Save card (${formatPence(totalPence)})`}
        </button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  className,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  maxLength?: number;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
    </label>
  );
}

/** Translate Server Action error codes into something a backer can read. */
function humanise(message: string): string {
  if (message.includes('tier_sold_out')) return 'That tier just sold out — pick another.';
  if (message.includes('campaign_not_accepting_pledges'))
    return 'This campaign is no longer accepting pledges.';
  if (message.includes('reward_tier_hidden')) return 'That tier is no longer available.';
  if (message.includes('invalid_pledge_total:total_below_minimum'))
    return 'Pledge total must be at least £1.';
  if (message.includes('custom_amount_required'))
    return 'Custom amount is required for no-reward pledges.';
  return message;
}
