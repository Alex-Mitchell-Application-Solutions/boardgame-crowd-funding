import { describe, expect, it } from 'vitest';
import { cn } from '../src/index.js';

describe('cn', () => {
  it('merges conditional class names', () => {
    const include: boolean = false;
    expect(cn('a', include && 'b', 'c')).toBe('a c');
  });

  it('dedupes conflicting Tailwind utilities via tailwind-merge', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
