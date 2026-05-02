import { getDb as createDb, type Database } from '@bgcf/db';
import { getWorkerEnv } from './env';

let cached: Database | undefined;

export function getDb(): Database {
  if (cached) return cached;
  cached = createDb(getWorkerEnv().DATABASE_URL);
  return cached;
}
