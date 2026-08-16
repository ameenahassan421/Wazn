import type { SetType, WorkoutSet } from './types'

/**
 * The arithmetic behind editing a finished workout, kept pure so it can be
 * tested without a database.
 *
 * This is the part of U4 that writes to `workout_sets`, which every chart,
 * record and PR flag in the app is computed from, so the decisions live here
 * with their reasons rather than inline in a click handler.
 */

/** A set as History holds it: the row plus its joined exercise. */
export interface EditableSet extends WorkoutSet {
  exercises?: { id: string; name: string } | null
}

/**
 * `set_number` for a set appended to a workout.
 *
 * One sequence per WORKOUT, not per exercise, because that is what the column
 * has always meant: `previous_session` and the History breakdown both order by
 * it across the whole session, and restarting at 1 for a newly added exercise
 * would interleave it with the first exercise's sets.
 *
 * Max plus one rather than count plus one. A workout that has had a set deleted
 * has a gap, and counting would collide with an existing number.
 */
export function nextSetNumber(sets: { set_number: number }[]): number {
  let top = 0
  for (const s of sets) if (s.set_number > top) top = s.set_number
  return top + 1
}

/**
 * What a newly added set should be prefilled with.
 *
 * The last working set of that exercise IN THIS WORKOUT, because somebody
 * adding a set to a past session is almost always recording one they forgot at
 * the weight they were using that day. Falling back to the last set of any
 * exercise would prefill a bench weight onto a curl.
 *
 * Warm-ups are skipped as the source: prefilling a working set from a warm-up
 * would seed a number nobody lifted for that many reps. If a warm-up is all
 * there is, its values are still better than nothing, so it is the fallback.
 */
export function prefillFor(
  sets: EditableSet[],
  exerciseId: string,
): { weightKg: number | null; reps: number | null } {
  const mine = sets.filter((s) => s.exercise_id === exerciseId)
  const working = mine.filter((s) => s.set_type !== 'warmup')
  const source = (working.length > 0 ? working : mine).at(-1)
  return { weightKg: source?.weight_kg ?? null, reps: source?.reps ?? null }
}

export interface RoutineFromWorkout {
  name: string
  exercises: { exerciseId: string; sets: { reps: number | null; setType: SetType }[] }[]
}

/**
 * Turn a finished workout into a routine draft.
 *
 * Reps and set types carry over; **weight deliberately does not**, because
 * `RoutineDraft` has no weight field and that was a decision, not an omission:
 * a routine hard-coding 60 kg is wrong the week after you progress and then
 * lies to you mid-workout. Weight comes from `previous_session` at log time.
 *
 * Exercise order follows first appearance in the session, which is the order it
 * was actually performed in. Warm-ups are dropped: a routine prescribes the
 * work, and the warm-up ramp is generated from the working weight anyway.
 *
 * Returns null when nothing survives that filter, so the caller can say so
 * rather than saving an empty routine.
 */
export function routineFromWorkout(
  sets: EditableSet[],
  workoutName: string | null,
  fallbackName: string,
): RoutineFromWorkout | null {
  const order: string[] = []
  const byExercise = new Map<string, { reps: number | null; setType: SetType }[]>()

  for (const set of sets) {
    if (set.set_type === 'warmup') continue
    if (!byExercise.has(set.exercise_id)) {
      byExercise.set(set.exercise_id, [])
      order.push(set.exercise_id)
    }
    byExercise.get(set.exercise_id)?.push({ reps: set.reps, setType: set.set_type })
  }

  if (order.length === 0) return null

  const trimmed = (workoutName ?? '').trim()
  return {
    name: trimmed === '' ? fallbackName : trimmed,
    exercises: order.map((exerciseId) => ({
      exerciseId,
      sets: byExercise.get(exerciseId) ?? [],
    })),
  }
}
