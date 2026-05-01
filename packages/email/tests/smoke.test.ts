import { describe, expect, it } from 'vitest';
import { EMAIL_PACKAGE_VERSION } from '../src/index.js';

describe('email smoke', () => {
  it('exposes a version constant', () => {
    expect(EMAIL_PACKAGE_VERSION).toBe('0.0.0');
  });
});
