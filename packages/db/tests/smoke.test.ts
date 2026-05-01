import { describe, expect, it } from 'vitest';
import { authUsers } from '../src/schema/auth.js';

describe('schema smoke', () => {
  it('exposes the auth.users reference table', () => {
    expect(authUsers).toBeDefined();
  });
});
