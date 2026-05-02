import 'server-only';
import { z } from 'zod';

/**
 * Validated server-side environment. Imported only from server code paths
 * (Server Actions, route handlers, server components). Validation runs
 * lazily on first access so that build-time module loading doesn't crash
 * in CI where some secrets are absent.
 */
const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CONNECT_CLIENT_ID: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STORAGE_PUBLIC_URL: z.string().url().optional(),

  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * During Next.js's production build phase the bundler may evaluate route
 * modules without real secrets being present. We skip strict validation in
 * that window — runtime requests on staging/prod always have real env vars
 * from Railway and validate normally.
 */
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * `.env.local` lines like `STRIPE_SECRET_KEY=` (no value after `=`) load
 * into process.env as the empty string `""`, not as `undefined`. zod's
 * `.optional()` only treats `undefined` as missing, so without this
 * preprocess every empty placeholder fails .url() / .min(1) even though
 * the field is declared optional. Coerce empty strings to undefined so
 * "absent" and "explicitly blank" mean the same thing to the validator.
 */
function emptyToUndefined(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = value === '' ? undefined : value;
  }
  return out;
}

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(emptyToUndefined(process.env));
  if (!parsed.success) {
    if (isBuildPhase) {
      // Return a permissive shape so module evaluation during `next build`
      // doesn't crash. Any actual call paths exercised at request time will
      // be re-validated below.
      return ServerEnvSchema.parse({
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'http://placeholder.invalid',
        NEXT_PUBLIC_SUPABASE_URL: 'http://placeholder.invalid',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
        SUPABASE_SERVICE_ROLE_KEY: 'placeholder',
        DATABASE_URL: 'postgresql://placeholder@placeholder.invalid/placeholder',
      });
    }
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment variables:\n${issues}\n\nSee env.example for the full list.`,
    );
  }
  cached = parsed.data;
  return cached;
}
