import type { Exercise } from './types'

/**
 * Picker filters: one muscle group, one piece of equipment.
 *
 * Both single-select. A picker is opened to answer "what am I doing next",
 * and the answer is one lift — multi-select would widen a list that is
 * already ordered by what you actually train, in exchange for a mental model
 * nobody wants to hold between sets.
 *
 * Kept out of the component because the option list has to be derived from
 * the catalogue rather than declared: a chip that matches nothing is a dead
 * end, and custom exercises mean the set of equipment values is open.
 */

export interface ExerciseFilter {
  muscleGroup: string | null
  equipment: string | null
}

export const NO_FILTER: ExerciseFilter = { muscleGroup: null, equipment: null }

export function filterActive(filter: ExerciseFilter): boolean {
  return filter.muscleGroup !== null || filter.equipment !== null
}

/**
 * The order in the 0001 check constraint: push, pull, legs, then the rest.
 * It is the order a lifter thinks in, and alphabetical is not — "biceps,
 * back, calves, cardio" puts two leg groups either side of a chest lift.
 */
const MUSCLE_ORDER = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
]

export interface FilterOptions {
  muscleGroups: string[]
  equipment: string[]
}

/** Only values the catalogue actually contains, so no chip finds nothing. */
export function filterOptions(exercises: Exercise[]): FilterOptions {
  const muscles = new Set<string>()
  const equipmentCounts = new Map<string, number>()
  for (const exercise of exercises) {
    if (exercise.muscle_group) muscles.add(exercise.muscle_group)
    const equipment = exercise.equipment?.trim().toLowerCase()
    if (equipment)
      equipmentCounts.set(equipment, (equipmentCounts.get(equipment) ?? 0) + 1)
  }

  const known = MUSCLE_ORDER.filter((m) => muscles.has(m))
  // A custom exercise cannot introduce a new muscle group — the column is
  // constrained — but a schema change could, and a value the app has never
  // heard of should still be reachable rather than silently dropped.
  const unknown = [...muscles].filter((m) => !MUSCLE_ORDER.includes(m)).sort()

  return {
    muscleGroups: [...known, ...unknown],
    // Commonest first: `barbell` and `dumbbell` are most of the catalogue and
    // belong under the thumb, not behind a scroll.
    equipment: [...equipmentCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name),
  }
}

/**
 * Equipment compares case-insensitively: the column is free text filled by a
 * fuzzy import, so "Cable" and "cable" both exist in the wild.
 */
export function applyFilter(exercises: Exercise[], filter: ExerciseFilter): Exercise[] {
  if (!filterActive(filter)) return exercises
  return exercises.filter((exercise) => {
    if (filter.muscleGroup !== null && exercise.muscle_group !== filter.muscleGroup) {
      return false
    }
    if (
      filter.equipment !== null &&
      exercise.equipment?.trim().toLowerCase() !== filter.equipment
    ) {
      return false
    }
    return true
  })
}

/** "cable · shoulders" — what the empty state has to name to be useful. */
export function describeFilter(filter: ExerciseFilter): string {
  return [filter.equipment, filter.muscleGroup].filter(Boolean).join(' · ')
}

/**
 * Name search, with the ranking the picker has always used.
 *
 * ── WHY THIS IS A FUNCTION AND NOT FOUR LINES AT THE CALL SITE ──────────────
 * It was four lines at the call site, inside `ExercisePicker.tsx`, and when
 * the native picker needed the same behaviour the only options were to copy it
 * or to share it. Copying is how "ohp" starts finding Overhead Press on one
 * platform and not the other — the same class of divergence `portable.ts`
 * exists to prevent for the arithmetic.
 *
 * The ranking matters and is easy to lose in a rewrite: a name that STARTS
 * with the query sorts above one that merely contains it, and ties fall back
 * to the order the caller handed in — which is usage order in the web picker,
 * so a lift you actually train wins a tie against one you have never touched.
 */
export function searchByName<T extends { name: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...items]
  const matches = items.filter((e) => e.name.toLowerCase().includes(q))
  return matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return items.indexOf(a) - items.indexOf(b)
  })
}
