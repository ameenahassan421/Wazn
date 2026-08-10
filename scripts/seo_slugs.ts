/**
 * SEO slug generation for exercise pages.
 *
 * Conventions:
 * - Lowercase ASCII only.
 * - Parenthetical content kept, parens stripped: "(Barbell)" → "-barbell".
 * - Runs of non-alphanumeric characters collapsed to a single hyphen.
 * - Leading/trailing hyphens trimmed.
 * - Duplicates resolved by appending "-2", "-3", etc. in alphabetical name order.
 * - Slugs are stable and deterministic given the same input.
 */

/** Convert an exercise name to a URL-safe slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Build a slug map from an array of exercise names. Input is sorted
 * alphabetically so duplicate resolution is deterministic: the first
 * exercise alphabetically wins the base slug, subsequent collisions get
 * "-2", "-3", etc.
 */
export function assignSlugs(names: string[]): Map<string, string> {
  const sorted = [...names].sort()
  const seen = new Map<string, number>() // base-slug → count
  const result = new Map<string, string>()

  for (const name of sorted) {
    const base = slugify(name)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    result.set(name, count === 0 ? base : `${base}-${count + 1}`)
  }

  return result
}

/** English page path for a given slug. */
export function exercisePath(slug: string): string {
  return `/exercises/${slug}.html`
}

/** Arabic page path for a given slug. */
export function exercisePathAr(slug: string): string {
  return `/ar/exercises/${slug}.html`
}

/** Full absolute URL for a page. */
export function exerciseUrl(
  slug: string,
  locale: 'en' | 'ar',
  siteUrl: string,
): string {
  const path = locale === 'en' ? exercisePath(slug) : exercisePathAr(slug)
  return `${siteUrl}${path}`
}
