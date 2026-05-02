import 'server-only';
import Link from 'next/link';
import { getOptionalUser } from '@/server/auth';
import { getUnreadCount } from '@/server/notifications/queries';
import { Bell } from '@/components/notifications/Bell';

/**
 * Renders the global app navigation. When a user is signed in we also
 * fetch their unread-notification count so the Bell client component can
 * paint with a correct badge on first render (rather than flashing zero
 * then snapping to the real count after the first poll).
 */
export async function AppHeader() {
  const user = await getOptionalUser();
  const unreadCount = user ? await getUnreadCount(user.id) : 0;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Boardgame Crowdfunding
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link href="/browse" className="hover:text-slate-900">
              Browse
            </Link>
            {user ? (
              <Link href="/dashboard" className="hover:text-slate-900">
                Dashboard
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Bell initialCount={unreadCount} />
              <Link
                href="/account/notifications/preferences"
                className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {user.email}
              </Link>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
