import { NextResponse } from 'next/server';
import { getOptionalUser } from '@/server/auth';
import { getUnreadCount } from '@/server/notifications/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lightweight JSON endpoint the Bell client component polls every 30s.
 * Returns 0 for unauthenticated users so the bell can fail-open silently.
 */
export async function GET() {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ count: 0 });
  }
  const count = await getUnreadCount(user.id);
  return NextResponse.json({ count });
}
