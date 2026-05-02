import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getEnv } from '@/server/env';
import { getStripe } from '@/server/stripe/client';
import { processEvent } from '@/server/stripe/idempotency';
import { handleAccountUpdated } from '@/server/stripe/handlers/accountUpdated';
import {
  handleSetupIntentFailed,
  handleSetupIntentSucceeded,
} from '@/server/stripe/handlers/setupIntent';

export const runtime = 'nodejs';
// Stripe sends webhooks as a stream, and signature verification needs the raw body.
// Force the route to be dynamic so Next.js doesn't try to optimise it.
export const dynamic = 'force-dynamic';

/**
 * Single Stripe webhook endpoint. Responsibilities:
 *   1. Verify the request signature against STRIPE_WEBHOOK_SECRET.
 *   2. Idempotently mark the event ID as processed (no-op if seen).
 *   3. Dispatch to a per-event-type handler.
 *
 * Future events (setup_intent.*, payment_intent.*, charge.refunded,
 * charge.dispute.created) get added to the switch as later milestones
 * land. Unhandled events return 200 so Stripe doesn't retry.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: `signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    const outcome = await processEvent(event.id, async () => {
      switch (event.type) {
        case 'account.updated':
          await handleAccountUpdated(event);
          break;
        case 'setup_intent.succeeded':
          await handleSetupIntentSucceeded(event);
          break;
        case 'setup_intent.setup_failed':
          await handleSetupIntentFailed(event);
          break;
        default:
          // Unhandled event types are accepted (200) so Stripe doesn't
          // keep retrying. They get explicit handlers as later milestones
          // land. The idempotency row is still inserted so future deliveries
          // of the same event no-op cheaply.
          break;
      }
    });
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // Handler threw; processEvent rolled back the idempotency row, so
    // Stripe's retry will exercise the handler again. 500 tells Stripe
    // to retry per its standard backoff schedule.
    console.error(`[stripe.webhook] handler failed for ${event.type} ${event.id}:`, err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}
