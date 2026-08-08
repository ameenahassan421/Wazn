import type { WorkoutSet } from './types'

/**
 * Superset helpers.
 *
 * A superset is a property of the sets, not of the workout: the group id lives
 * on `workout_sets.superset_group`, so the same two lifts can be supersetted
 * one week and not the next, and the Hevy history backfills straight in.
 */

/** Exercise ids in each group, in the order they were first logged. */
export function groupsFromSets(sets: WorkoutSet[]): Map<number, string[]> {
  const groups = new Map<number, string[]>()
  for (const s of sets) {
    if (s.superset_group === null) continue
    const members = groups.get(s.superset_group) ?? []
    if (!members.includes(s.exercise_id)) members.push(s.exercise_id)
    groups.set(s.superset_group, members)
  }
  return groups
}

/** The group an exercise belongs to in this workout, or null. */
export function groupOf(sets: WorkoutSet[], exerciseId: string): number | null {
  for (const s of sets) {
    if (s.exercise_id === exerciseId && s.superset_group !== null)
      return s.superset_group
  }
  return null
}

/**
 * Set ids whose `superset_group` should be cleared when `exerciseId` leaves.
 *
 * Includes the sets of whoever is left behind when only one member remains: a
 * superset of one is not a superset, and a lone exercise still wearing an
 * "SS 1" badge is a group the user cannot see the other half of. Grouping used
 * to be permanent, so this is the first code that ever had to answer it.
 */
export function ungroupIds(sets: WorkoutSet[], exerciseId: string): string[] {
  const group = groupOf(sets, exerciseId)
  if (group === null) return []

  const members = groupsFromSets(sets).get(group) ?? []
  const dissolve = members.filter((id) => id !== exerciseId).length <= 1

  return sets
    .filter(
      (s) => s.superset_group === group && (dissolve || s.exercise_id === exerciseId),
    )
    .map((s) => s.id)
}

/** Lowest unused group id, so ids stay small and readable. */
export function nextGroupId(sets: WorkoutSet[]): number {
  const used = new Set(
    sets.map((s) => s.superset_group).filter((g): g is number => g !== null),
  )
  let id = 1
  while (used.has(id)) id += 1
  return id
}

/**
 * Which exercise to move to after logging a set in a superset.
 *
 * Alternating means: whoever has the fewest sets logged goes next, and ties
 * break by the group's order. That handles the real case where you log two
 * sets of A before remembering B, without stranding B.
 *
 * Returns null when the current exercise is the one that should go next —
 * i.e. everyone else is caught up, so it is a fresh round.
 */
export function nextInGroup(
  sets: WorkoutSet[],
  members: string[],
  currentExerciseId: string,
): string | null {
  if (members.length < 2) return null

  const counts = new Map(members.map((id) => [id, 0]))
  for (const s of sets) {
    if (counts.has(s.exercise_id))
      counts.set(s.exercise_id, counts.get(s.exercise_id)! + 1)
  }

  let best: string | null = null
  let bestCount = Number.POSITIVE_INFINITY
  for (const id of members) {
    const c = counts.get(id) ?? 0
    if (c < bestCount) {
      bestCount = c
      best = id
    }
  }
  return best === currentExerciseId ? null : best
}

/**
 * A superset rests once per round, not between its exercises — that is the
 * whole point. True only when every member has as many sets as the one just
 * logged, meaning the round is complete.
 */
export function roundComplete(sets: WorkoutSet[], members: string[]): boolean {
  if (members.length < 2) return true
  const counts = members.map((id) => sets.filter((s) => s.exercise_id === id).length)
  return new Set(counts).size === 1
}
