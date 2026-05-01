import { describe, expect, it } from 'vitest';
import { JOBS_PACKAGE_VERSION } from '../src/index.js';

describe('jobs smoke', () => {
  it('exposes a version constant', () => {
    expect(JOBS_PACKAGE_VERSION).toBe('0.0.0');
  });
});
