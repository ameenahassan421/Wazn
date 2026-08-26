import * as Crypto from 'expo-crypto'
import { File } from 'expo-file-system'

/* `hevy` is a NAMESPACE, not a flat re-export: `portable.ts` namespaces it
   because `hevy-import` has its own `PlannedSet` that would collide with the
   routine one. `deriveEquipment`, `deriveMuscleGroup` and `describeError` are
   flat. */
import { deriveEquipment, deriveMuscleGroup, describeError, hevy } from '@wazn/domain'

import { supabase } from '@/services/supabase'

/**
 * Bringing a Hevy export across, on native.
 *
 * ── WHY THIS IS A SERVICE AND NOT A PORT OF THE WEB COMPONENT ───────────────
 * `src/components/HevyImport.tsx` is 597 lines and holds the whole write path
 * inline — the exercise creation, the workout loop, the rollback. That file is
 * in the tree that does not survive 4A. What survives is `src/lib`, and the
 * parts of this flow that belong there were already there: `analyse` turns the
 * CSV into a plan, `afterCutoff` trims it, `deriveMuscleGroup` /
 * `deriveEquipment` guess a custom lift's shape, and `setRowsFor` — added with
 * this work — maps a planned workout onto `workout_sets` rows.
 *
 * What is left is I/O, and I/O is adapted per platform. That is the same split
 * `routines.ts` states one file over, and it is why there is no shared
 * "importer" abstraction here: an interface with two implementations, one of
 * which is scheduled for deletion, is an interface with one implementation.
 *
 * ── THE RULE THE WHOLE FLOW IS BUILT AROUND ─────────────────────────────────
 * Show what will happen before it happens, and never half-write. The input is
 * somebody's training history. Nothing is written until a preview has been
 * read and a button pressed; the boundary is always a WHOLE workout, so a
 * failure can be reported as "142 of 156 came across" and resumed from there;
 * and a workout whose sets fail is deleted before the failure is reported, so
 * resuming can never double-write one.
 */

/** What the picker handed back, or null when the lifter backed out. */
export interface PickedCsv {
  name: string
  text: string
}

/**
 * The system file picker, then the file's text.
 *
 * ── NO MIME FILTER, AND THAT IS DELIBERATE ──────────────────────────────────
 * The obvious version passes `mimeTypes: ['text/csv']`. The two failure modes
 * are not symmetric. A filter that is too narrow GREYS OUT the very file the
 * lifter came to choose — and a `.csv` arriving as a mail attachment or a
 * Downloads item is reported as `text/comma-separated-values`,
 * `application/csv` or `application/octet-stream` depending on where it has
 * been, so a narrow filter fails exactly on the paths people actually use.
 * That dead end has no recovery inside the app.
 *
 * Picking the wrong file, by contrast, is already handled: `analyse` returns a
 * `fatal` the moment the columns are not Hevy's, and nothing is written before
 * the preview. So the picker shows everything and the parser is the judge.
 *
 * `expo-document-picker` is NOT used, and does not need to be installed:
 * `expo-file-system` has shipped `File.pickFileAsync` since SDK 54 and is
 * already in the graph as a dependency of `expo` itself. It is declared
 * directly in `package.json` all the same, because a package this file imports
 * should not float on whether `expo` keeps bundling it.
 */
export async function pickHevyCsv(): Promise<PickedCsv | null> {
  const picked = await File.pickFileAsync()
  if (picked.canceled) return null
  // On iOS the picker hands back a temporary COPY, so reading it here cannot
  // touch whatever the lifter chose.
  return { name: picked.result.name, text: await picked.result.text() }
}

/**
 * Turn the file into a plan, against what this account already has.
 *
 * Two reads before the parse, and the second one is what lets `analyse` tell a
 * first import from a second.
 *
 * ── BOTH READS THROW RATHER THAN DEGRADE, AND THAT IS THE WHOLE POINT ───────
 * These used to be `data ?? []`, which turns either failure into a confident
 * wrong plan. A failed `exercises` read makes every seeded lift look
 * UNMATCHED, so the importer creates 131 custom duplicates of the global
 * catalogue in the lifter's own picker, permanently. A failed `workouts` read
 * empties `overlapping` and `latestLogged`, which silently disarms the
 * re-import guard this function exists to arm.
 *
 * `workouts_user_started_at_key` (0001, and its comment calls itself the
 * "Import idempotency key") would catch the resulting duplicates as a 23505 —
 * an earlier version of this comment claimed no such constraint existed. It is
 * a backstop, not a plan: the lifter deserves the count on the preview, not an
 * opaque stop halfway through the write.
 */
export async function planFor(text: string): Promise<hevy.ImportPlan> {
  const [catalogue, logged] = await Promise.all([
    supabase.from('exercises').select('name'),
    supabase.from('workouts').select('started_at'),
  ])
  if (catalogue.error !== null) throw new Error(catalogue.error.message)
  if (logged.error !== null) throw new Error(logged.error.message)

  return hevy.analyse(
    text,
    ((catalogue.data ?? []) as { name: string }[]).map((e) => e.name),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    ((logged.data ?? []) as { started_at: string }[]).map((w) => w.started_at),
  )
}

/**
 * Every exercise name this account can write against, lowercased.
 *
 * Called once per run rather than per workout: a name that fails to resolve
 * would otherwise fail again on every session that mentions it.
 */
async function exerciseIdsByName(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('exercises').select('id, name')
  /*
   * THROWS. This was `data ?? []`, and an empty map is the worst possible
   * failure this file can have: `setRowsFor` drops every set whose exercise it
   * cannot resolve, so each workout would be inserted, found to have no rows,
   * deleted again, and counted as a success. The screen reports
   * "156 of 156 · Your history is in" with nothing whatsoever written.
   */
  if (error !== null) throw new Error(error.message)
  return new Map(
    ((data ?? []) as { id: string; name: string }[]).map((row) => [
      row.name.trim().toLowerCase(),
      row.id,
    ]),
  )
}

/** Progress, and the two ways a run can stop early. */
export interface ImportOutcome {
  /** Workouts written, counted from the start of the plan, not of this run. */
  done: number
  /** Set when the run stopped on a failure. Null when it finished or paused. */
  error: string | null
}

/**
 * Write the plan, one workout at a time, starting at `from`.
 *
 * `from` is what makes this resumable: the caller passes the count the last
 * run reached and nothing already written is touched again. `shouldStop` is
 * read BETWEEN workouts and never mid-write, which is the boundary the whole
 * flow rests on.
 *
 * `messages` carries the three error prefixes rather than a `t`: a service
 * with a translator inside it is a service that cannot be called from
 * anywhere else, and these are the only three strings it needs.
 */
export async function runImport(
  plan: hevy.ImportPlan,
  userId: string,
  {
    from,
    onProgress,
    shouldStop,
    messages,
  }: {
    from: number
    onProgress: (done: number) => void
    shouldStop: () => boolean
    messages: { createExercises: string; createWorkout: string; saveSets: string }
  },
): Promise<ImportOutcome> {
  /*
   * The lifts Wazn has never heard of become this lifter's own exercises,
   * created before any workout is written.
   *
   * ── IDEMPOTENT BY CONSTRUCTION, NOT BY `from === 0` ─────────────────────
   * This was guarded on `from === 0`, meaning "a fresh run creates them and a
   * resume reads them back". That guard cannot tell a fresh run from a resume
   * that got zero workouts in — which is exactly what a failure on the FIRST
   * workout, or a Stop pressed immediately, leaves behind. Retrying then
   * re-inserted every custom lift and hit `exercises_custom_owner_name_key`
   * (0014), so the resume failed, and failed identically on every attempt
   * after that: the one path a lifter reaches by pressing "carry on" was the
   * one path that could not work.
   *
   * Reading first and inserting only what is missing has no such state. It
   * costs one extra round trip on a fresh run and it cannot wedge.
   */
  let ids: Map<string, string>
  try {
    ids = await exerciseIdsByName()
  } catch (e) {
    return { done: from, error: describeError(messages.createExercises, e) }
  }

  const missing = plan.unmatched.filter(
    (name: string) => !ids.has(name.trim().toLowerCase()),
  )
  if (missing.length > 0) {
    const { error } = await supabase.from('exercises').insert(
      missing.map((name: string) => {
        const group = deriveMuscleGroup(name)
        return {
          name,
          muscle_group: group,
          equipment: deriveEquipment(name, group),
          is_custom: true,
          owner_id: userId,
        }
      }),
    )
    if (error !== null) {
      return { done: from, error: describeError(messages.createExercises, error) }
    }
    try {
      ids = await exerciseIdsByName()
    } catch (e) {
      return { done: from, error: describeError(messages.createExercises, e) }
    }
  }

  onProgress(from)

  for (let i = from; i < plan.workouts.length; i += 1) {
    if (shouldStop()) return { done: i, error: null }

    const result = await writeWorkout(plan.workouts[i], userId, ids, messages)
    if (result !== null) return { done: i, error: result }

    onProgress(i + 1)
  }

  return { done: plan.workouts.length, error: null }
}

/**
 * One workout and its sets. Null when it landed or was already there, a
 * sentence on failure.
 *
 * The id is generated here rather than read back from the insert, which is the
 * pattern `live-workout.ts` already uses: it saves a round trip, and it means
 * the rollback below knows what to delete even if the response never arrives.
 *
 * The workout is DELETED if its sets fail, so the import boundary is always
 * between whole sessions. That is what makes resuming safe: a half-written
 * session can never be counted as done and then skipped.
 */
async function writeWorkout(
  planned: hevy.PlannedWorkout,
  userId: string,
  ids: Map<string, string>,
  messages: { createWorkout: string; saveSets: string },
): Promise<string | null> {
  const workoutId = Crypto.randomUUID()

  const { error: workoutError } = await supabase.from('workouts').insert({
    id: workoutId,
    user_id: userId,
    name: planned.name,
    started_at: planned.startedAt,
    ended_at: planned.endedAt,
  })
  if (workoutError !== null) {
    /*
     * 23505 is `workouts_user_started_at_key`, and 0001 names it the "Import
     * idempotency key" in its own comment. One workout per (user, start time)
     * means this exact session is already in the log, so the right answer is
     * to move on rather than to stop the run with a Postgres code in it. The
     * preview normally prevents this — it counts the overlap and defaults to
     * skipping it — and a lifter who turns that off deliberately should get
     * the remaining sessions, not a wall.
     */
    if (workoutError.code === '23505') return null
    return describeError(messages.createWorkout, workoutError)
  }

  const rows = hevy.setRowsFor(planned, workoutId, ids)
  if (rows.length === 0) {
    await supabase.from('workouts').delete().eq('id', workoutId)
    /*
     * An EMPTY session is fine and a session whose sets all failed to resolve
     * is not, and the two used to be one branch that returned success.
     *
     * `setRowsFor` drops a set whose exercise is not in the map. Every
     * unmatched name is created before this loop runs, so a full drop means
     * resolution broke — and reporting it as "written" deleted the session,
     * counted it into `done`, and moved on. That is a lifter's workout
     * disappearing inside a progress bar that says everything came across.
     */
    if (planned.sets.length > 0) {
      return describeError(messages.saveSets, {
        message: 'none of its exercises could be matched',
      })
    }
    // A workout with no sets is not a workout — the same rule the board
    // enforces when one is abandoned.
    return null
  }

  const { error: setsError } = await supabase.from('workout_sets').insert(rows)
  if (setsError !== null) {
    await supabase.from('workouts').delete().eq('id', workoutId)
    return describeError(messages.saveSets, setsError)
  }

  return null
}
