import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';
import {
  backerStripeCustomersPolicies,
  campaignMediaPolicies,
  campaignsPolicies,
  creatorProfilesPolicies,
  pledgeItemsPolicies,
  pledgesPolicies,
  processedStripeEventsPolicies,
  rewardTiersPolicies,
} from './policies';

// ============================================================================
// SCHEMA — single source of truth for all app tables.
// ----------------------------------------------------------------------------
// Money columns are `bigint` pence with mode: 'number' — pence values up to
// 2^53-1 (~£90 trillion) are within safe-integer range and we get ergonomic
// JS numbers instead of BigInts. Timestamps are timestamp-with-tz.
// Supabase's `auth.users` is referenced via drizzle-orm/supabase's authUsers
// declaration so we don't redeclare its column shape ourselves.
// ============================================================================

// ---- enums ---------------------------------------------------------------

export const campaignStatus = pgEnum('campaign_status', [
  'draft',
  'live',
  'succeeded',
  'failed',
  'cancelled',
  'hidden',
]);
export type CampaignStatus = (typeof campaignStatus.enumValues)[number];

export const campaignCategory = pgEnum('campaign_category', [
  'strategy',
  'family',
  'party',
  'rpg',
  'wargame',
  'card',
  'other',
]);
export type CampaignCategory = (typeof campaignCategory.enumValues)[number];

export const mediaKind = pgEnum('media_kind', ['cover', 'gallery_image', 'gallery_video']);
export type MediaKind = (typeof mediaKind.enumValues)[number];

export const pledgeStatus = pgEnum('pledge_status', [
  'pending',
  'charged',
  'failed',
  'refunded',
  'cancelled',
]);
export type PledgeStatusValue = (typeof pledgeStatus.enumValues)[number];

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

// ---- campaigns -----------------------------------------------------------
// One row per crowdfunding campaign. Most fields are creator-editable while
// the campaign is in `draft`; `launched_at`, `deadline_at`, and `status`
// transitions are controlled by app logic (publish action, finalize cron).
//
// Denormalised `total_pledged_pence` + `pledge_count` are reconciled by the
// `setup_intent.succeeded` webhook handler so the public campaign page
// doesn't have to aggregate pledges on every render.
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.userId, { onDelete: 'restrict' }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    tagline: text('tagline'),
    storyMd: text('story_md').notNull(),
    category: campaignCategory('category').notNull(),
    goalPence: bigint('goal_pence', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('gbp'),
    status: campaignStatus('status').notNull().default('draft'),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    feeOverridePct: numeric('fee_override_pct', { precision: 5, scale: 4 }),
    totalPledgedPence: bigint('total_pledged_pence', { mode: 'number' }).notNull().default(0),
    pledgeCount: integer('pledge_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // Finalize-cron scan: WHERE status = 'live' AND deadline_at <= now().
    index('campaigns_status_deadline_idx').on(t.status, t.deadlineAt),
    // Browse: WHERE category = ? AND status = 'live'.
    index('campaigns_category_status_idx').on(t.category, t.status),
    index('campaigns_creator_id_idx').on(t.creatorId),
    // GIN trigram for ILIKE search on title (extension enabled in migration).
    index('campaigns_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    check('campaigns_goal_pence_min', sql`${t.goalPence} >= 100`),
    check('campaigns_currency_lower', sql`${t.currency} = lower(${t.currency})`),
    ...campaignsPolicies(t),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

// ---- campaign_media ------------------------------------------------------
// Cover image + gallery for a campaign. The cover is identified by
// `kind = 'cover'`; a partial unique index enforces "at most one cover per
// campaign", which avoids the chicken-and-egg of a `campaigns.cover_media_id`
// FK back to a child table.
export const campaignMedia = pgTable(
  'campaign_media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull().unique(),
    kind: mediaKind('kind').notNull(),
    mimeType: text('mime_type').notNull(),
    bytes: bigint('bytes', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('campaign_media_campaign_id_position_idx').on(t.campaignId, t.position),
    uniqueIndex('campaign_media_one_cover_per_campaign_idx')
      .on(t.campaignId)
      .where(sql`${t.kind} = 'cover'`),
    ...campaignMediaPolicies(t),
  ],
);

export type CampaignMedia = typeof campaignMedia.$inferSelect;
export type NewCampaignMedia = typeof campaignMedia.$inferInsert;

// ---- reward_tiers --------------------------------------------------------
// A creator-defined pledge level on a campaign. `quantity_limit` null means
// unlimited; `quantity_claimed` is incremented when a pledge with this tier
// commits (transactionally, in the `setup_intent.succeeded` handler). The
// CHECK constraint guards against ever overselling, even in the face of a
// race that bypassed the application-level lock.
export const rewardTiers = pgTable(
  'reward_tiers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    descriptionMd: text('description_md').notNull(),
    pricePence: bigint('price_pence', { mode: 'number' }).notNull(),
    quantityLimit: integer('quantity_limit'),
    quantityClaimed: integer('quantity_claimed').notNull().default(0),
    estimatedDelivery: date('estimated_delivery'),
    position: integer('position').notNull().default(0),
    isHidden: boolean('is_hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('reward_tiers_campaign_id_position_idx').on(t.campaignId, t.position),
    check('reward_tiers_price_pence_min', sql`${t.pricePence} >= 100`),
    check(
      'reward_tiers_quantity_claimed_within_limit',
      sql`${t.quantityLimit} IS NULL OR ${t.quantityClaimed} <= ${t.quantityLimit}`,
    ),
    ...rewardTiersPolicies(t),
  ],
);

export type RewardTier = typeof rewardTiers.$inferSelect;
export type NewRewardTier = typeof rewardTiers.$inferInsert;

// ---- backer_stripe_customers --------------------------------------------
// Maps app users to their Stripe Customer id. We can't put this on
// `creator_profiles` because backers don't necessarily have a creator
// profile. Keeping it as a thin lookup table also keeps the find-or-create
// path queryable without trawling Stripe metadata.
export const backerStripeCustomers = pgTable(
  'backer_stripe_customers',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [...backerStripeCustomersPolicies(t)],
);

export type BackerStripeCustomer = typeof backerStripeCustomers.$inferSelect;

// ---- pledges -------------------------------------------------------------
// One row per backer-pledge to a campaign. During the campaign the row sits
// in `pending` with the saved Stripe payment-method on file (no charge yet —
// SetupIntent only). At the campaign deadline (M6) the finalize cron fans
// out PaymentIntents and flips charged/failed rows accordingly.
//
// Partial unique index `(campaign_id, backer_id) WHERE status IN
// ('pending','charged')` enforces "one active pledge per backer per
// campaign" while still allowing historical cancelled / refunded rows.
export const pledges = pgTable(
  'pledges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    backerId: uuid('backer_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'restrict' }),
    amountPence: bigint('amount_pence', { mode: 'number' }).notNull(),

    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripePaymentMethodId: text('stripe_payment_method_id'),
    stripeSetupIntentId: text('stripe_setup_intent_id').notNull().unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),

    status: pledgeStatus('status').notNull().default('pending'),

    shippingName: text('shipping_name'),
    shippingLine1: text('shipping_line1'),
    shippingLine2: text('shipping_line2'),
    shippingCity: text('shipping_city'),
    shippingPostalCode: text('shipping_postal_code'),
    shippingCountry: text('shipping_country'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    chargedAt: timestamp('charged_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('pledges_campaign_id_status_idx').on(t.campaignId, t.status),
    index('pledges_backer_id_created_at_idx').on(t.backerId, t.createdAt),
    index('pledges_payment_intent_idx').on(t.stripePaymentIntentId),
    uniqueIndex('pledges_one_active_per_backer_idx')
      .on(t.campaignId, t.backerId)
      .where(sql`${t.status} IN ('pending', 'charged')`),
    check('pledges_amount_pence_min', sql`${t.amountPence} >= 100`),
    ...pledgesPolicies(t),
  ],
);

export type Pledge = typeof pledges.$inferSelect;
export type NewPledge = typeof pledges.$inferInsert;

// ---- pledge_items --------------------------------------------------------
// Line items on a pledge. `reward_tier_id` null = "no-reward custom amount"
// (a backer pledging a bare GBP amount without claiming a tier).
// `unit_price_pence` is frozen at pledge time so a creator changing tier
// prices later doesn't rewrite history.
//
// Modelled now (rather than M5+) so the pledge insert path is a clean
// transaction: insert pledge → insert items → return. Add-ons in v1.x
// reuse the same shape (multiple non-tier line items per pledge).
export const pledgeItems = pgTable(
  'pledge_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pledgeId: uuid('pledge_id')
      .notNull()
      .references(() => pledges.id, { onDelete: 'cascade' }),
    rewardTierId: uuid('reward_tier_id').references(() => rewardTiers.id, {
      onDelete: 'restrict',
    }),
    quantity: integer('quantity').notNull().default(1),
    unitPricePence: bigint('unit_price_pence', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('pledge_items_pledge_id_idx').on(t.pledgeId),
    index('pledge_items_reward_tier_id_idx').on(t.rewardTierId),
    check('pledge_items_quantity_min', sql`${t.quantity} >= 1`),
    check('pledge_items_unit_price_min', sql`${t.unitPricePence} >= 0`),
    ...pledgeItemsPolicies(t),
  ],
);

export type PledgeItem = typeof pledgeItems.$inferSelect;
export type NewPledgeItem = typeof pledgeItems.$inferInsert;

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
