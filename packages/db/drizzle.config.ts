import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DIRECT_DATABASE_URL or DATABASE_URL must be set to run drizzle-kit (use the non-pooler URL for migrations).',
  );
}

export default defineConfig({
  schema: './src/schema.ts',
  // Migrations live in `supabase/migrations` so the Supabase CLI picks them up
  // automatically (`supabase start`, `supabase db reset`, `supabase db push`)
  // and there's a single canonical location across local + cloud.
  out: '../../supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  // Default Drizzle index-style filenames (`<NNNN>_<name>.sql`). We don't
  // mix in `supabase migration new` files, so timestamp prefixes earn no
  // wins worth their lower readability.
  verbose: true,
  strict: true,
  schemaFilter: ['public'],
  // RLS policies declared via pgPolicy() in schema.ts get included in
  // generated migrations as ENABLE RLS + CREATE POLICY statements.
  entities: {
    roles: {
      provider: 'supabase',
    },
  },
});
