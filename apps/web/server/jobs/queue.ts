import 'server-only';
import PgBoss from 'pg-boss';
import { getEnv } from '@/server/env';

// Lightweight pg-boss client for the web process. Used to *enqueue* jobs
// from cron endpoints / Server Actions; the actual handlers run on the
// separate worker process (`packages/jobs/src/worker.ts`). Both processes
// share the same Postgres + the `pgboss` schema, so a job sent from here
// gets picked up by the worker on its next poll.

let cachedBoss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

async function getBoss(): Promise<PgBoss> {
  if (cachedBoss) return cachedBoss;
  if (starting) return starting;

  starting = (async () => {
    const env = getEnv();
    const connectionString = process.env.PG_BOSS_DATABASE_URL || env.DATABASE_URL;
    const boss = new PgBoss({ connectionString, schema: 'pgboss' });
    boss.on('error', (err) => {
      console.error('[web/jobs] pg-boss error:', err);
    });
    await boss.start();
    cachedBoss = boss;
    return boss;
  })();

  return starting;
}

/**
 * Enqueue a job. Thin wrapper around boss.send so callers don't have to
 * worry about lazy-starting the connection. Fire-and-forget: returns the
 * job id but doesn't await execution.
 */
export async function enqueueJob<T extends object>(
  queueName: string,
  payload: T,
  options: { singletonKey?: string } = {},
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(queueName, payload, {
    singletonKey: options.singletonKey,
  });
}
