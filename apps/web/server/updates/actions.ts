'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { campaignUpdates, campaigns, notifications, pledges } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { buildNotification } from '@/server/notifications/lib/factories';

const PostUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  bodyMd: z.string().trim().min(1).max(50_000),
  isBackersOnly: z.coerce.boolean(),
  publish: z.coerce.boolean().default(true),
});

const UpdateUpdateSchema = PostUpdateSchema.partial();

async function requireOwnedCampaign(campaignId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: campaigns.id, title: campaigns.title, slug: campaigns.slug })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.creatorId, userId)))
    .limit(1);
  if (!rows[0]) throw new Error('campaign_not_found_or_not_owned');
  return rows[0];
}

/**
 * Post (and optionally publish) a campaign update. If `publish` is true,
 * we set published_at AND fan out a campaign_update_posted notification
 * to every active backer of the campaign — both happen inside one
 * transaction so we don't end up with a published update missing
 * notifications (or vice versa).
 */
export async function postCampaignUpdate(campaignId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const campaign = await requireOwnedCampaign(campaignId, user.id);

  const parsed = PostUpdateSchema.parse({
    title: formData.get('title'),
    bodyMd: formData.get('bodyMd'),
    isBackersOnly: formData.get('isBackersOnly') ?? 'false',
    publish: formData.get('publish') ?? 'true',
  });

  const db = getDb();
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(campaignUpdates)
      .values({
        campaignId,
        authorId: user.id,
        title: parsed.title,
        bodyMd: parsed.bodyMd,
        isBackersOnly: parsed.isBackersOnly,
        publishedAt: parsed.publish ? sql`now()` : null,
      })
      .returning({ id: campaignUpdates.id });

    if (!inserted) throw new Error('update_insert_failed');

    if (parsed.publish) {
      // Fan out to every active backer (pending or charged). Hidden
      // notifications still respect the user's preferences when emails
      // ship in M8; for now we always write the in-app row.
      const backers = await tx
        .select({ backerId: pledges.backerId })
        .from(pledges)
        .where(
          and(eq(pledges.campaignId, campaignId), sql`${pledges.status} IN ('pending', 'charged')`),
        );

      if (backers.length > 0) {
        await tx.insert(notifications).values(
          backers.map((b) =>
            buildNotification({
              userId: b.backerId,
              kind: 'campaign_update_posted',
              payload: {
                campaignId,
                campaignTitle: campaign.title,
                campaignSlug: campaign.slug,
                updateId: inserted.id,
                updateTitle: parsed.title,
              },
            }),
          ),
        );
      }
    }
  });

  revalidatePath(`/c/${campaign.slug}`);
  revalidatePath(`/c/${campaign.slug}/updates`);
  revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
}

export async function editCampaignUpdate(updateId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  // Owner-check via campaign join.
  const owned = await db
    .select({ update: campaignUpdates, slug: campaigns.slug })
    .from(campaignUpdates)
    .innerJoin(campaigns, eq(campaigns.id, campaignUpdates.campaignId))
    .where(and(eq(campaignUpdates.id, updateId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  if (!owned[0]) throw new Error('update_not_found_or_not_owned');

  const raw: Record<string, unknown> = {};
  for (const k of ['title', 'bodyMd', 'isBackersOnly', 'publish'] as const) {
    const v = formData.get(k);
    if (v !== null && v !== '') raw[k] = v;
  }
  const parsed = UpdateUpdateSchema.parse(raw);

  await db
    .update(campaignUpdates)
    .set({
      ...parsed,
      // If this edit publishes a previously-draft update, set
      // published_at; we don't backfill a publish notification here —
      // editing-then-publishing would double-notify if we did.
      publishedAt: parsed.publish && !owned[0].update.publishedAt ? sql`now()` : undefined,
      updatedAt: sql`now()`,
    })
    .where(eq(campaignUpdates.id, updateId));

  revalidatePath(`/c/${owned[0].slug}/updates`);
  revalidatePath(`/dashboard/campaigns/${owned[0].update.campaignId}/edit`);
}

export async function deleteCampaignUpdate(updateId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  const owned = await db
    .select({ update: campaignUpdates, slug: campaigns.slug })
    .from(campaignUpdates)
    .innerJoin(campaigns, eq(campaigns.id, campaignUpdates.campaignId))
    .where(and(eq(campaignUpdates.id, updateId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  if (!owned[0]) throw new Error('update_not_found_or_not_owned');

  await db.delete(campaignUpdates).where(eq(campaignUpdates.id, updateId));

  revalidatePath(`/c/${owned[0].slug}/updates`);
  revalidatePath(`/dashboard/campaigns/${owned[0].update.campaignId}/edit`);
}
