import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DIRECT_DATABASE_URL or DATABASE_URL must be set to run drizzle-kit (use the non-pooler URL for migrations).',
  );
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  schemaFilter: ['public'],
});
