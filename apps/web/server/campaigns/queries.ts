import 'server-only';
import { and, desc, eq, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import {
  campaignMedia,
  campaigns,
  rewardTiers,
  type Campaign,
  type CampaignCategory,
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

// ============================================================================
// Browse — public listing.
// ============================================================================

export type BrowseCursor = {
  /** Tie-breaker for stable pagination: launched_at, then id descending. */
  launchedAt: Date;
  id: string;
};

export type BrowseArgs = {
  category?: CampaignCategory;
  q?: string;
  cursor?: BrowseCursor;
  limit?: number;
};

export type BrowseCard = Pick<
  Campaign,
  | 'id'
  | 'slug'
  | 'title'
  | 'tagline'
  | 'category'
  | 'goalPence'
  | 'totalPledgedPence'
  | 'pledgeCount'
  | 'launchedAt'
  | 'deadlineAt'
  | 'status'
> & {
  coverR2Key: string | null;
};

export type BrowsePage = {
  items: BrowseCard[];
  nextCursor: BrowseCursor | null;
};

/**
 * Public list of campaigns visible to anonymous browsers — `live` and
 * `succeeded` only. Ordered by `launched_at desc` so the freshest live
 * campaigns surface first; cursor-paginated by (launched_at, id) for
 * stable order under concurrent inserts.
 *
 * Search is ILIKE on title backed by the GIN trigram index (M3
 * migration) so it stays fast on substring matches as the catalogue
 * grows. Past ~10k campaigns we'd swap in a real search engine
 * (Meilisearch / Typesense) — flagged in PLAN.md "Known risks".
 */
export async function listLiveCampaigns(args: BrowseArgs = {}): Promise<BrowsePage> {
  const db = getDb();
  const limit = Math.min(Math.max(args.limit ?? 24, 1), 60);

  const conditions = [inArray(campaigns.status, ['live', 'succeeded'])];
  if (args.category) conditions.push(eq(campaigns.category, args.category));
  if (args.q && args.q.trim().length > 0) {
    // Wildcard-flank the term so the trigram index handles substring matches.
    conditions.push(ilike(campaigns.title, `%${args.q.trim()}%`));
  }
  if (args.cursor) {
    // (launched_at, id) < (cursor.launched_at, cursor.id) under desc order.
    const cursorClause = or(
      lt(campaigns.launchedAt, args.cursor.launchedAt),
      and(eq(campaigns.launchedAt, args.cursor.launchedAt), lt(campaigns.id, args.cursor.id)),
    );
    if (cursorClause) conditions.push(cursorClause);
  }

  // Pull cards + their cover image in one round-trip via a correlated
  // sub-select — avoids the N+1 a per-card media fetch would cause.
  const rows = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      title: campaigns.title,
      tagline: campaigns.tagline,
      category: campaigns.category,
      goalPence: campaigns.goalPence,
      totalPledgedPence: campaigns.totalPledgedPence,
      pledgeCount: campaigns.pledgeCount,
      launchedAt: campaigns.launchedAt,
      deadlineAt: campaigns.deadlineAt,
      status: campaigns.status,
      coverR2Key: sql<string | null>`(
        SELECT r2_key FROM ${campaignMedia}
        WHERE ${campaignMedia.campaignId} = ${campaigns.id}
          AND ${campaignMedia.kind} = 'cover'
        LIMIT 1
      )`,
    })
    .from(campaigns)
    .where(and(...conditions))
    .orderBy(desc(campaigns.launchedAt), desc(campaigns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor: BrowseCursor | null =
    hasMore && last && last.launchedAt ? { launchedAt: last.launchedAt, id: last.id } : null;

  return { items, nextCursor };
}

/**
 * Public-page variant of getCampaignBySlug — returns the campaign + tiers +
 * media only if the campaign is publicly visible. Drafts / cancelled
 * campaigns return null even though `getCampaignBySlug` would return them,
 * so callers don't need a separate visibility check.
 */
export async function getPublicCampaignBySlug(slug: string): Promise<CampaignWithRelations | null> {
  const found = await getCampaignBySlug(slug);
  if (!found) return null;
  if (found.status !== 'live' && found.status !== 'succeeded') return null;
  return found;
}
