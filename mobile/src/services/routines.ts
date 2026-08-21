import { rotationOrder, type RoutineWithRun } from '@wazn/domain'

import { supabase } from '@/services/supabase'

/**
 * Everything the Plan tab reads.
 *
 * ── WHY THIS EXISTS WHEN `src/lib/routines.ts` ALREADY DOES ─────────────────
 * That module is the web app's, and it is deliberately NOT in `portable.ts`:
 * it closes over the browser Supabase client. The domain rule it depends on —
 * which routine is up next, and what order the list reads in — IS portable,
 * so `rotationOrder` is imported rather than transcribed. I/O adapted, domain
 * shared, which is the same split every other service here makes.
 *
 * ── TWO ROUND TRIPS, NOT FOUR ───────────────────────────────────────────────
 * A routine is three tables and the exercise names are in a fourth. Read
 * naively that is four sequential awaits. Here the routines (with their
 * exercise rows embedded) and the exercise catalogue go out together, and only
 * the planned sets have to wait, because their `in (...)` needs the ids the
 * first query returns.
 *
 * The Plan tab is not the logging path, so this is about the screen not
 * flashing three times rather than about milliseconds.
 */

/** One planned set, as stored. `null` weight is bodyweight, same as anywhere. */
export interface PlannedSet {
  set_number: number
  weight_kg: number | null
  reps: number | null
  set_type: string
}

export interface PlanExercise {
  id: string
  /** From the catalogue. Null when the id is not in it — the row is then
   *  counted but not named, which is better than printing a UUID at a lifter. */
  name: string | null
  sets: PlannedSet[]
}

export interface PlanRoutine extends RoutineWithRun {
  exercises: PlanExercise[]
}

interface RoutineRow {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
  workouts?: { started_at: string; ended_at: string | null }[] | null
  routine_exercises?: { id: string; exercise_id: string; position: number }[] | null
}

export async function fetchRoutines(): Promise<PlanRoutine[]> {
  const [routineRes, catalogueRes] = await Promise.all([
    supabase
      .from('routines')
      .select(
        '*, workouts(started_at, ended_at), routine_exercises(id, exercise_id, position)',
      )
      .order('position')
      .order('created_at'),
    supabase.from('exercises').select('id, name'),
  ])
  if (routineRes.error) throw routineRes.error

  const rows = (routineRes.data ?? []) as RoutineRow[]

  /*
   * The catalogue is allowed to fail on its own.
   *
   * Without it the routines still have their names, their counts and their
   * rotation order — everything the list is FOR. Losing the screen because the
   * exercise names could not be resolved would trade the whole tab for a
   * preview line. Same trade `progress.ts` makes with records.
   */
  const nameById = new Map<string, string>()
  for (const e of (catalogueRes.data ?? []) as { id: string; name: string }[]) {
    nameById.set(e.id, e.name)
  }

  const exerciseIds = rows.flatMap((r) => (r.routine_exercises ?? []).map((e) => e.id))
  const setsByExercise = new Map<string, PlannedSet[]>()
  if (exerciseIds.length > 0) {
    const { data: setRows, error: setErr } = await supabase
      .from('routine_sets')
      .select('routine_exercise_id, set_number, weight_kg, reps, set_type')
      .in('routine_exercise_id', exerciseIds)
      .order('set_number')
    if (setErr) throw setErr
    for (const s of (setRows ?? []) as (PlannedSet & {
      routine_exercise_id: string
    })[]) {
      const list = setsByExercise.get(s.routine_exercise_id)
      if (list === undefined) setsByExercise.set(s.routine_exercise_id, [s])
      else list.push(s)
    }
  }

  return rotationOrder(
    rows.map(({ workouts, routine_exercises, ...routine }) => {
      /*
       * Finished runs only, matching `session_brief()`'s `ended_at is not
       * null` — and matching `listRoutines`, which had to say the same thing.
       * An abandoned session is not a run, and counting it would rotate a
       * routine away from somebody who never actually did it.
       */
      let last: string | null = null
      for (const w of workouts ?? []) {
        if (w.ended_at === null) continue
        if (last === null || w.started_at > last) last = w.started_at
      }

      const exercises = [...(routine_exercises ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((e) => ({
          id: e.id,
          name: nameById.get(e.exercise_id) ?? null,
          sets: setsByExercise.get(e.id) ?? [],
        }))

      return {
        ...routine,
        last_run_at: last,
        exercise_count: exercises.length,
        exercises,
      }
    }),
  )
}
