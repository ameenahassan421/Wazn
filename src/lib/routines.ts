import { supabase } from './supabase'
import { rotationOrder } from './rotation'
import type { RoutineWithRun } from './rotation'
import type { Routine, RoutineExercise, RoutineSet, SetType } from './types'

/**
 * Routine reads and writes.
 *
 * Kept out of the components because a routine is three tables, and doing the
 * fan-out inline would put four awaits in the middle of a render path that has
 * to stay quick — the Log screen is the hot path.
 */

export interface RoutineDetail extends Routine {
  exercises: (RoutineExercise & { sets: RoutineSet[] })[]
}

/**
 * Every routine, each carrying when it was last actually run.
 *
 * The `workouts(started_at)` embed rides the existing `workouts.routine_id`
 * foreign key, so rotation order costs no extra round trip and no migration.
 * The reduce to a single max happens here because PostgREST cannot aggregate an
 * embedded resource, and the alternative was a new SQL function for a fact two
 * dozen rows can answer.
 *
 * Order is applied by `rotationOrder`, not by the query: `position` alone put
 * the list out of step with the briefing card's "X is up" (L9).
 */
export async function listRoutines(): Promise<RoutineWithRun[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, workouts(started_at, ended_at), routine_exercises(count)')
    .order('position')
    .order('created_at')
  if (error) throw error

  const rows = (data ?? []) as (Routine & {
    workouts?: { started_at: string; ended_at: string | null }[] | null
    routine_exercises?: { count: number }[] | null
  })[]

  return rotationOrder(
    rows.map(({ workouts, routine_exercises, ...routine }) => {
      let last: string | null = null
      for (const w of workouts ?? []) {
        // Finished only, matching `session_brief()`'s `ended_at is not null`.
        // Counting an abandoned session as a run would rotate the routine away
        // from somebody who never actually did it.
        if (w.ended_at === null) continue
        if (last === null || w.started_at > last) last = w.started_at
      }
      return {
        ...routine,
        last_run_at: last,
        // PostgREST returns an aggregate embed as a one-row array. Absent
        // rather than zero when the shape surprises us: "0 exercises" is a
        // claim, and a missing count should say nothing instead.
        exercise_count: routine_exercises?.[0]?.count ?? null,
      }
    }),
  )
}

/**
 * One routine with its exercises and planned sets. Two queries rather than a
 * nested select, because PostgREST's embedding cannot order a grandchild.
 */
export async function loadRoutine(routineId: string): Promise<RoutineDetail | null> {
  const [routineRes, exRes] = await Promise.all([
    supabase.from('routines').select('*').eq('id', routineId).maybeSingle(),
    supabase
      .from('routine_exercises')
      .select('*')
      .eq('routine_id', routineId)
      .order('position'),
  ])
  if (routineRes.error) throw routineRes.error
  if (exRes.error) throw exRes.error
  if (!routineRes.data) return null

  const exercises = (exRes.data ?? []) as RoutineExercise[]
  if (exercises.length === 0) {
    return { ...(routineRes.data as Routine), exercises: [] }
  }

  const { data: setRows, error: setErr } = await supabase
    .from('routine_sets')
    .select('*')
    .in(
      'routine_exercise_id',
      exercises.map((e) => e.id),
    )
    .order('set_number')
  if (setErr) throw setErr

  const byExercise = new Map<string, RoutineSet[]>()
  for (const s of (setRows ?? []) as RoutineSet[]) {
    if (!byExercise.has(s.routine_exercise_id))
      byExercise.set(s.routine_exercise_id, [])
    byExercise.get(s.routine_exercise_id)!.push(s)
  }

  return {
    ...(routineRes.data as Routine),
    exercises: exercises.map((e) => ({ ...e, sets: byExercise.get(e.id) ?? [] })),
  }
}

export interface RoutineDraft {
  name: string
  exercises: { exerciseId: string; sets: { reps: number | null; setType: SetType }[] }[]
}

/**
 * One past the highest position the caller owns.
 *
 * RLS scopes the read to the user, so no `user_id` filter is needed here and
 * adding one would imply the policy might not hold. A failed read falls back to
 * 0 rather than throwing: a routine that saves with a duplicate position sorts
 * by creation date instead, and refusing to save the routine would be a far
 * worse answer to a transient error.
 */
async function nextPosition(): Promise<number> {
  const { data, error } = await supabase
    .from('routines')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return 0
  return ((data as { position: number }).position ?? 0) + 1
}

/**
 * Create or replace a routine's contents.
 *
 * On save the children are deleted and reinserted rather than diffed. A
 * routine is a handful of rows, the cascade makes it one statement, and
 * diffing positions correctly is the kind of code that silently reorders
 * someone's workout six months later.
 */
export async function saveRoutine(
  userId: string,
  draft: RoutineDraft,
  routineId?: string,
): Promise<string> {
  let id = routineId

  if (id) {
    const { error } = await supabase
      .from('routines')
      .update({ name: draft.name, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    const { error: delErr } = await supabase
      .from('routine_exercises')
      .delete()
      .eq('routine_id', id)
    if (delErr) throw delErr
  } else {
    const { data, error } = await supabase
      .from('routines')
      // O15: `position` is sorted on by `listRoutines` and was never written,
      // so every routine sat at the column default and the "user's own order"
      // the sort falls back to did not exist. New routines go on the end.
      .insert({ user_id: userId, name: draft.name, position: await nextPosition() })
      .select('id')
      .single()
    if (error) throw error
    id = (data as { id: string }).id
  }

  for (const [position, ex] of draft.exercises.entries()) {
    const { data: exRow, error: exErr } = await supabase
      .from('routine_exercises')
      .insert({ routine_id: id, exercise_id: ex.exerciseId, position })
      .select('id')
      .single()
    if (exErr) throw exErr

    if (ex.sets.length > 0) {
      const { error: setErr } = await supabase.from('routine_sets').insert(
        ex.sets.map((s, i) => ({
          routine_exercise_id: (exRow as { id: string }).id,
          set_number: i + 1,
          reps: s.reps,
          set_type: s.setType,
        })),
      )
      if (setErr) throw setErr
    }
  }

  return id
}

export async function duplicateRoutine(
  userId: string,
  routineId: string,
): Promise<string> {
  const source = await loadRoutine(routineId)
  if (!source) throw new Error('That routine no longer exists.')
  return saveRoutine(userId, {
    name: `${source.name} copy`,
    exercises: source.exercises.map((e) => ({
      exerciseId: e.exercise_id,
      sets: e.sets.map((s) => ({ reps: s.reps, setType: s.set_type })),
    })),
  })
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', routineId)
  if (error) throw error
}
