import { useSyncExternalStore } from 'react'

import {
  type BoardExercise,
  type BoardPosition,
  bankSet,
  bankedVolumeKg,
  currentPosition,
  estimatedOneRepMax,
  momentumPct,
  seedBoard,
} from '@wazn/domain'

import { supabase } from '@/services/supabase'

/**
 * The live workout, held outside React.
 *
 * ── WHY A MODULE STORE AND NOT A PROVIDER ───────────────────────────────────
 * The session is a `fullScreenModal` route. A provider would have to live in
 * the root layout to outlive it, which means every tab re-renders whenever a
 * set lands, and the tab bar has no business knowing about reps. A module
 * store lets exactly the components that ask subscribe, and it survives the
 * route unmounting, which matters because "the screen went away" and "the
 * workout ended" are different events and only one of them is the lifter's
 * decision.
 *
 * ── WHAT IS TRUTH ───────────────────────────────────────────────────────────
 * The board in memory. A set is banked, the haptic fires and the figure moves
 * BEFORE the network is asked anything, because the job is 30 seconds one
 * handed and a gym has no signal. The insert follows and its failure is
 * counted, not thrown.
 *
 * ── WHAT THIS IS NOT, YET ───────────────────────────────────────────────────
 * It is NOT the offline queue. A failed insert is remembered as a number on
 * `unsynced` and nothing retries it. The web app has `write-queue` and a
 * checkpoint for exactly this and GATE 4 is the gate that measures it; wiring
 * them to SQLite is its own PR and its own test. Until then this store must
 * not be described as offline-capable, and the screen says so rather than
 * showing a lifter a green tick it has not earned.
 */

export type LiveStatus = 'idle' | 'active' | 'finished'

export interface LiveState {
  status: LiveStatus
  /** Null until the workout row lands. Sets wait for it. */
  workoutId: string | null
  startedAt: number
  name: string
  board: BoardExercise[]
  /** Last finished session's working volume, in kg. Null on day one. */
  targetKg: number | null
  /** Sets banked on the board that no insert has confirmed. */
  unsynced: number
  /**
   * Rest, as two numbers rather than a ticking one.
   *
   * `restEndsAt` is a wall-clock instant and `restTotal` the length it was
   * started with, so the remaining time is derived at render. A stored
   * countdown would drift the moment the app is backgrounded, which on a phone
   * is most of a rest period: the lifter puts it in their pocket. This way the
   * clock is the system's and coming back is just another render.
   */
  restEndsAt: number | null
  restTotal: number
}

const EMPTY: LiveState = {
  status: 'idle',
  workoutId: null,
  startedAt: 0,
  name: '',
  board: [],
  targetKg: null,
  unsynced: 0,
  restEndsAt: null,
  restTotal: 0,
}

/**
 * One rest length for every lift, until per-exercise rest is wired.
 *
 * The web app resolves this from the exercise and the user's preference via
 * `resolveRest`. Neither is read on native yet, and inventing a per-lift
 * number here would be a guess dressed as a setting. 120s is the app's own
 * default and it is honest about being one.
 */
const DEFAULT_REST_SECONDS = 120

let state: LiveState = EMPTY
const listeners = new Set<() => void>()

function set(next: Partial<LiveState>) {
  state = { ...state, ...next }
  for (const notify of listeners) notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot() {
  return state
}

export function useLiveWorkout(): LiveState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Start a session seeded from the lifter's last one.
 *
 * Seeding from the previous session rather than from a routine is the same
 * deliberate simplification `useHome` documents: routine metadata arrives in
 * P2. It is also the honest default, because it is the only plan the app can
 * derive from data it actually has.
 */
export async function startWorkout(): Promise<void> {
  if (state.status === 'active') return

  const startedAt = Date.now()
  set({ ...EMPTY, status: 'active', startedAt })

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (userId === undefined) return

  const { data: recent } = await supabase
    .from('workouts')
    .select(
      'id, name, workout_sets(exercise_id, set_number, weight_kg, reps, set_type)',
    )
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)

  const last = recent?.[0]
  const previousRows = (last?.workout_sets ?? []) as {
    exercise_id: string
    set_number: number
    weight_kg: number | null
    reps: number | null
    set_type: string
  }[]

  // Names come from the catalogue in one read rather than a join per row.
  const ids = [...new Set(previousRows.map((r) => r.exercise_id))]
  const { data: catalogue } = ids.length
    ? await supabase.from('exercises').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] }
  const nameOf = new Map((catalogue ?? []).map((e) => [e.id, e.name]))

  const previous = previousRows.map((r) => ({
    exerciseId: r.exercise_id,
    setNumber: r.set_number,
    weightKg: r.weight_kg,
    reps: r.reps,
    type: r.set_type as BoardExercise['sets'][number]['type'],
  }))

  const plan = ids.map((id) => ({
    exerciseId: id,
    name: nameOf.get(id) ?? 'Exercise',
    sets: previousRows.filter((r) => r.exercise_id === id).length,
  }))

  const targetKg = previousRows.reduce((total, r) => {
    if (estimatedOneRepMax(r.weight_kg, r.reps, r.set_type) === null) return total
    return total + (r.weight_kg ?? 0) * (r.reps ?? 0)
  }, 0)

  const { data: created } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      name: (last?.name as string | null) ?? null,
      started_at: new Date(startedAt).toISOString(),
    })
    .select('id')
    .single()

  set({
    workoutId: (created?.id as string | undefined) ?? null,
    name: (last?.name as string | null) ?? '',
    board: seedBoard(plan, previous),
    targetKg: targetKg > 0 ? targetKg : null,
  })
}

/**
 * Bank the current set.
 *
 * The board moves first and returns immediately; the caller fires its haptic
 * off this function returning, not off the insert. Nothing on the logging path
 * waits for a network.
 */
export function bankCurrentSet(weightKg: number | null, reps: number | null): void {
  const position = currentPosition(state.board)
  if (position === null) return

  const exercise = state.board[position.exerciseIndex]
  const setRow = exercise.sets[position.setIndex]
  const board = bankSet(state.board, position, weightKg, reps)
  if (board === state.board) return

  /**
   * A warm-up starts nothing. Nobody rests two minutes after an empty bar,
   * and `commitOutcome` encodes the same rule for the web app.
   */
  const rests = setRow.type !== 'warmup' && DEFAULT_REST_SECONDS > 0

  set({
    board,
    restEndsAt: rests ? Date.now() + DEFAULT_REST_SECONDS * 1000 : null,
    restTotal: rests ? DEFAULT_REST_SECONDS : 0,
  })
  void persistSet(position, exercise.exerciseId, setRow.setNumber, weightKg, reps)
}

/** Dismissed by a tap, or by the lifter deciding they are ready. */
export function endRest(): void {
  set({ restEndsAt: null, restTotal: 0 })
}

/** Add or remove time without leaving the canvas. */
export function adjustRest(deltaSeconds: number): void {
  if (state.restEndsAt === null) return
  const next = Math.max(Date.now() + 1000, state.restEndsAt + deltaSeconds * 1000)
  set({ restEndsAt: next })
}

async function persistSet(
  _position: BoardPosition,
  exerciseId: string,
  setNumber: number,
  weightKg: number | null,
  reps: number | null,
): Promise<void> {
  const workoutId = state.workoutId
  if (workoutId === null) {
    set({ unsynced: state.unsynced + 1 })
    return
  }
  const { error } = await supabase.from('workout_sets').insert({
    workout_id: workoutId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight_kg: weightKg,
    reps,
    set_type: 'normal',
  })
  if (error !== null) set({ unsynced: state.unsynced + 1 })
}

export async function finishWorkout(): Promise<void> {
  const workoutId = state.workoutId
  set({ status: 'finished' })
  if (workoutId === null) return
  await supabase
    .from('workouts')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', workoutId)
}

export function resetWorkout(): void {
  set(EMPTY)
}

/** Everything the board draws, derived in one place so the screen has no maths. */
export function selectBoardView(s: LiveState) {
  const position = currentPosition(s.board)
  const banked = bankedVolumeKg(s.board)
  const pct = momentumPct(banked, s.targetKg)
  return {
    position,
    banked,
    pct,
    recordPace: pct !== null && pct >= 100,
    exercise: position === null ? null : s.board[position.exerciseIndex],
    set:
      position === null
        ? null
        : s.board[position.exerciseIndex].sets[position.setIndex],
  }
}
