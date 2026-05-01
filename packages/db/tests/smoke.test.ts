import { describe, expect, it } from 'vitest';
import { authUsers, creatorProfiles, processedStripeEvents } from '../src/schema';

describe('schema smoke', () => {
  it('exposes the auth.users reference table from drizzle-orm/supabase', () => {
    expect(authUsers).toBeDefined();
  });

  it('exposes creator_profiles', () => {
    expect(creatorProfiles).toBeDefined();
  });

  it('exposes processed_stripe_events', () => {
    expect(processedStripeEvents).toBeDefined();
  });
});
