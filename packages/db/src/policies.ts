import { pgPolicy, type PgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authenticatedRole } from 'drizzle-orm/supabase';

// Loose column-shape type used by the policy factories below. We can't
// `typeof creatorProfiles` here because schema.ts imports from this file —
// we only need enough type info to catch typos in column names, and PgColumn
// is what `${t.userId}` accepts in SQL templates.
type ColumnsForCreatorProfiles = { userId: PgColumn };

// ============================================================================
// RLS POLICIES — SOURCE OF TRUTH
// ============================================================================
// Imported into schema.ts and applied per-table via the third pgTable() arg.
// Defining policies here (rather than scattered SQL files) means they version
// alongside the schema and get included in drizzle-kit-generated migrations.
//
// SECURITY MODEL — read this before adding/editing policies
// ----------------------------------------------------------
// Our app server (Server Actions, /api/* route handlers, the pg-boss worker)
// connects to Postgres using DATABASE_URL, which maps to the `postgres` role
// in Supabase. That role has BYPASSRLS — so app-side queries via Drizzle
// IGNORE every policy in this file.
//
// What policies actually protect:
//   1. Direct DB access — psql, Supabase Studio, ad-hoc dashboard queries.
//   2. Any future use of supabase-js from the browser (anon / authenticated).
//   3. Supabase Realtime subscriptions when we eventually add them.
//   4. Defence-in-depth if app code is ever wired to use the `authenticated`
//      role + JWT (see docs/PLAN.md "Known risks / decisions to revisit").
//
// What enforces auth inside Server Actions and route handlers:
//   - apps/web/server/auth.ts → requireUser / requireCreator / etc.
//   - All payment-touching Server Actions are gated on these.
//
// Policies should still be tight (least-privilege) — they're a backstop, but
// a real one. Don't write loose policies "because the app bypasses them."
// ============================================================================

// ---- creator_profiles ----------------------------------------------------
//
// Owner-only access. M3 may add a separate public-read policy exposing only
// non-sensitive fields (display_name, bio, avatar) for campaign pages — for
// now creator pages aren't a thing, so locked to the owner.

export const creatorProfilesPolicies = (t: ColumnsForCreatorProfiles) => [
  pgPolicy('Owner can read their own creator profile', {
    for: 'select',
    to: authenticatedRole,
    using: sql`(SELECT auth.uid()) = ${t.userId}`,
  }),
  pgPolicy('Owner can insert their own creator profile', {
    for: 'insert',
    to: authenticatedRole,
    withCheck: sql`(SELECT auth.uid()) = ${t.userId}`,
  }),
  pgPolicy('Owner can update their own creator profile', {
    for: 'update',
    to: authenticatedRole,
    using: sql`(SELECT auth.uid()) = ${t.userId}`,
    withCheck: sql`(SELECT auth.uid()) = ${t.userId}`,
  }),
  // No DELETE policy by design — creator profiles aren't user-deletable.
  // If a creator wants to leave the platform we'll soft-delete via app code
  // running as `postgres` (RLS bypass).
];

// ---- processed_stripe_events ---------------------------------------------
//
// Pure server-only table. RLS is enabled with NO policies, which means no
// regular role (anon, authenticated) can read or write it. The webhook
// handler runs as `postgres` (RLS bypass) so it works as expected; nobody
// else can poke at our idempotency log.

export const processedStripeEventsPolicies = [];
