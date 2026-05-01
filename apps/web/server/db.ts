import 'server-only';
import { getDb as createDb, type Database } from '@bgcf/db';
import { getEnv } from './env';

/**
 * Memoized server-side database client. The first call lazily creates a
 * postgres-js connection pool against `DATABASE_URL` (the pooler URL on
 * cloud Supabase). Subsequent calls return the same instance.
 */
export function getDb(): Database {
  const env = getEnv();
  return createDb(env.DATABASE_URL);
}
