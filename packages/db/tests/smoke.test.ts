import { describe, expect, it } from 'vitest';
import { creatorProfiles, processedStripeEvents } from '../src/schema';

describe('schema smoke', () => {
  it('exposes creator_profiles', () => {
    expect(creatorProfiles).toBeDefined();
  });

  it('exposes processed_stripe_events', () => {
    expect(processedStripeEvents).toBeDefined();
  });
});
