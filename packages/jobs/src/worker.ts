import PgBoss from 'pg-boss';
import { getWorkerEnv } from './env';
import { handleChargePledge } from './handlers/chargePledge';
import { handleFinalizeCampaign } from './handlers/finalizeCampaign';
import { QUEUES, type ChargePledgePayload, type FinalizeCampaignPayload } from './queues';

/**
 * pg-boss worker entrypoint. Started via `pnpm --filter @bgcf/jobs start`
 * — Railway runs this as a separate service from `apps/web`.
 *
 * Concurrency: WORKER_CONCURRENCY env var caps how many jobs of any one
 * queue are processed in parallel. The charge fan-out is rate-limited
 * effectively by this — at concurrency 10, we'd top out at ~50 PIs/sec
 * which sits comfortably under Stripe's ~100 writes/sec ceiling.
 *
 * Graceful shutdown: SIGINT / SIGTERM stop the boss cleanly so in-flight
 * jobs finish before the process exits (pg-boss will requeue any that
 * don't, on next startup).
 */
async function main() {
  const env = getWorkerEnv();
  const boss = new PgBoss({
    connectionString: env.PG_BOSS_DATABASE_URL,
    // pg-boss uses its own schema for queue tables; this stays out of the
    // way of our app schema.
    schema: 'pgboss',
  });

  boss.on('error', (err) => {
    console.error('[worker] pg-boss error:', err);
  });

  await boss.start();
  console.log(`[worker] pg-boss started; concurrency=${env.WORKER_CONCURRENCY}`);

  // Helper to enqueue a charge_pledge job from inside the
  // finalize_campaign handler. Bound to this boss instance so we don't
  // need a singleton in the handlers themselves.
  async function enqueueChargePledge(payload: ChargePledgePayload): Promise<void> {
    await boss.send(QUEUES.chargePledge, payload);
  }

  // pg-boss 10 controls parallelism via `batchSize` (jobs fetched per
  // poll) — we read up to WORKER_CONCURRENCY jobs at a time and process
  // them sequentially inside the handler. For higher throughput we'd
  // Promise.all the inner loop, but sequential keeps Stripe rate-limit
  // pressure predictable (~50 PIs/sec at concurrency 10 with ~200ms per
  // call).
  const workOptions = { batchSize: env.WORKER_CONCURRENCY } as const;

  await boss.work<FinalizeCampaignPayload>(QUEUES.finalizeCampaign, workOptions, async (jobs) => {
    for (const job of jobs) {
      await handleFinalizeCampaign(job.data, enqueueChargePledge);
    }
  });

  await boss.work<ChargePledgePayload>(QUEUES.chargePledge, workOptions, async (jobs) => {
    for (const job of jobs) {
      await handleChargePledge(job.data);
    }
  });

  console.log(`[worker] handlers registered for ${Object.values(QUEUES).join(', ')}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      console.log(`[worker] received ${signal}, draining…`);
      await boss.stop({ graceful: true, timeout: 30_000 });
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[worker] crashed:', err);
  process.exit(1);
});
