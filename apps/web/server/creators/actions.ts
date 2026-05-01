'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { creatorProfiles } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { createConnectAccount, createOnboardingLink } from '@/server/stripe/connect';
import { getCreatorProfile } from './queries';

const CreateProfileSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(2000).optional(),
});

export async function createCreatorProfile(formData: FormData) {
  const user = await requireUser();
  const parsed = CreateProfileSchema.safeParse({
    displayName: formData.get('displayName'),
    bio: formData.get('bio') || undefined,
  });
  if (!parsed.success) {
    redirect(
      '/dashboard/connect?error=' + encodeURIComponent('Display name must be 2–80 characters.'),
    );
  }

  const db = getDb();
  await db
    .insert(creatorProfiles)
    .values({
      userId: user.id,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio,
    })
    .onConflictDoUpdate({
      target: creatorProfiles.userId,
      set: {
        displayName: parsed.data.displayName,
        bio: parsed.data.bio,
        updatedAt: sql`now()`,
      },
    });

  revalidatePath('/dashboard/connect');
}

/**
 * Kick off Stripe Connect Express onboarding. Creates a Connect account
 * if the creator doesn't have one, then redirects to a fresh Stripe-
 * hosted onboarding link.
 *
 * Idempotent on retry: if a Stripe account is already linked, we reuse
 * it and just generate a new onboarding link.
 */
export async function startStripeOnboarding() {
  const user = await requireUser();
  const profile = await getCreatorProfile(user.id);
  if (!profile) {
    redirect(
      '/dashboard/connect?error=' + encodeURIComponent('Create your creator profile first.'),
    );
  }

  let stripeAccountId = profile.stripeAccountId;
  if (!stripeAccountId) {
    stripeAccountId = await createConnectAccount(user.id);
    const db = getDb();
    await db
      .update(creatorProfiles)
      .set({ stripeAccountId, updatedAt: sql`now()` })
      .where(eq(creatorProfiles.userId, user.id));
  }

  const onboardingUrl = await createOnboardingLink(stripeAccountId);
  redirect(onboardingUrl);
}

/**
 * Refresh a stale onboarding link. Stripe redirects creators here when
 * the link they followed has expired; we just regenerate and bounce.
 */
export async function refreshStripeOnboardingLink() {
  const user = await requireUser();
  const profile = await getCreatorProfile(user.id);
  if (!profile?.stripeAccountId) {
    redirect('/dashboard/connect');
  }
  const onboardingUrl = await createOnboardingLink(profile.stripeAccountId);
  redirect(onboardingUrl);
}
