// Slug generation for campaign URLs. Pure function — the action layer is
// responsible for ensuring uniqueness against the DB (typically by appending
// a short random suffix on conflict).

const MAX_SLUG_LENGTH = 60;

/**
 * Convert a campaign title into a URL-safe slug.
 *
 *   "Cthulhu's Castle: Legacy Edition" → "cthulhus-castle-legacy-edition"
 *   "  ✨ Magic ✨  "                  → "magic"
 *   ""                                  → "campaign" (fallback)
 */
export function slugify(title: string): string {
  const normalised = title
    .toLowerCase()
    // Strip diacritics: decompose, then drop combining marks.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Drop apostrophes outright so "cthulhu's" becomes "cthulhus", not
    // "cthulhu-s". Both ASCII (') and curly (’) variants.
    .replace(/['’]/g, '')
    // Anything else not alphanum becomes a hyphen.
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse runs of hyphens.
    .replace(/-+/g, '-')
    // Trim leading/trailing hyphens.
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // Re-trim if the slice cut a trailing hyphen.
    .replace(/-+$/g, '');

  return normalised.length > 0 ? normalised : 'campaign';
}

/**
 * Append a short random suffix to a slug for conflict resolution.
 * Six base36 characters gives us ~2 billion combinations — comfortably
 * unique for any realistic title-collision rate, and short enough that
 * the URL stays readable.
 */
export function withRandomSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  // Truncate the base if appending would exceed our length budget.
  const room = MAX_SLUG_LENGTH - suffix.length - 1;
  const base = slug.length > room ? slug.slice(0, room).replace(/-+$/g, '') : slug;
  return `${base}-${suffix}`;
}
