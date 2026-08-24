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

/**
 * The muscle groups a custom lift can belong to.
 *
 * Hard-coded here rather than imported from `scripts/muscle_groups.ts`, which
 * is a build-time tool that reaches for `../src/lib/types` and never crosses
 * `portable.ts`.
 *
 * ── THIS LIST IS THE CHECK CONSTRAINT, AND FOR A WHILE IT WAS NOT ───────────
 * The comment here used to say "these are the values `exercises.muscle_group`
 * already holds in production", and offered `legs`, `arms` and `other`.
 * `0001_init.sql:17` constrains the column to eleven values and no migration
 * has ever widened it, so three of the eight chips could not create anything:
 * Postgres raised 23514, `createCustomExercise` threw, and the lifter got
 * "Could not create that exercise. Try again." for as long as they kept
 * tapping. The two most reachable buckets on the row, Legs and Arms, were two
 * of the three.
 *
 * They were also the three with no `muscle.*` key, so they rendered as raw
 * lowercase English on an Arabic build. That was the visible half of a defect
 * whose real half was invisible until the insert failed.
 *
 * Every value below has a `muscle.*` entry in both locales already, because
 * this list is now exactly the constraint. **Adding one means a migration
 * first.** A value the column rejects is not a chip, it is a dead end.
 */
export const CUSTOM_MUSCLE_GROUPS = [
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
] as const
export type CustomMuscleGroup = (typeof CUSTOM_MUSCLE_GROUPS)[number]

/**
 * The equipment a custom lift uses.
 *
 * `bodyweight` is not cosmetic and is the reason this field is asked for at
 * all: `choose()` in `session/add.tsx` reads it to decide whether the board
 * shows a weight dial. Get it wrong and a barbell lift has no way to record a
 * weight, which is the exact failure this whole screen exists to fix.
 */
export const CUSTOM_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'other',
] as const
export type CustomEquipment = (typeof CUSTOM_EQUIPMENT)[number]

/**
 * Create a lift that is not in the catalogue.
 *
 * ── WHY THIS IS THE CHEAPEST POINT ON THE ROADMAP ───────────────────────────
 * Until this shipped, a lifter whose movement was not among the 135 global
 * rows could not log their workout at all. Not "had fewer options": could not
 * use the app. `owner_id`, `is_custom` and an `exercises_insert_own` RLS policy
 * have been in the schema since migration 0014 with nothing on any platform
 * calling them, and `mobile/` mentioned `owner_id` zero times.
 *
 * No migration was needed. This is one insert against a policy that already
 * existed.
 *
 * ── WHAT IS NOT ASKED FOR, AND WHY ──────────────────────────────────────────
 * Name, muscle group, equipment. Nothing else. The lifter wanted to log a set
 * thirty seconds ago, and every extra field is paid at exactly the moment the
 * app is most in the way. Rest seconds default per-lift elsewhere, instructions
 * are for the SEO pages, and an image would need an upload path.
 */
export async function createCustomExercise(input: {
  name: string
  muscleGroup: CustomMuscleGroup
  equipment: CustomEquipment
}): Promise<CatalogueExercise> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2) throw new Error('short-name')
  if (name.length > 80) throw new Error('long-name')

  // The owner comes from the session, never from a caller. RLS enforces this
  // too (`exercises_insert_own`), so a wrong id here fails rather than writing
  // somebody else's row, but sending the right one keeps the error honest.
  const { data: user } = await supabase.auth.getUser()
  const ownerId = user.user?.id
  if (ownerId === undefined) throw new Error('signed-out')

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name,
      muscle_group: input.muscleGroup,
      equipment: input.equipment,
      is_custom: true,
      owner_id: ownerId,
    })
    .select('id, name, muscle_group, equipment')
    .single()

  if (error !== null) throw new Error(error.message)

  const row = data as {
    id: string
    name: string
    muscle_group: string | null
    equipment: string | null
  }
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group ?? '',
    equipment: row.equipment ?? '',
    // Brand new, so nothing has ever been logged against it. Stated rather
    // than left undefined: the picker sorts on this field.
    setCount: 0,
  }
}
