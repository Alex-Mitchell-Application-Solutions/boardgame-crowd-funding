import 'server-only';
import { eq } from 'drizzle-orm';
import { creatorProfiles, type CreatorProfile } from '@bgcf/db';
import { getDb } from '../db';

export async function getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
