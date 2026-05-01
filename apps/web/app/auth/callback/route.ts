import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/server/auth';

/**
 * Magic-link callback. Supabase redirects here with `?code=...` after the user clicks the email link.
 * We exchange the code for a session, then bounce them to the dashboard (or `next` param if provided).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent('Missing code')}`);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
