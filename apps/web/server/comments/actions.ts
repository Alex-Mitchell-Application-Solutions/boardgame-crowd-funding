'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { campaigns, comments, notifications } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { buildNotification } from '@/server/notifications/lib/factories';

const PostCommentSchema = z.object({
  campaignId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  body: z.string().trim().min(1).max(5_000),
});

/**
 * Post a comment on a campaign. Generates a `comment_reply` notification
 * to the parent comment's author when this is a reply (and the author
 * isn't replying to themselves).
 */
export async function postComment(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = PostCommentSchema.parse({
    campaignId: formData.get('campaignId'),
    parentId: formData.get('parentId') || null,
    body: formData.get('body'),
  });

  const db = getDb();

  // Resolve campaign visibility + parent author in one round trip when
  // we need both.
  const campaignRows = await db
    .select({ status: campaigns.status, slug: campaigns.slug })
    .from(campaigns)
    .where(eq(campaigns.id, parsed.campaignId))
    .limit(1);
  const campaign = campaignRows[0];
  if (!campaign) throw new Error('campaign_not_found');
  if (campaign.status !== 'live' && campaign.status !== 'succeeded') {
    throw new Error('comments_closed');
  }

  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(comments)
      .values({
        campaignId: parsed.campaignId,
        authorId: user.id,
        parentId: parsed.parentId ?? null,
        body: parsed.body,
      })
      .returning({ id: comments.id });
    if (!inserted) throw new Error('comment_insert_failed');

    // If this is a reply, notify the parent author (unless they're the
    // one replying).
    if (parsed.parentId) {
      const parentRows = await tx
        .select({ authorId: comments.authorId })
        .from(comments)
        .where(eq(comments.id, parsed.parentId))
        .limit(1);
      const parentAuthorId = parentRows[0]?.authorId;
      if (parentAuthorId && parentAuthorId !== user.id) {
        await tx.insert(notifications).values(
          buildNotification({
            userId: parentAuthorId,
            kind: 'comment_reply',
            payload: {
              campaignId: parsed.campaignId,
              campaignSlug: campaign.slug,
              commentId: inserted.id,
              parentCommentId: parsed.parentId,
              actorId: user.id,
            },
          }),
        );
      }
    }
  });

  revalidatePath(`/c/${campaign.slug}`);
}

/** Author can delete their own comments. */
export async function deleteOwnComment(commentId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  const owned = await db
    .select({ comment: comments, slug: campaigns.slug })
    .from(comments)
    .innerJoin(campaigns, eq(campaigns.id, comments.campaignId))
    .where(and(eq(comments.id, commentId), eq(comments.authorId, user.id)))
    .limit(1);
  if (!owned[0]) throw new Error('comment_not_found_or_not_owned');

  await db.delete(comments).where(eq(comments.id, commentId));
  revalidatePath(`/c/${owned[0].slug}`);
}

/** Creator can hide a comment on their own campaign (moderation). */
export async function hideCommentAsCreator(commentId: string): Promise<void> {
  const user = await requireUser();
  const db = getDb();

  const owned = await db
    .select({ comment: comments, slug: campaigns.slug })
    .from(comments)
    .innerJoin(campaigns, eq(campaigns.id, comments.campaignId))
    .where(and(eq(comments.id, commentId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  if (!owned[0]) throw new Error('comment_not_found_or_not_creator_owned');

  await db.update(comments).set({ isHidden: true }).where(eq(comments.id, commentId));
  revalidatePath(`/c/${owned[0].slug}`);
}
