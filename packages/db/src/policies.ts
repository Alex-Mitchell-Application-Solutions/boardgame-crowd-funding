import { pgPolicy, type PgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { anonRole, authenticatedRole } from 'drizzle-orm/supabase';

// Loose column-shape types used by the policy factories below. We can't
// `typeof <table>` here because schema.ts imports from this file — we only
// need enough type info to catch typos in column names, and PgColumn is what
// `${t.colName}` accepts in SQL templates.
type ColumnsForCreatorProfiles = { userId: PgColumn };
type ColumnsForCampaigns = { creatorId: PgColumn; status: PgColumn };
type ColumnsForCampaignMedia = { campaignId: PgColumn };
type ColumnsForRewardTiers = { campaignId: PgColumn };

// `to:` arrays for policies that should apply to both anonymous and
// authenticated roles (e.g. public read of live campaigns).
const publicRoles = [anonRole, authenticatedRole];

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

// ---- campaigns -----------------------------------------------------------
//
// Public read of `live` and `succeeded` campaigns (so the campaign page
// works for unauthenticated browsers). Owner can read their own at any
// status, and write within their own row. No DELETE policy — the lifecycle
// state machine uses `cancelled` / `hidden` instead of row deletion.
//
// "Publicly visible" is `status IN ('live','succeeded')`. `failed` campaigns
// are deliberately excluded — once finalized we hide them from anonymous
// browsing; the creator can still read them.

export const campaignsPolicies = (t: ColumnsForCampaigns) => [
  pgPolicy('Public can read live or succeeded campaigns', {
    for: 'select',
    to: publicRoles,
    using: sql`${t.status} IN ('live', 'succeeded')`,
  }),
  pgPolicy('Owner can read their own campaigns at any status', {
    for: 'select',
    to: authenticatedRole,
    using: sql`(SELECT auth.uid()) = ${t.creatorId}`,
  }),
  pgPolicy('Owner can insert their own campaigns', {
    for: 'insert',
    to: authenticatedRole,
    withCheck: sql`(SELECT auth.uid()) = ${t.creatorId}`,
  }),
  pgPolicy('Owner can update their own campaigns', {
    for: 'update',
    to: authenticatedRole,
    using: sql`(SELECT auth.uid()) = ${t.creatorId}`,
    withCheck: sql`(SELECT auth.uid()) = ${t.creatorId}`,
  }),
];

// ---- campaign_media + reward_tiers --------------------------------------
//
// Both child tables follow the same access rules as their parent campaign:
// public can read media/tiers of publicly-visible campaigns; the campaign
// owner can read/write at any campaign status. The EXISTS sub-select
// joins back to `campaigns` to derive ownership and visibility — keeps
// the policy correct even if a creator changes status mid-flight.

export const campaignMediaPolicies = (t: ColumnsForCampaignMedia) => [
  pgPolicy('Public can read media of live or succeeded campaigns', {
    for: 'select',
    to: publicRoles,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.status IN ('live', 'succeeded'))`,
  }),
  pgPolicy('Owner can read media of their own campaigns', {
    for: 'select',
    to: authenticatedRole,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
  pgPolicy('Owner can insert media on their own campaigns', {
    for: 'insert',
    to: authenticatedRole,
    withCheck: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
  pgPolicy('Owner can update media on their own campaigns', {
    for: 'update',
    to: authenticatedRole,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
  pgPolicy('Owner can delete media on their own campaigns', {
    for: 'delete',
    to: authenticatedRole,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
];

export const rewardTiersPolicies = (t: ColumnsForRewardTiers) => [
  pgPolicy('Public can read reward tiers of live or succeeded campaigns', {
    for: 'select',
    to: publicRoles,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.status IN ('live', 'succeeded'))`,
  }),
  pgPolicy('Owner can read reward tiers of their own campaigns', {
    for: 'select',
    to: authenticatedRole,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
  pgPolicy('Owner can insert reward tiers on their own campaigns', {
    for: 'insert',
    to: authenticatedRole,
    withCheck: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
  pgPolicy('Owner can update reward tiers on their own campaigns', {
    for: 'update',
    to: authenticatedRole,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
  pgPolicy('Owner can delete reward tiers on their own campaigns', {
    for: 'delete',
    to: authenticatedRole,
    using: sql`EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ${t.campaignId} AND c.creator_id = (SELECT auth.uid()))`,
  }),
];

// ---- processed_stripe_events ---------------------------------------------
//
// Pure server-only table. RLS is enabled with NO policies, which means no
// regular role (anon, authenticated) can read or write it. The webhook
// handler runs as `postgres` (RLS bypass) so it works as expected; nobody
// else can poke at our idempotency log.

export const processedStripeEventsPolicies = [];
