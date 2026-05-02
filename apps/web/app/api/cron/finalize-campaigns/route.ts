import { NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { campaigns } from '@bgcf/db';
import { getEnv } from '@/server/env';
import { getDb } from '@/server/db';
import { enqueueJob } from '@/server/jobs/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/finalize-campaigns
 *
 * Hit by Railway Cron every 5 minutes. Scans for live campaigns whose
 * deadlines have passed and enqueues a `finalize_campaign` job for each.
 *
 * Auth: bearer token matching CRON_SECRET — generated via
 * `openssl rand -hex 32` and shared with the cron config in Railway.
 *
 * Idempotency: pg-boss `singletonKey` is set to the campaign id, so a
 * cron run that fires again (overlapping schedule, retry, etc.) before
 * the previous job finishes will be deduped — only one finalize job per
 * campaign is in-flight at a time. The handler itself is also idempotent
 * (locks the campaign row and bails if already finalized).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const dueCampaigns = await db
    .select({ id: campaigns.id, slug: campaigns.slug })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'live'), lte(campaigns.deadlineAt, now)))
    .limit(500); // hard cap per run; next tick picks up any overflow.

  let enqueued = 0;
  const errors: Array<{ campaignId: string; error: string }> = [];

  for (const c of dueCampaigns) {
    try {
      await enqueueJob('finalize_campaign', { campaignId: c.id }, { singletonKey: c.id });
      enqueued += 1;
    } catch (err) {
      errors.push({
        campaignId: c.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return NextResponse.json({
    scanned: dueCampaigns.length,
    enqueued,
    errors,
    at: now.toISOString(),
  });
}
