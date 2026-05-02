import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { comments, type Comment } from '@bgcf/db';
import { getDb } from '../db';

/** All non-hidden comments for a campaign, sorted by creation time. */
export async function getCommentsForCampaign(campaignId: string): Promise<Comment[]> {
  const db = getDb();
  return db
    .select()
    .from(comments)
    .where(eq(comments.campaignId, campaignId))
    .orderBy(asc(comments.createdAt));
}
