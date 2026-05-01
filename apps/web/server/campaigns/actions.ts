'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  campaignCategory,
  campaignMedia,
  campaigns,
  creatorProfiles,
  mediaKind,
  rewardTiers,
} from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { deleteObject } from '@/server/storage';
import { isSlugTaken } from './queries';
import { slugify, withRandomSuffix } from './lib/slug';
import { assertTransition } from './lib/state';
import { validateDeadline, validateGoalPence, validateTierPricePence } from './lib/validation';

// ============================================================================
// Schemas
// ============================================================================

const CreateCampaignSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.enum(campaignCategory.enumValues),
  goalPence: z.coerce.number().int().positive(),
});

const UpdateCampaignSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  tagline: z.string().trim().max(200).optional(),
  storyMd: z.string().max(50_000).optional(),
  category: z.enum(campaignCategory.enumValues).optional(),
  goalPence: z.coerce.number().int().positive().optional(),
  deadlineAt: z.coerce.date().optional(),
});

const RewardTierSchema = z.object({
  title: z.string().trim().min(2).max(120),
  descriptionMd: z.string().max(10_000),
  pricePence: z.coerce.number().int().positive(),
  quantityLimit: z.coerce.number().int().positive().nullish(),
  estimatedDelivery: z.coerce.date().nullish(),
  position: z.coerce.number().int().min(0).optional(),
});

const AddMediaSchema = z.object({
  campaignId: z.string().uuid(),
  storageKey: z.string().min(1),
  kind: z.enum(mediaKind.enumValues),
  mimeType: z.string().min(1),
  bytes: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/** Confirms the user owns the campaign, throws if not. Returns the row. */
async function requireOwnedCampaign(campaignId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.creatorId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error('campaign_not_found_or_not_owned');
  }
  return row;
}

/** Allocate a unique slug with up to N retries on conflict. */
async function allocateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  if (!(await isSlugTaken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = withRandomSuffix(base);
    if (!(await isSlugTaken(candidate))) return candidate;
  }
  throw new Error('slug_allocation_exhausted');
}

// ============================================================================
// Campaign actions
// ============================================================================

/**
 * Create a draft campaign. Creator must already have a `creator_profiles`
 * row (i.e. completed step 1 of /dashboard/connect). Stripe Connect status
 * is *not* required to create a draft — only to publish it.
 */
export async function createCampaign(formData: FormData) {
  const user = await requireUser();
  const parsed = CreateCampaignSchema.parse({
    title: formData.get('title'),
    category: formData.get('category'),
    goalPence: formData.get('goalPence'),
  });
  const goalErr = validateGoalPence(parsed.goalPence);
  if (goalErr) throw new Error(`invalid_goal:${goalErr.kind}`);

  const db = getDb();
  // Profile-existence check — explicit error rather than relying on FK
  // failure so the wizard can surface a "complete your profile first" CTA.
  const profile = await db
    .select({ userId: creatorProfiles.userId })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, user.id))
    .limit(1);
  if (profile.length === 0) {
    throw new Error('creator_profile_required');
  }

  const slug = await allocateUniqueSlug(parsed.title);

  const [created] = await db
    .insert(campaigns)
    .values({
      creatorId: user.id,
      slug,
      title: parsed.title,
      storyMd: '',
      category: parsed.category,
      goalPence: parsed.goalPence,
    })
    .returning({ id: campaigns.id });

  if (!created) throw new Error('campaign_insert_failed');
  revalidatePath('/dashboard');
  redirect(`/dashboard/campaigns/${created.id}/edit`);
}

/**
 * Update editable fields on a draft campaign. Only `draft`-status campaigns
 * can have title/category/goal changed; once `live`, those are locked.
 * (We surface partial-update support to the wizard so each step can save
 * just its own fields.)
 */
export async function updateCampaign(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await requireOwnedCampaign(campaignId, user.id);

  const raw: Record<string, unknown> = {};
  for (const key of [
    'title',
    'tagline',
    'storyMd',
    'category',
    'goalPence',
    'deadlineAt',
  ] as const) {
    const value = formData.get(key);
    if (value !== null && value !== '') raw[key] = value;
  }
  const parsed = UpdateCampaignSchema.parse(raw);

  if (existing.status !== 'draft') {
    // Once live, only the story / tagline can be updated.
    delete parsed.title;
    delete parsed.category;
    delete parsed.goalPence;
    delete parsed.deadlineAt;
  }

  if (parsed.goalPence !== undefined) {
    const err = validateGoalPence(parsed.goalPence);
    if (err) throw new Error(`invalid_goal:${err.kind}`);
  }
  if (parsed.deadlineAt !== undefined) {
    const err = validateDeadline(parsed.deadlineAt);
    if (err) throw new Error(`invalid_deadline:${err.kind}`);
  }

  const db = getDb();
  await db
    .update(campaigns)
    .set({ ...parsed, updatedAt: sql`now()` })
    .where(eq(campaigns.id, campaignId));

  revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
}

/**
 * Publish a draft campaign — the only place draft → live happens.
 *
 * Gates (all must pass):
 *   - caller owns the campaign
 *   - Stripe Connect onboarding is complete (charges_enabled = true)
 *   - title, story, goal, category, deadline are set (deadline within window)
 *   - at least one cover image and one reward tier exist
 */
export async function publishCampaign(campaignId: string) {
  const user = await requireUser();
  const existing = await requireOwnedCampaign(campaignId, user.id);
  assertTransition(existing.status, 'live');

  const db = getDb();
  const profile = await db
    .select({ chargesEnabled: creatorProfiles.stripeChargesEnabled })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, user.id))
    .limit(1);

  if (!profile[0]?.chargesEnabled) {
    throw new Error('publish_blocked:stripe_connect_not_complete');
  }

  if (!existing.deadlineAt) throw new Error('publish_blocked:deadline_required');
  const deadlineErr = validateDeadline(existing.deadlineAt);
  if (deadlineErr) throw new Error(`publish_blocked:${deadlineErr.kind}`);

  if (!existing.storyMd || existing.storyMd.trim().length < 50) {
    throw new Error('publish_blocked:story_too_short');
  }

  const [coverCount, tierCount] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaignMedia)
      .where(and(eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.kind, 'cover'))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(rewardTiers)
      .where(eq(rewardTiers.campaignId, campaignId)),
  ]);

  if ((coverCount[0]?.n ?? 0) === 0) {
    throw new Error('publish_blocked:cover_image_required');
  }
  if ((tierCount[0]?.n ?? 0) === 0) {
    throw new Error('publish_blocked:reward_tier_required');
  }

  await db
    .update(campaigns)
    .set({
      status: 'live',
      launchedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(campaigns.id, campaignId));

  revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
  revalidatePath(`/c/${existing.slug}`);
}

// ============================================================================
// Reward tier actions
// ============================================================================

export async function addRewardTier(campaignId: string, formData: FormData) {
  const user = await requireUser();
  await requireOwnedCampaign(campaignId, user.id);

  const parsed = RewardTierSchema.parse({
    title: formData.get('title'),
    descriptionMd: formData.get('descriptionMd') ?? '',
    pricePence: formData.get('pricePence'),
    quantityLimit: formData.get('quantityLimit') || null,
    estimatedDelivery: formData.get('estimatedDelivery') || null,
    position: formData.get('position') || 0,
  });
  const priceErr = validateTierPricePence(parsed.pricePence);
  if (priceErr) throw new Error(`invalid_price:${priceErr.kind}`);

  const db = getDb();
  await db.insert(rewardTiers).values({
    campaignId,
    title: parsed.title,
    descriptionMd: parsed.descriptionMd,
    pricePence: parsed.pricePence,
    quantityLimit: parsed.quantityLimit ?? null,
    estimatedDelivery: parsed.estimatedDelivery
      ? parsed.estimatedDelivery.toISOString().slice(0, 10)
      : null,
    position: parsed.position ?? 0,
  });

  revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
}

export async function updateRewardTier(tierId: string, formData: FormData) {
  const user = await requireUser();
  const db = getDb();

  // Resolve the parent campaign and ownership in one round trip.
  const owned = await db
    .select({ tier: rewardTiers, campaign: campaigns })
    .from(rewardTiers)
    .innerJoin(campaigns, eq(campaigns.id, rewardTiers.campaignId))
    .where(and(eq(rewardTiers.id, tierId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  const row = owned[0];
  if (!row) throw new Error('reward_tier_not_found_or_not_owned');

  const parsed = RewardTierSchema.partial().parse({
    title: formData.get('title') ?? undefined,
    descriptionMd: formData.get('descriptionMd') ?? undefined,
    pricePence: formData.get('pricePence') ?? undefined,
    quantityLimit: formData.get('quantityLimit') ?? undefined,
    estimatedDelivery: formData.get('estimatedDelivery') ?? undefined,
    position: formData.get('position') ?? undefined,
  });

  if (parsed.pricePence !== undefined) {
    const err = validateTierPricePence(parsed.pricePence);
    if (err) throw new Error(`invalid_price:${err.kind}`);
  }

  await db
    .update(rewardTiers)
    .set({
      ...parsed,
      estimatedDelivery: parsed.estimatedDelivery
        ? parsed.estimatedDelivery.toISOString().slice(0, 10)
        : parsed.estimatedDelivery === null
          ? null
          : undefined,
      updatedAt: sql`now()`,
    })
    .where(eq(rewardTiers.id, tierId));

  revalidatePath(`/dashboard/campaigns/${row.campaign.id}/edit`);
}

export async function removeRewardTier(tierId: string) {
  const user = await requireUser();
  const db = getDb();

  const owned = await db
    .select({ tier: rewardTiers, campaign: campaigns })
    .from(rewardTiers)
    .innerJoin(campaigns, eq(campaigns.id, rewardTiers.campaignId))
    .where(and(eq(rewardTiers.id, tierId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  const row = owned[0];
  if (!row) throw new Error('reward_tier_not_found_or_not_owned');

  if (row.tier.quantityClaimed > 0) {
    // Tier already has pledges — soft-hide instead of deleting so we don't
    // orphan pledge_items rows.
    await db
      .update(rewardTiers)
      .set({ isHidden: true, updatedAt: sql`now()` })
      .where(eq(rewardTiers.id, tierId));
  } else {
    await db.delete(rewardTiers).where(eq(rewardTiers.id, tierId));
  }

  revalidatePath(`/dashboard/campaigns/${row.campaign.id}/edit`);
}

// ============================================================================
// Media actions (called after a successful presigned upload)
// ============================================================================

export async function addCampaignMedia(formData: FormData) {
  const user = await requireUser();
  const parsed = AddMediaSchema.parse({
    campaignId: formData.get('campaignId'),
    storageKey: formData.get('storageKey'),
    kind: formData.get('kind'),
    mimeType: formData.get('mimeType'),
    bytes: formData.get('bytes') || undefined,
    width: formData.get('width') || undefined,
    height: formData.get('height') || undefined,
  });
  await requireOwnedCampaign(parsed.campaignId, user.id);

  const db = getDb();
  // For 'cover' kind, replace any existing cover (the partial unique index
  // would otherwise refuse the insert). Delete the old row first so the
  // CASCADE-from-storage cleanup runs separately.
  if (parsed.kind === 'cover') {
    const existing = await db
      .select({ id: campaignMedia.id, r2Key: campaignMedia.r2Key })
      .from(campaignMedia)
      .where(and(eq(campaignMedia.campaignId, parsed.campaignId), eq(campaignMedia.kind, 'cover')));
    for (const row of existing) {
      await db.delete(campaignMedia).where(eq(campaignMedia.id, row.id));
      await deleteObject(row.r2Key).catch(() => {
        // Storage cleanup is best-effort; orphan blobs get swept by the
        // periodic R2 cleanup job (post-v1).
      });
    }
  }

  await db.insert(campaignMedia).values({
    campaignId: parsed.campaignId,
    r2Key: parsed.storageKey,
    kind: parsed.kind,
    mimeType: parsed.mimeType,
    bytes: parsed.bytes ?? null,
    width: parsed.width ?? null,
    height: parsed.height ?? null,
  });

  revalidatePath(`/dashboard/campaigns/${parsed.campaignId}/edit`);
}

export async function removeCampaignMedia(mediaId: string) {
  const user = await requireUser();
  const db = getDb();

  const owned = await db
    .select({ media: campaignMedia, campaign: campaigns })
    .from(campaignMedia)
    .innerJoin(campaigns, eq(campaigns.id, campaignMedia.campaignId))
    .where(and(eq(campaignMedia.id, mediaId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  const row = owned[0];
  if (!row) throw new Error('campaign_media_not_found_or_not_owned');

  await db.delete(campaignMedia).where(eq(campaignMedia.id, mediaId));
  await deleteObject(row.media.r2Key).catch(() => {
    // Best-effort cleanup; orphan blobs get swept later.
  });

  revalidatePath(`/dashboard/campaigns/${row.campaign.id}/edit`);
}
