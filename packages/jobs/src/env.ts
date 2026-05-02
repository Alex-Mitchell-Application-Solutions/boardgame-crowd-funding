// Worker-process env validator. Mirrors apps/web/server/env.ts but
// requires the subset the worker actually needs at runtime: DB + Stripe.
// The web app's full env shape isn't needed here (the worker doesn't
// serve HTTP, so NEXT_PUBLIC_APP_URL etc. are optional).

const REQUIRED = ['DATABASE_URL', 'STRIPE_SECRET_KEY'] as const;

export type WorkerEnv = {
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  PG_BOSS_DATABASE_URL: string;
  WORKER_CONCURRENCY: number;
};

export function getWorkerEnv(): WorkerEnv {
  const missing: string[] = [];
  for (const key of REQUIRED) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required worker env vars: ${missing.join(', ')}\nSee env.example for the full list.`,
    );
  }

  const concurrencyRaw = process.env.WORKER_CONCURRENCY;
  const concurrency =
    concurrencyRaw && /^\d+$/.test(concurrencyRaw) ? parseInt(concurrencyRaw, 10) : 10;

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
    PG_BOSS_DATABASE_URL: process.env.PG_BOSS_DATABASE_URL || process.env.DATABASE_URL!,
    WORKER_CONCURRENCY: concurrency,
  };
}
