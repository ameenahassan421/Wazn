import { supabase } from './supabase'

/** One row of the catalogue, as the picker needs it. */
export interface CatalogueExercise {
  id: string
  name: string
  muscleGroup: string
  equipment: string
  /** Working sets this lifter has ever logged against it. 0 for never. */
  setCount: number
}

/**
 * The catalogue, ranked by what this lifter actually trains.
 *
 * ── ALPHABETICAL IS THE WRONG DEFAULT AND IT IS NOT CLOSE ───────────────────
 * The catalogue is 130-odd lifts and a given lifter uses maybe fifteen. Sorted
 * by name, "Bench Press" is reachable and "Romanian Deadlift" is nine screens
 * down; sorted by use, both are in the first ten for the person who does them.
 * `exercise_usage()` is the RPC the web picker has always sorted by and it
 * costs one extra round trip, made in parallel.
 *
 * Ties break alphabetically rather than by `last_used`, so the list does not
 * reorder itself between two openings in the same session. A picker whose rows
 * move while you are reaching for one is worse than a slow one.
 *
 * A failed usage read is not fatal: the catalogue still comes back, in name
 * order, which is a worse list rather than no list. The catalogue read failing
 * IS fatal, because there is nothing to show.
 */
export async function fetchCatalogue(): Promise<CatalogueExercise[]> {
  const [catalogue, usage] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, name, muscle_group, equipment')
      .order('name'),
    supabase.rpc('exercise_usage'),
  ])

  if (catalogue.error !== null) throw new Error(catalogue.error.message)

  const counts = new Map<string, number>()
  for (const row of (usage.data ?? []) as {
    exercise_id: string
    set_count: number
  }[]) {
    counts.set(row.exercise_id, Number(row.set_count))
  }

  const rows = (
    (catalogue.data ?? []) as {
      id: string
      name: string
      muscle_group: string | null
      equipment: string | null
    }[]
  ).map((e) => ({
    id: e.id,
    name: e.name,
    muscleGroup: e.muscle_group ?? '',
    equipment: e.equipment ?? '',
    setCount: counts.get(e.id) ?? 0,
  }))

  // Already name-ordered by the query, so a stable sort on count alone gives
  // "most used first, alphabetical within that" without a second comparator.
  return rows.sort((a, b) => b.setCount - a.setCount)
}
