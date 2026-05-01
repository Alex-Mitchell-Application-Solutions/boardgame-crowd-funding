import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { getEnv } from './env';

/**
 * Build a Supabase client bound to the current request's cookies.
 * Use inside Server Components, Server Actions, and route handlers.
 */
export function getSupabaseServerClient() {
  const env = getEnv();
  const cookieStore = cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      async getAll() {
        return (await cookieStore).getAll();
      },
      async setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        const store = await cookieStore;
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Calling `set` from a Server Component throws — safe to ignore;
          // middleware refreshes the session on the next request.
        }
      },
    },
  });
}

/** Returns the current user, or null if no session. Cached per-request. */
export const getOptionalUser = cache(async (): Promise<User | null> => {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Returns the current user, or redirects to /sign-in if no session. */
export async function requireUser(): Promise<User> {
  const user = await getOptionalUser();
  if (!user) redirect('/sign-in');
  return user;
}
