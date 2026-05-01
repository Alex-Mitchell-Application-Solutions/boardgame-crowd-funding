import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  campaignMedia,
  campaigns,
  rewardTiers,
  type Campaign,
  type CampaignMedia,
  type RewardTier,
} from '@bgcf/db';
import { getDb } from '../db';

export type CampaignWithRelations = Campaign & {
  rewardTiers: RewardTier[];
  media: CampaignMedia[];
};

export async function getCampaignById(id: string): Promise<CampaignWithRelations | null> {
  const db = getDb();
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  const campaign = rows[0];
  if (!campaign) return null;

  const [tiers, media] = await Promise.all([
    db
      .select()
      .from(rewardTiers)
      .where(eq(rewardTiers.campaignId, campaign.id))
      .orderBy(rewardTiers.position),
    db
      .select()
      .from(campaignMedia)
      .where(eq(campaignMedia.campaignId, campaign.id))
      .orderBy(campaignMedia.position),
  ]);

  return { ...campaign, rewardTiers: tiers, media };
}

export async function getCampaignBySlug(slug: string): Promise<CampaignWithRelations | null> {
  const db = getDb();
  const rows = await db.select().from(campaigns).where(eq(campaigns.slug, slug)).limit(1);
  const campaign = rows[0];
  if (!campaign) return null;
  return getCampaignById(campaign.id);
}

/** Owner-checked variant — returns null if the user doesn't own the campaign. */
export async function getMyCampaign(
  campaignId: string,
  userId: string,
): Promise<CampaignWithRelations | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.creatorId, userId)))
    .limit(1);
  if (rows.length === 0) return null;
  return getCampaignById(campaignId);
}

export async function listCreatorCampaigns(creatorUserId: string): Promise<Campaign[]> {
  const db = getDb();
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.creatorId, creatorUserId))
    .orderBy(desc(campaigns.updatedAt));
}

/** Used during slug allocation to detect collisions and back off to a suffix. */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ exists: sql<number>`1` })
    .from(campaigns)
    .where(eq(campaigns.slug, slug))
    .limit(1);
  return rows.length > 0;
}
