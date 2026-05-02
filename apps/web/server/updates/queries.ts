import 'server-only';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { campaignUpdates, type CampaignUpdate } from '@bgcf/db';
import { getDb } from '../db';

/** Public-visible (published, non-backers-only) updates on a campaign. */
export async function getPublicUpdates(campaignId: string): Promise<CampaignUpdate[]> {
  const db = getDb();
  return db
    .select()
    .from(campaignUpdates)
    .where(
      and(
        eq(campaignUpdates.campaignId, campaignId),
        eq(campaignUpdates.isBackersOnly, false),
        isNotNull(campaignUpdates.publishedAt),
      ),
    )
    .orderBy(desc(campaignUpdates.publishedAt));
}

/** All updates a backer/creator should see — relies on RLS for the cut. */
export async function getAllUpdatesForViewer(campaignId: string): Promise<CampaignUpdate[]> {
  const db = getDb();
  return db
    .select()
    .from(campaignUpdates)
    .where(eq(campaignUpdates.campaignId, campaignId))
    .orderBy(desc(campaignUpdates.publishedAt), desc(campaignUpdates.createdAt));
}

/** Owner-list for the creator wizard. */
export async function listCreatorUpdates(campaignId: string): Promise<CampaignUpdate[]> {
  return getAllUpdatesForViewer(campaignId);
}
