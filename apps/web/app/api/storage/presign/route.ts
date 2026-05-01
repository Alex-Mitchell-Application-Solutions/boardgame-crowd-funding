import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { campaigns } from '@bgcf/db';
import { getOptionalUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { presignUpload, publicUrl, storageKeyFor } from '@/server/storage';
import { validateMediaUpload } from '@/server/storage/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  campaignId: z.string().uuid(),
  kind: z.enum(['cover', 'gallery_image', 'gallery_video']),
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(80),
  contentLength: z.number().int().positive(),
});

/**
 * POST /api/storage/presign — auth-gated. Verifies the caller owns the
 * target campaign, validates mime + size, signs a one-shot PUT URL, and
 * returns the signed URL alongside the public URL the client should
 * eventually persist on a `campaign_media` row (via addCampaignMedia()
 * Server Action after upload completes).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Validate the upload against per-kind allow-lists and size caps.
  const validation = validateMediaUpload({
    kind: parsed.kind,
    mimeType: parsed.mimeType,
    contentLength: parsed.contentLength,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Ownership check — caller must own the target campaign.
  const db = getDb();
  const owned = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, parsed.campaignId), eq(campaigns.creatorId, user.id)))
    .limit(1);
  if (owned.length === 0) {
    return NextResponse.json({ error: 'campaign_not_found_or_not_owned' }, { status: 403 });
  }

  const key = storageKeyFor({
    creatorUserId: user.id,
    campaignId: parsed.campaignId,
    kind: validation.kind,
    filename: parsed.filename,
  });

  const uploadUrl = await presignUpload({
    key,
    contentType: parsed.mimeType,
    contentLength: parsed.contentLength,
  });

  return NextResponse.json({
    uploadUrl,
    publicUrl: publicUrl(key),
    storageKey: key,
  });
}
