/**
 * The exercise catalog, read once per isolate.
 *
 * `ungroundedNames()` needs to know what an exercise name looks like before it
 * can say a name was invented, and `public.exercises` is that list. The
 * seeded rows are identical for every user and change roughly never — a new
 * one arrives when someone edits `scripts/`— so fetching it per request would
 * be a round trip spent re-learning a constant.
 *
 * Cached in a module-level variable, which on Deno Deploy means "for the life
 * of this isolate": minutes to hours, reset by any deploy. That is exactly the
 * right staleness for this. A newly-seeded exercise being absent for an hour
 * makes the guard slightly more permissive for an hour, which is the harmless
 * direction — the failure mode of a stale catalog is a missed catch, never a
 * false accusation against a real lift.
 *
 * Custom exercises (`owner_id is not null`) are deliberately excluded. They
 * are one user's private rows, this cache is shared across every request an
 * isolate serves, and one user's exercise names have no business influencing
 * what another user's review is allowed to say.
 */

import type { Caller } from './context.ts'

let cached: string[] | null = null

/** Test seam. Nothing in production calls this. */
export function resetCatalog(): void {
  cached = null
}

export async function exerciseCatalog(caller: Caller): Promise<string[]> {
  if (cached) return cached

  // Under the caller's JWT: `exercises_select_visible` already limits them to
  // seeded rows plus their own, and the filter below drops their own.
  const { data, error } = await caller.asUser
    .from('exercises')
    .select('name')
    .is('owner_id', null)
    .limit(2000)

  if (error || !data) {
    // Fails OPEN, and loudly. An empty catalog turns the invented-lift check
    // off rather than failing every review — the same reasoning as
    // `hasTrainingData`. A guard that cannot read its reference data must not
    // start rejecting good output.
    console.warn('exercise catalog unavailable; name check disabled', error)
    return []
  }

  cached = data.map((row) => row.name as string).filter(Boolean)
  return cached
}
