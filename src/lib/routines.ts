import { supabase } from './supabase'
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

export async function listRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .order('position')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Routine[]
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
      .insert({ user_id: userId, name: draft.name })
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
