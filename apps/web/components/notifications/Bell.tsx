'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Props = {
  initialCount: number;
};

const POLL_INTERVAL_MS = 30_000;

/**
 * Bell badge. First paint uses the server-rendered `initialCount`; we
 * refresh by polling the `/api/notifications/unread-count` JSON endpoint
 * every 30s while the tab is focused. Skipping the poll while hidden
 * keeps idle tabs cheap.
 *
 * We deliberately stay off TanStack Query — for one polling endpoint
 * with no cache invalidation needs, plain useEffect + fetch is shorter
 * and ships no extra dependency.
 */
export function Bell({ initialCount }: Props) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (!cancelled) setCount(data.count);
      } catch {
        // Network blip — try again next interval.
      }
    }

    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return (
    <Link
      href="/account/notifications"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
      className="relative inline-flex items-center rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
    >
      <BellIcon />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
