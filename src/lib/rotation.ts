import type { Routine } from './types'

/**
 * Which routine is up next, and the order the list should read in.
 *
 * L9: `session_brief()` already computes a due routine by rotation and the
 * briefing card says "Core & Conditioning is up". The list directly underneath
 * it was sorted by stored `position`, so the card named a day the list did not
 * reflect, and the obvious tap was the wrong one.
 *
 * The rule matches the one the SQL uses, and is stated here once rather than
 * being read off the brief card: a card is dismissible and may not have loaded,
 * and a list whose order depends on a card that might be absent is worse than a
 * list with its own rule.
 *
 * The rule is `session_brief()`'s, transcribed rather than invented, because a
 * card saying "Upper A is up" above a list headed by a different routine is the
 * defect L9 describes. Migration 0021 sorts:
 *
 *     order by max(f.started_at) asc nulls first, r.position, r.id
 *
 * where `f` is workouts with `ended_at is not null`. So:
 *
 *  1. A routine never run comes first: `nulls first`. It is the one thing a
 *     lifter has explicitly planned and not yet done.
 *  2. Then longest since last run, which is what rotation means.
 *  3. Then the user's own order, then id.
 *
 * **A started-but-unfinished workout does not count as a run**, matching the
 * `ended_at is not null` filter. Getting that wrong would make abandoning a
 * session look like completing it and rotate the routine away.
 *
 * The first draft of this tie-broke on `created_at` and counted every workout,
 * finished or not. A screenshot showed the briefing card and the list naming
 * different routines, which is how a two-implementation rule announces itself.
 */
export interface RoutineWithRun extends Routine {
  /** `started_at` of the most recent FINISHED workout from it, or null. */
  last_run_at: string | null
  /**
   * How many exercises the routine plans, for the Up next card's meta line.
   * Null when the count did not come back — the card then says less rather
   * than claiming a routine has no exercises in it.
   */
  exercise_count?: number | null
}

export function rotationOrder<T extends RoutineWithRun>(routines: T[]): T[] {
  return [...routines].sort((a, b) => {
    const aNever = a.last_run_at === null
    const bNever = b.last_run_at === null
    if (aNever !== bNever) return aNever ? -1 : 1
    if (!aNever && !bNever && a.last_run_at !== b.last_run_at) {
      // Oldest first: the one you have gone longest without.
      return (a.last_run_at as string) < (b.last_run_at as string) ? -1 : 1
    }
    if (a.position !== b.position) return a.position - b.position
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * The routine to lead with, or null when there is nothing to suggest.
 *
 * Null when the user has no routines, and null when there is exactly one:
 * calling a single routine "due" is telling somebody the only door is the door.
 */
export function dueRoutine<T extends RoutineWithRun>(routines: T[]): T | null {
  if (routines.length < 2) return null
  return rotationOrder(routines)[0] ?? null
}
