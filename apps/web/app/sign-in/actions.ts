'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/server/auth';
import { getEnv } from '@/server/env';

const FormSchema = z.object({
  email: z.string().email(),
});

export async function signInWithMagicLink(formData: FormData) {
  const parsed = FormSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    redirect('/sign-in?error=' + encodeURIComponent('Please enter a valid email address.'));
  }

  const env = getEnv();
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    redirect('/sign-in?error=' + encodeURIComponent(error.message));
  }

  redirect('/sign-in?sent=1');
}
