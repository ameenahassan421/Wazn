import { useSyncExternalStore } from 'react'

/**
 * The routine being written, held outside React.
 *
 * ── WHY A STORE AND NOT SCREEN STATE ────────────────────────────────────────
 * The exercise picker is its own route (`session/add`), pushed as a modal over
 * whatever screen asked for it. That screen stays mounted underneath, so its
 * React state does survive the detour, but there is no way to hand a value
 * BACK down the stack: `router.back()` carries no payload, and threading one
 * through route params turns a chosen lift into a URL string.
 *
 * So the picker writes, exactly as it already does for the live board. That is
 * the same shape `live-workout.ts` uses and the same reason: a module store is
 * what lets two routes agree on one object without a provider that forces
 * every tab to re-render.
 *
 * ── ONLY THREE THINGS ARE EDITABLE, AND THAT IS THE DESIGN ──────────────────
 * A name, an ordered list of lifts, and how many sets each one gets. No
 * weights, no reps, no rest, no notes.
 *
 * Not laziness: `startWorkout(routineId)` deliberately reads STRUCTURE from
 * the routine and VALUES from the lifter's real history, because a planned
 * weight typed months ago and rendered under "last time" would be the app
 * inventing a history. `routinePlan` proves it, it selects only
 * `routine_sets.routine_exercise_id` and counts the rows. Every other column
 * on that table is written and never read back, so offering to edit them
 * would be offering control over nothing.
 */

export interface DraftExercise {
  exerciseId: string
  /** Resolved at pick time. The editor never has to hit the catalogue again. */
  name: string
  sets: number
}

export interface RoutineDraft {
  /** Null while creating. The row's id once it exists. */
  routineId: string | null
  name: string
  exercises: DraftExercise[]
}

/** 3 is the modal set count across this account's 18 imported routines. */
const DEFAULT_SETS = 3

/**
 * 1 and 12. The floor is 1 because 0 planned sets is what `routinePlan`
 * already has to paper over with `Math.max(1, ...)`, and a routine that saves
 * a value the board silently corrects is a lie in the database. The ceiling is
 * a typo guard: 12 sets of one lift is already more than anything in this
 * account's history, and the stepper is the only way to reach it.
 */
export const MIN_SETS = 1
export const MAX_SETS = 12

const EMPTY: RoutineDraft = { routineId: null, name: '', exercises: [] }

let state: RoutineDraft = EMPTY
const listeners = new Set<() => void>()

function set(next: RoutineDraft) {
  state = next
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function snapshot(): RoutineDraft {
  return state
}

export function useRoutineDraft(): RoutineDraft {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Load an existing routine, or start a blank one when `routineId` is null. */
export function beginDraft(draft: RoutineDraft) {
  set(draft)
}

export function renameDraft(name: string) {
  set({ ...state, name })
}

/**
 * Called by the PICKER, not by the editor.
 *
 * A lift already in the draft is added again rather than rejected. Two rows of
 * the same exercise is how a real routine expresses "bench at the start and
 * again at the end", and `routine_exercises` has no unique constraint stopping
 * it, so refusing here would be this screen inventing a rule the schema does
 * not hold.
 */
export function addDraftExercise(exerciseId: string, name: string) {
  set({
    ...state,
    exercises: [...state.exercises, { exerciseId, name, sets: DEFAULT_SETS }],
  })
}

export function removeDraftExercise(index: number) {
  set({ ...state, exercises: state.exercises.filter((_, i) => i !== index) })
}

/** Swap with the neighbour in `delta`'s direction. A no-op at either end. */
export function moveDraftExercise(index: number, delta: 1 | -1) {
  const to = index + delta
  if (to < 0 || to >= state.exercises.length) return
  const next = [...state.exercises]
  ;[next[index], next[to]] = [next[to], next[index]]
  set({ ...state, exercises: next })
}

export function setDraftSets(index: number, sets: number) {
  const clamped = Math.min(MAX_SETS, Math.max(MIN_SETS, sets))
  set({
    ...state,
    exercises: state.exercises.map((e, i) =>
      i === index ? { ...e, sets: clamped } : e,
    ),
  })
}

/** Nothing to save. Both halves matter: an unnamed routine is unfindable in a
 *  list that shows nothing else, and an empty one starts a board with no rows. */
export function draftIsSavable(draft: RoutineDraft): boolean {
  return draft.name.trim().length > 0 && draft.exercises.length > 0
}

/** One `routine_exercises` row, as written. */
export interface DraftExerciseRow {
  id: string
  routine_id: string
  exercise_id: string
  position: number
}

/** One `routine_sets` row, as written. */
export interface DraftSetRow {
  routine_exercise_id: string
  set_number: number
}

/**
 * The child rows a draft becomes.
 *
 * ── WHY THIS IS HERE AND NOT IN `services/routines.ts` ──────────────────────
 * Because it can be tested here. `services/routines.ts` imports the Supabase
 * client, which imports `react-native`, whose entry is Flow and which vitest's
 * parser refuses. Anything in that file is unreachable from a test, and this
 * is the part of saving worth pinning: `sets` pairs each batch with
 * `exercises[i]` BY INDEX, so if the two ever fall out of step every set count
 * lands on the wrong lift and the only symptom is a board that opens with the
 * wrong number of rows, weeks later, with nothing pointing at this function.
 *
 * `mintId` is injected for the same import reason: `expo-crypto` is a native
 * module and this module stays free of them.
 *
 * `weight_kg`, `reps` and `set_type` are deliberately absent. `routinePlan`
 * counts these rows and reads nothing else off them, and a null weight is what
 * makes a started session seed from the lifter's real history rather than from
 * a number typed into a form months ago.
 */
export function draftChildRows(
  routineId: string,
  exercises: DraftExercise[],
  mintId: () => string,
): { exercises: DraftExerciseRow[]; sets: DraftSetRow[] } {
  const rows = exercises.map((e, position) => ({
    id: mintId(),
    routine_id: routineId,
    exercise_id: e.exerciseId,
    position,
  }))
  return {
    exercises: rows,
    sets: rows.flatMap((row, i) =>
      Array.from({ length: exercises[i].sets }, (_, n) => ({
        routine_exercise_id: row.id,
        set_number: n + 1,
      })),
    ),
  }
}
