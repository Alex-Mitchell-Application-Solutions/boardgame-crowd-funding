import { describe, expect, it } from 'vitest';
import { slugify, withRandomSuffix } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a normal title', () => {
    expect(slugify('Forest of Spirits')).toBe('forest-of-spirits');
  });

  it('strips punctuation', () => {
    expect(slugify("Cthulhu's Castle: Legacy Edition!")).toBe('cthulhus-castle-legacy-edition');
  });

  it('collapses multiple separators', () => {
    expect(slugify('A   B___C   D')).toBe('a-b-c-d');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  ✨ Magic ✨  ')).toBe('magic');
  });

  it('strips diacritics', () => {
    expect(slugify('Château Forêt')).toBe('chateau-foret');
  });

  it('falls back to "campaign" for empty / non-alphanum input', () => {
    expect(slugify('')).toBe('campaign');
    expect(slugify('___')).toBe('campaign');
    expect(slugify('!!!')).toBe('campaign');
  });

  it('truncates very long titles', () => {
    const long = 'a'.repeat(200);
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).not.toMatch(/-$/);
  });
});

describe('withRandomSuffix', () => {
  it('appends a hyphen plus suffix', () => {
    const out = withRandomSuffix('forest-of-spirits');
    expect(out).toMatch(/^forest-of-spirits-[a-z0-9]{6}$/);
  });

  it('keeps total length within the budget', () => {
    const long = 'a'.repeat(60);
    const out = withRandomSuffix(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toMatch(/-[a-z0-9]{6}$/);
  });

  it('produces different suffixes across calls (high probability)', () => {
    const a = withRandomSuffix('test');
    const b = withRandomSuffix('test');
    // Not strictly impossible but extremely improbable.
    expect(a).not.toBe(b);
  });
});
