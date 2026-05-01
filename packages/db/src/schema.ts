import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';
import { creatorProfilesPolicies, processedStripeEventsPolicies } from './policies';

// ============================================================================
// SCHEMA — single source of truth for all app tables.
// ----------------------------------------------------------------------------
// Money columns are bigint pence (BIGINT not INTEGER — pledge totals can blow
// past 2.1B pence on a viral campaign). Timestamps are timestamp-with-tz.
// Supabase's `auth.users` is referenced via drizzle-orm/supabase's authUsers
// declaration so we don't redeclare its column shape ourselves.
// ============================================================================

// Re-export `authUsers` so callers can `import { authUsers } from '@bgcf/db'`
// the same way they import our own tables.
export { authUsers };

// ---- creator_profiles ----------------------------------------------------
// Extends auth.users with platform-creator info. One row per user who has
// started or completed creator onboarding. The `stripe_*` fields are the
// source of truth for Connect-account status — updated by the
// `account.updated` webhook. A campaign can't transition draft → live unless
// `stripe_charges_enabled = true`.
export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    avatarR2Key: text('avatar_r2_key'),

    stripeAccountId: text('stripe_account_id').unique(),
    stripeChargesEnabled: boolean('stripe_charges_enabled').notNull().default(false),
    stripePayoutsEnabled: boolean('stripe_payouts_enabled').notNull().default(false),
    stripeDetailsSubmitted: boolean('stripe_details_submitted').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('creator_profiles_stripe_account_id_idx').on(t.stripeAccountId),
    ...creatorProfilesPolicies(t),
  ],
);

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

// ---- processed_stripe_events ---------------------------------------------
// Idempotency table for Stripe webhook events. Every webhook handler inserts
// the event ID before processing (transactionally — see
// apps/web/server/stripe/idempotency.ts); if the insert conflicts on the
// primary key, the event has already been handled and we no-op.
export const processedStripeEvents = pgTable(
  'processed_stripe_events',
  {
    eventId: text('event_id').primaryKey(),
    processedAt: timestamp('processed_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  () => processedStripeEventsPolicies,
);

export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;
