import 'server-only';
import { processedStripeEvents } from '@bgcf/db';
import { getDb } from '../db';

/**
 * Atomically mark a Stripe event as processed and run a handler. Returns
 * `'processed'` if the handler ran (first time we've seen this event ID),
 * `'duplicate'` if the event has already been handled.
 *
 * The handler runs *inside* the transaction that inserts the
 * idempotency row. If the handler throws, the transaction rolls back —
 * including the idempotency row — so Stripe's retry will pick the event
 * up cleanly. If two webhook deliveries race, the row-level lock on the
 * idempotency PK ensures exactly one handler runs to completion.
 */
export async function processEvent(
  eventId: string,
  handler: () => Promise<void>,
): Promise<'processed' | 'duplicate'> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(processedStripeEvents)
      .values({ eventId })
      .onConflictDoNothing({ target: processedStripeEvents.eventId })
      .returning({ eventId: processedStripeEvents.eventId });

    if (inserted.length === 0) return 'duplicate';
    await handler();
    return 'processed';
  });
}
