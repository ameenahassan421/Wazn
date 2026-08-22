import * as Crypto from 'expo-crypto'

import { rotationOrder, type RoutineWithRun } from '@wazn/domain'

import { draftChildRows, type RoutineDraft } from '@/state/routine-draft'
import { supabase } from '@/services/supabase'

/**
 * Everything the Plan tab reads, and everything the editor writes.
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
  /** The `routine_exercises` row. Not the lift. */
  id: string
  /** The lift. Carried because the editor rewrites these rows from the draft
   *  and has to know WHAT each one pointed at, not just what it was called. */
  exercise_id: string
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
          exercise_id: e.exercise_id,
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

/**
 * One routine, shaped for the editor.
 *
 * Built on `fetchRoutines` rather than on three targeted queries. That reads
 * every routine to return one, which is the wrong trade on a hot path and the
 * right one here: the account with the most routines in production has 18 of
 * them, this runs once when a screen opens, and the alternative is a second
 * copy of the same three-table fan-out that would drift from the first the
 * moment either changes.
 *
 * Null when the id is not the caller's, which RLS makes the same answer as
 * "does not exist". The editor treats both as a routine that is gone.
 */
export async function loadDraft(routineId: string): Promise<RoutineDraft | null> {
  const found = (await fetchRoutines()).find((r) => r.id === routineId)
  if (found === undefined) return null
  return {
    routineId: found.id,
    name: found.name,
    exercises: found.exercises.map((e) => ({
      exerciseId: e.exercise_id,
      /*
       * A row whose exercise is not in the catalogue keeps its planned sets
       * and shows a placeholder, rather than being dropped. Saving after an
       * edit rewrites every child row from this list, so dropping the unnamed
       * one here would DELETE it as a side effect of opening the screen.
       */
      name: e.name ?? '',
      sets: Math.max(1, e.sets.length),
    })),
  }
}

/**
 * One past the highest position this lifter owns.
 *
 * RLS scopes the read, so no `user_id` filter is needed and adding one would
 * imply the policy might not hold. A failed read falls back to 0: a routine
 * that saves with a duplicate position sorts by creation date instead, and
 * refusing to save somebody's routine over that is a far worse answer.
 */
async function nextPosition(): Promise<number> {
  const { data, error } = await supabase
    .from('routines')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error !== null || data === null) return 0
  return ((data as { position: number }).position ?? 0) + 1
}

/**
 * Create or replace a routine, and return its id.
 *
 * ── CHILDREN ARE REPLACED, NOT DIFFED ───────────────────────────────────────
 * The `routine_exercises` rows are rewritten wholesale on every save. A
 * routine is a handful of rows, `routine_sets` cascades off them, and diffing
 * positions correctly is the kind of code that silently reorders somebody's
 * workout six months later. Same call the web made.
 *
 * `workouts.routine_id` is unaffected: it points at the ROUTINE, not at its
 * exercises, so history keeps its link across an edit.
 *
 * ── INSERT FIRST, DELETE LAST, AND UNDO IN BETWEEN ──────────────────────────
 * The obvious order is delete-then-insert, and it is the one that loses
 * somebody's routine. There is no transaction here: `supabase-js` speaks
 * PostgREST, one request per statement. So a phone that drops signal between
 * the DELETE and the INSERT leaves the routine with ZERO exercises, and an
 * empty routine is not merely wrong, it is silently wrong. `routinePlan`
 * returns null for it, so Start on that routine seeds the board from the last
 * SESSION instead and runs a completely different workout without saying so.
 *
 * Reversed, the same dropped signal costs nothing: the old rows are still
 * there and the new ones are removed on the way out. The `catch` is a
 * best-effort undo rather than a real rollback, and the worst case if IT also
 * fails is a routine listing its lifts twice, which the lifter can see and
 * fix by saving again. That is the trade: a visible mess beats a silent
 * deletion.
 *
 * The real fix is one `save_routine(jsonb)` RPC doing all of it inside a
 * transaction. That is a migration, and a migration is a production change
 * Ameen approves, so it is written down in DECISIONS.md rather than smuggled
 * into a UI branch.
 *
 * ── IDS ARE MINTED HERE ─────────────────────────────────────────────────────
 * Both child tables default to `gen_random_uuid()`, so the client may supply
 * ids, and supplying them is what collapses this from 2N round trips to two.
 * The alternative is inserting each exercise, reading its id back, then its
 * sets. The web does exactly that and a six-lift routine costs it twelve
 * sequential requests.
 *
 * Reading the ids back from a bulk insert would work today and is the thing to
 * avoid: PostgREST returns them in insertion order by observation, not by
 * contract, and a save that silently pairs set counts with the wrong lifts is
 * a defect nobody would look for.
 */
export async function saveRoutine(draft: RoutineDraft): Promise<string> {
  const name = draft.name.trim()
  let id = draft.routineId
  /** The child rows this save replaces. Empty when creating. */
  let stale: string[] = []

  if (id === null) {
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (userId === undefined) throw new Error('Not signed in.')

    const { data, error } = await supabase
      .from('routines')
      .insert({ user_id: userId, name, position: await nextPosition() })
      .select('id')
      .single()
    if (error !== null) throw error
    id = (data as { id: string }).id
  } else {
    const { error } = await supabase
      .from('routines')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error !== null) throw error

    /*
     * Read the ids now, delete them at the end. By id rather than by
     * `routine_id`, because by then the routine also holds the rows this save
     * just inserted and a `.eq('routine_id', id)` delete would take those too.
     */
    const { data: old, error: oldErr } = await supabase
      .from('routine_exercises')
      .select('id')
      .eq('routine_id', id)
    if (oldErr !== null) throw oldErr
    stale = ((old ?? []) as { id: string }[]).map((r) => r.id)
  }

  /*
   * Built in the draft module rather than here, because THIS file imports the
   * Supabase client, which imports `react-native`, which vitest cannot parse.
   * The index pairing between a lift and its set batch is the part of saving
   * most worth a test, and it was unreachable from one while it lived here.
   */
  const { exercises, sets } = draftChildRows(id, draft.exercises, Crypto.randomUUID)

  if (exercises.length > 0) {
    try {
      const { error: exErr } = await supabase
        .from('routine_exercises')
        .insert(exercises)
      if (exErr !== null) throw exErr

      if (sets.length > 0) {
        const { error: setErr } = await supabase.from('routine_sets').insert(sets)
        if (setErr !== null) throw setErr
      }
    } catch (err) {
      /*
       * Undo what this save added, so the routine is left exactly as it was.
       * Deliberately not awaited for its error: this runs while something is
       * already going wrong, and the original failure is the one worth
       * reporting. `routine_sets` cascades off these rows.
       */
      await supabase
        .from('routine_exercises')
        .delete()
        .in(
          'id',
          exercises.map((e) => e.id),
        )
      throw err
    }
  }

  /*
   * Last, and only once the replacements are in. Runs even when the new list
   * is empty: an empty exercise list is a legitimate save from any caller, and
   * skipping the delete for it would leave the OLD lifts in place under a new
   * name, which is the one outcome nobody asked for.
   */
  if (stale.length > 0) {
    const { error: delErr } = await supabase
      .from('routine_exercises')
      .delete()
      .in('id', stale)
    if (delErr !== null) throw delErr
  }

  return id
}

/**
 * Delete a routine.
 *
 * The children cascade. `workouts.routine_id` is `on delete set null`, so past
 * sessions survive and merely stop naming the routine they came from, which is
 * the trade 0004 chose: deleting a plan must never destroy logged history.
 */
export async function deleteRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', routineId)
  if (error !== null) throw error
}
