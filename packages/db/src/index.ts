import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDb>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

function createDb(connectionString: string) {
  client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export function getDb(connectionString: string): Database {
  if (!database) {
    database = createDb(connectionString);
  }
  return database;
}

export { schema };
export * from './schema';
export * from './policies';
