import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'

import {
  type BoardExercise,
  type CheckIn,
  type Readiness,
  DEFAULT_REST_SECONDS,
  asCheckIn,
  bankSet,
  bankedVolumeKg,
  computeReadiness,
  currentPosition,
  estimatedOneRepMax,
  localDay,
  markSetType,
  restsAfterBank,
  seedBoard,
  sessionVolume,
  toggleSuperset,
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
 * ── IT SURVIVES THE APP BEING KILLED (2026-08-21) ───────────────────────────
 * This block said the opposite, and it was right to: a failed insert was
 * counted on `unsynced` and nothing retried it, a set banked before the
 * workout row landed was DROPPED without being sent at all, and the store was
 * a module variable that died with the process. A workout logged in a basement
 * was lost. GATE 4 measures exactly this.
 *
 * Three things fix it, and all three are cheap because the schema already
 * allowed them:
 *
 *   1. **Every id is generated on the device.** `workouts.id` and
 *      `workout_sets.id` are both `uuid primary key default gen_random_uuid()`,
 *      so a client may supply them — and a replay of the same insert is a
 *      23505 rather than a duplicate row. That is the whole reason retry is
 *      safe. `workouts` also carries a unique `(user_id, started_at)` index, so
 *      even a workout row sent twice collides instead of forking.
 *   2. **Every mutation is checkpointed to AsyncStorage**, inside `set()`, so
 *      no path can change the board without persisting it.
 *   3. **`pending` is a queue, not a counter.** A set that cannot be sent — no
 *      network, or no workout row yet — is held with the id it will be
 *      inserted under, and `flushPending()` retries it in order.
 *
 * What this still is NOT: a background sync. `flushPending()` runs when a set
 * is banked, when a checkpoint is restored, and when a workout finishes — not
 * on a timer and not when the radio returns on its own. A lifter who finishes
 * offline and never reopens the app has sets on the phone and not on the
 * server. That is a smaller gap than the one it replaces, it closes by giving
 * `flushPending` a connectivity trigger, and the screen still says plainly how
 * many rows are waiting.
 *
 * It DOES hold a warm-up now (2026-08-21). The paragraph here used to say the
 * opposite and was right to: the type reached the row but nothing ever set it
 * to anything but `'normal'`, so every warm-up logged in Wazn counted as
 * working volume in the thirteen SQL functions that filter on
 * `set_type <> 'warmup'` and could set a personal record off an empty bar.
 * Two things changed: `seedBoard` carries the previous row's own type, so a
 * repeated session repeats its warm-ups correctly at zero taps, and
 * `setCurrentSetType` below gives the board a control for the first time a
 * lift is done and for the times history is wrong.
 */

export type LiveStatus = 'idle' | 'active' | 'finished'

/** One row of `workout_sets`, held on the device until the server has it. */
export interface PendingSet {
  /** Client-generated, and the server's primary key. This is what makes the
   *  retry safe: a second attempt collides instead of duplicating. */
  id: string
  exerciseId: string
  setNumber: number
  setType: BoardExercise['sets'][number]['type']
  weightKg: number | null
  reps: number | null
  /** 6 to 10, or null for "not said", which is what every row in production
   *  currently is: the column has existed since 0001 and no client wrote it. */
  rpe: number | null
  /** The pairing this set was logged inside, or null. */
  supersetGroup: number | null
}

/** Where the checkpoint lives. One key: the state is one document, and a
 *  half-restored workout is worse than none. Exported so the test asserts the
 *  same key the app writes rather than a copy of it. */
export const CHECKPOINT_KEY = 'wazn.live-workout'

export interface LiveState {
  status: LiveStatus
  /** Null until the workout row lands. Sets wait for it. */
  workoutId: string | null
  startedAt: number
  name: string
  board: BoardExercise[]
  /** Last finished session's working volume, in kg. Null on day one. */
  targetKg: number | null
  /**
   * How ready the lifter is, frozen at the moment the session started.
   *
   * ── WHY IT LIVES HERE AND NOT ON HOME ───────────────────────────────────
   * Home collects the check-in; the ghosts are the only thing that acts on
   * it. Until 2026-08-21 nothing closed that loop: `useHome()` computed a
   * `readiness` no screen read, and this board seeded `verdictFor` from
   * `computeReadiness({ checkIn: null, daysRested: null })` — a hardcoded
   * Normal. So three chips on the highest-traffic screen wrote a row to
   * Postgres and changed nothing a lifter could see.
   *
   * It is seeded in `startWorkout` because that function already asks the
   * database for the last finished session; it needed one more column
   * (`started_at`) and one more small read (today's check-in).
   *
   * ── FROZEN, AND THAT IS THE POINT ───────────────────────────────────────
   * Readiness is a property of the day you walked in. Re-reading it mid-set
   * would let the ghosts move under a lifter halfway through a session, which
   * is exactly the thing the coach must never do.
   */
  readiness: Readiness
  /** Who the workout belongs to. Held so a retry can rebuild the workout row
   *  without asking the network who is signed in. */
  userId: string | null
  /**
   * The routine this session came from, or null when it was started from Home.
   *
   * Held in state rather than passed to the insert, for the same reason
   * `userId` is: `ensureWorkoutRow` is a RETRY, and a retry that has to be
   * handed its arguments again is a retry that can lose them.
   *
   * This column is why the whole feature exists. Measured on 2026-08-21:
   * `workouts.routine_id` was null on all 166 finished workouts in production,
   * because nothing in either app had ever written it. `session_brief()`'s
   * `due` CTE joins finished workouts on it, so every routine tied at null and
   * the order collapsed to `position` — "Upper Push is due" was a constant,
   * printed as a Home headline, naming a routine the account had never run.
   */
  routineId: string | null
  /**
   * Sets banked on the board that no insert has confirmed, each carrying the
   * id it will be inserted under.
   *
   * A LIST, not a count. A count can only be shown to the lifter; a list can
   * actually be sent.
   */
  pending: PendingSet[]
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
  /**
   * True once `ended_at` has actually landed on the workout row.
   *
   * `finishWorkout` flips `status` to `finished` on the FIRST line so the
   * summary paints instantly, then drains the queue, then writes `ended_at`.
   * That is the right order for the lifter and the wrong order for anything
   * that queries the session: `session_debrief()` joins only workouts with an
   * `ended_at`, so a debrief fetched the moment the summary appears reads a
   * workout that does not exist yet and answers `found: false` — silently, and
   * permanently, because nothing re-asks.
   *
   * So the seal is its own fact rather than something inferred from `status`
   * or from `pending.length`. An empty queue means the sets landed; it says
   * nothing about the row that owns them.
   */
  sealed: boolean
}

const EMPTY: LiveState = {
  status: 'idle',
  workoutId: null,
  startedAt: 0,
  name: '',
  board: [],
  targetKg: null,
  readiness: 'normal',
  userId: null,
  routineId: null,
  pending: [],
  sealed: false,
  restEndsAt: null,
  restTotal: 0,
}

let state: LiveState = EMPTY
const listeners = new Set<() => void>()

/**
 * The drain in flight, or null.
 *
 * A PROMISE rather than a boolean, so a second caller can await the work that
 * is already happening instead of being told "busy" and returning immediately.
 * The boolean version passed its own test suite and was wrong: `finishWorkout`
 * awaited a flush that no-opped against the one `bankCurrentSet` had just
 * started, and marked the workout ended with its sets still on the phone.
 *
 * Module-scoped rather than part of `LiveState` because it is not something the
 * screen may render: "syncing" is a spinner, and a spinner on the logging path
 * is what this store exists to avoid. `pending.length` is the honest thing to
 * show.
 */
let draining: Promise<void> | null = null

function set(next: Partial<LiveState>) {
  state = { ...state, ...next }
  for (const notify of listeners) notify()
  checkpoint()
}

/**
 * Persist the whole state, fire and forget.
 *
 * Inside `set()` rather than at each call site, because "no path can mutate
 * without persisting" is the only version of this that survives someone adding
 * a fourth mutation. Not awaited: the board is painted by the time this runs,
 * and a checkpoint that blocked the logging path would defeat the point.
 *
 * Rest costs nothing here — `restEndsAt` is a wall-clock instant rather than a
 * ticking number, so this fires when a rest STARTS, not once a second.
 */
function checkpoint(): void {
  if (state.status === 'idle') {
    void AsyncStorage.removeItem(CHECKPOINT_KEY).catch(() => {})
    return
  }
  void AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify(state)).catch(() => {})
}

/**
 * Bring back a workout the OS killed, and try to send what it was holding.
 *
 * A corrupt checkpoint is dropped rather than thrown: a lost workout is bad, an
 * app that cannot launch is worse, and the lifter cannot tell the difference
 * between the two failures anyway.
 */
export async function restoreWorkout(): Promise<void> {
  if (state.status !== 'idle') return
  try {
    const raw = await AsyncStorage.getItem(CHECKPOINT_KEY)
    if (raw === null) return
    const saved = JSON.parse(raw) as LiveState
    if (saved.status === 'idle') return
    set(saved)
  } catch {
    void AsyncStorage.removeItem(CHECKPOINT_KEY).catch(() => {})
    return
  }
  await flushPending()
}

/**
 * Exported for `rest-alarm.ts`, which WATCHES `restEndsAt` rather than being
 * called when it changes.
 *
 * The alarm was wired the other way first — three `syncRestAlarm` calls, one
 * beside each `set({ restEndsAt })` — and CI rejected it in 52 seconds. This
 * module is state and it is tested headlessly by vitest, so importing a
 * service that reaches `react-native` and `expo-notifications` put Flow syntax
 * from `react-native/index.js` into a node test run. The green local wall
 * missed it because `bundle:ios` bundles for a phone, where those imports are
 * exactly right.
 *
 * Inverting it is what the architecture already wanted: the store stays
 * portable and headless, I/O lives at the edges, and there is now no way for a
 * fourth writer of `restEndsAt` to forget to sync — a subscriber cannot be
 * forgotten by code that does not know it exists.
 */
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function snapshot() {
  return state
}

export function useLiveWorkout(): LiveState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * The board a routine asks for: its exercises, in order, with their set counts.
 *
 * ── STRUCTURE FROM THE ROUTINE, VALUES FROM HISTORY ─────────────────────────
 * `seedBoard` takes `previous` and uses it for BOTH the dialled numbers and the
 * "last time" ghost line, which means whatever is passed there is being
 * asserted as something the lifter actually did. So the routine's own planned
 * weights are deliberately NOT passed: a routine imported from Hevy months ago
 * carries the weight it was written with, and rendering that under "last time"
 * would be the app inventing a history. The routine decides WHICH lifts and HOW
 * MANY sets; the lifter's real sets decide the numbers.
 *
 * An exercise with no history therefore opens blank, which is `seedBoard`'s
 * documented rule and the right one: "a suggested number the lifter did not
 * choose is the one kind of wrong this app cannot afford, because they will
 * load the bar with it."
 */
async function routinePlan(routineId: string): Promise<{
  name: string
  plan: {
    exerciseId: string
    name: string
    sets: number
    /*
     * DECLARED, not merely returned. This type omitted `bodyweight` when the
     * routine path shipped, and the value only reached `seedBoard` because
     * that function declares the field optional — so the compiler believed
     * routine plans had no such field while the runtime object carried one.
     * Nothing would have flagged its removal, and losing it silently
     * reintroduces the defect fixed one commit earlier: a bodyweight lift
     * drawing a weight stepper.
     */
    bodyweight: boolean
    /* Declared for the same reason, and it is the same defect one field over:
       the routine path dropped pairings entirely because nothing here named
       them. */
    supersetGroup: number | null
  }[]
  exerciseIds: string[]
} | null> {
  const [{ data: routine }, { data: rx }] = await Promise.all([
    supabase.from('routines').select('name').eq('id', routineId).maybeSingle(),
    supabase
      .from('routine_exercises')
      .select('id, exercise_id, position, superset_group')
      .eq('routine_id', routineId)
      .order('position'),
  ])
  if (!routine) return null

  const rows = (rx ?? []) as {
    id: string
    exercise_id: string
    position: number
    superset_group: number | null
  }[]
  if (rows.length === 0) return null

  const [{ data: planned }, { data: catalogue }] = await Promise.all([
    supabase
      .from('routine_sets')
      .select('routine_exercise_id')
      .in(
        'routine_exercise_id',
        rows.map((r) => r.id),
      ),
    supabase
      .from('exercises')
      .select('id, name, equipment')
      .in(
        'id',
        rows.map((r) => r.exercise_id),
      ),
  ])

  const setCount = new Map<string, number>()
  for (const row of (planned ?? []) as { routine_exercise_id: string }[]) {
    setCount.set(
      row.routine_exercise_id,
      (setCount.get(row.routine_exercise_id) ?? 0) + 1,
    )
  }
  const cat = (catalogue ?? []) as {
    id: string
    name: string
    equipment: string | null
  }[]
  const nameOf = new Map(cat.map((e) => [e.id, e.name]))
  const isBodyweight = new Map(cat.map((e) => [e.id, e.equipment === 'bodyweight']))

  return {
    name: (routine as { name: string }).name,
    plan: rows.map((r) => ({
      exerciseId: r.exercise_id,
      name: nameOf.get(r.exercise_id) ?? 'Exercise',
      bodyweight: isBodyweight.get(r.exercise_id) === true,
      // `Math.max(1, …)` is `seedBoard`'s own floor, applied here too so a
      // routine exercise with no planned sets still gets a row to log into
      // rather than vanishing from the board.
      sets: Math.max(1, setCount.get(r.id) ?? 0),
      /*
       * `routine_exercises.superset_group` has existed since 0004:56 and this
       * query never selected it, so Plan then Start, the app's main way into a
       * workout, silently dropped every pairing the routine described. The
       * last-session path 300 lines below carries pairings forward and the
       * board advertises "repeats last session's pairing at zero taps"; the
       * routine path was the one that did not.
       */
      supersetGroup: r.superset_group ?? null,
    })),
    exerciseIds: rows.map((r) => r.exercise_id),
  }
}

/**
 * The lifter's most recent real sets for a given list of lifts.
 *
 * ── `previous_session` PER LIFT, IN PARALLEL, AND THE HAND-ROLLED VERSION
 *    WAS WRONG ───────────────────────────────────────────────────────────────
 * This was one `workout_sets` query with `.order('workout_id').limit(600)`,
 * grouping in JS to find the newest workout per exercise. Its own comment
 * claimed the rows "come back newest-first". They do not: `workout_id` is a
 * v4 UUID, so that ordering is random, and the 600-row cap therefore kept an
 * ARBITRARY subset. Measured on 2026-08-22, the Push routine's lifts already
 * had 521 finished historical sets and Pull 475 — about fifteen more Push
 * sessions from silently dropping the newest Bench Press workout out of the
 * slice and opening that lift blank despite years of history.
 *
 * The fix is not a better `order` clause, it is the function that already
 * exists. `previous_session(p_exercise_id, p_exclude_workout)` picks the
 * newest workout containing that lift and returns its sets in set order, in
 * SQL, with no cap to get wrong. One call per lift, but issued together: a
 * routine holds a handful of exercises, so this is one wall-clock round trip
 * rather than the six SEQUENTIAL ones the old comment was arguing against.
 *
 * `p_exclude_workout` is the session being started. It has no sets yet so it
 * cannot win, but passing it is what makes that true by construction rather
 * than by timing.
 */
async function previousFor(
  exerciseIds: string[],
  excludeWorkoutId: string,
): Promise<
  {
    exerciseId: string
    setNumber: number
    weightKg: number | null
    reps: number | null
    type: BoardExercise['sets'][number]['type']
  }[]
> {
  if (exerciseIds.length === 0) return []

  const results = await Promise.all(
    exerciseIds.map((id) =>
      supabase.rpc('previous_session', {
        p_exercise_id: id,
        p_exclude_workout: excludeWorkoutId,
      }),
    ),
  )

  type Row = {
    set_number: number
    weight_kg: number | null
    reps: number | null
    set_type: string
  }
  return results.flatMap((res, i) =>
    /*
     * A lift whose read failed contributes nothing rather than failing the
     * board. The rest of the routine still opens, and a lift with no ghost is
     * a state `seedBoard` already draws.
     */
    ((res.data ?? []) as Row[]).map((r) => ({
      exerciseId: exerciseIds[i],
      setNumber: r.set_number,
      weightKg: r.weight_kg,
      reps: r.reps,
      type: r.set_type as BoardExercise['sets'][number]['type'],
    })),
  )
}

/**
 * Start a session, from a routine when given one and from the last session
 * otherwise.
 *
 * ── WHY THE ROUTINE PATH EXISTS ─────────────────────────────────────────────
 * Until 2026-08-21 this took no argument at all, and the comment here said
 * seeding from the previous session was "the only plan the app can derive from
 * data it actually has". That stopped being true once the Plan tab shipped: 386
 * rows of routines were sitting there, and Home was naming one of them as due
 * on every launch.
 *
 * It also had a consequence nobody had looked for. Nothing wrote
 * `workouts.routine_id`, so `session_brief()`'s rotation — which joins finished
 * workouts on that column — tied every routine at null and fell through to
 * `position`. The due routine was a CONSTANT. This function is what fills the
 * column, so the rotation starts working from the first routine-started
 * session onward.
 */
export async function startWorkout(routineId?: string): Promise<void> {
  if (state.status === 'active') return

  const startedAt = Date.now()
  /**
   * Minted HERE, not read back from the insert.
   *
   * The old order was: insert the workout, await it, keep the id it returns —
   * and a set banked inside that window had no `workout_id` to reference, so
   * `persistSet` counted it and dropped it. With the id in hand before the
   * first await, a set can be queued against it from the first frame, and the
   * workout row's own insert becomes just another retryable write.
   */
  const workoutId = Crypto.randomUUID()
  set({
    ...EMPTY,
    status: 'active',
    startedAt,
    workoutId,
    routineId: routineId ?? null,
  })

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (userId === undefined) return
  set({ userId })

  /**
   * Both reads at once. The check-in is a separate table and a separate row,
   * and awaiting them in series would put a second round trip between the tap
   * on Start and the board appearing — on the one screen where that is felt.
   *
   * `started_at` is selected purely for `daysRested`. It costs nothing on a
   * query already being made, which is the reason readiness is seeded here
   * rather than by a hook of its own on a screen that would have to ask again.
   */
  const [{ data: recent }, { data: today }] = await Promise.all([
    supabase
      .from('workouts')
      .select(
        'id, name, started_at, workout_sets(exercise_id, set_number, weight_kg, reps, set_type, superset_group)',
      )
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      /*
       * A WINDOW, not the newest row, and the same 30 `useHome` asks for.
       *
       * This was `.limit(1)`, which is the defect `last-session.ts` was written
       * for, still live in the sibling path: on 2026-08-21 the newest finished
       * workout on a 163-workout account was a 21-second start-and-abandon with
       * no sets, so the board seeded EMPTY and Start led to "No exercises yet"
       * — observed on a simulator, on the account with the most history in it.
       * Home was fixed the same day and this was not, which is the worse half:
       * Home renders the wrong copy, this renders no workout at all.
       *
       * The window matches Home's deliberately. Two windows are two answers to
       * "what was my last session", and the momentum target on this board and
       * the number Home promised come from the same question.
       */
      .limit(30),
    supabase.from('daily_checkins').select('state').eq('day', localDay()).maybeSingle(),
  ])

  /*
   * The last session that actually moved weight, by the same rule and the same
   * qualifier Home uses — `sessionVolume` refuses warm-ups and half-empty rows,
   * so "has volume" means one thing in this app rather than two. An empty
   * session is not something to repeat and it is not something to rest from.
   */
  const last = (recent ?? []).find(
    (w) => sessionVolume((w.workout_sets ?? []) as never) > 0,
  )

  /**
   * Null means "not asked today", which `computeReadiness` scores as neutral —
   * the same thing a skipped check-in means, and the reason there is no
   * "skip" button on Home.
   */
  const checkIn: CheckIn | null = asCheckIn(
    (today as { state?: unknown } | null)?.state,
  )
  const lastAt = (last?.started_at as string | null | undefined) ?? null
  const lastMs = lastAt === null ? Number.NaN : new Date(lastAt).getTime()
  const daysRested = Number.isNaN(lastMs)
    ? null
    : Math.floor((Date.now() - lastMs) / 86_400_000)
  set({ readiness: computeReadiness({ checkIn, daysRested }) })
  const previousRows = (last?.workout_sets ?? []) as {
    exercise_id: string
    set_number: number
    weight_kg: number | null
    reps: number | null
    set_type: string
    superset_group: number | null
  }[]

  /*
   * Names come from the catalogue in one read rather than a join per row.
   *
   * NOT READ AT ALL on the routine path, because `routinePlan` does its own
   * catalogue read for the routine's lifts and the board built from this one is
   * discarded a few lines below. This was two catalogue queries on the tap that
   * opens the board, one of them for a plan nothing rendered.
   */
  const ids =
    routineId === undefined ? [...new Set(previousRows.map((r) => r.exercise_id))] : []
  const { data: catalogue } = ids.length
    ? await supabase.from('exercises').select('id, name, equipment').in('id', ids)
    : { data: [] as { id: string; name: string; equipment: string | null }[] }
  const nameOf = new Map((catalogue ?? []).map((e) => [e.id, e.name]))
  /** `exercises.equipment`, which is the only honest source for this. */
  const isBodyweight = new Map(
    ((catalogue ?? []) as { id: string; equipment: string | null }[]).map((e) => [
      e.id,
      e.equipment === 'bodyweight',
    ]),
  )

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
    bodyweight: isBodyweight.get(id) === true,
    /*
     * Last session's pairing, repeated at zero taps — the same argument that
     * carries the set TYPE through `seedBoard`. A lifter who supersetted their
     * rows with their presses last Tuesday is doing it again today, and making
     * them re-pair every week is the kind of tax that gets an app deleted.
     *
     * `find`, not a reduce over all rows: `superset_group` is written from the
     * exercise's board value, so every row of one lift in one session carries
     * the same id by construction. A Hevy import can violate that in theory;
     * taking the first is still a pairing the lifter actually had.
     */
    supersetGroup:
      previousRows.find((r) => r.exercise_id === id && r.superset_group !== null)
        ?.superset_group ?? null,
  }))

  const targetKg = previousRows.reduce((total, r) => {
    if (estimatedOneRepMax(r.weight_kg, r.reps, r.set_type) === null) return total
    return total + (r.weight_kg ?? 0) * (r.reps ?? 0)
  }, 0)

  /*
   * The routine, when there is one, REPLACES the plan and the name and leaves
   * everything above it alone.
   *
   * Readiness, the check-in and `daysRested` are all still computed from the
   * last session, because they are facts about the lifter's week rather than
   * about which workout they picked. Only the board's shape and the session's
   * name come from the routine.
   *
   * A routine that cannot be read falls through to the last-session board
   * rather than opening empty. Starting the wrong-but-plausible workout is
   * recoverable in two taps; "No exercises yet" on a tap that promised a named
   * routine is the dead end this app already shipped once.
   */
  let name = (last?.name as string | null) ?? ''
  let board = seedBoard(plan, previous)
  if (routineId !== undefined) {
    const fromRoutine = await routinePlan(routineId)
    if (fromRoutine !== null) {
      name = fromRoutine.name
      board = seedBoard(
        fromRoutine.plan,
        await previousFor(fromRoutine.exerciseIds, workoutId),
      )
    } else {
      /*
       * The routine could not be read, and `ids` was skipped above on the
       * assumption it would be. Fall back to the last session properly rather
       * than to the EMPTY board that skipping would otherwise leave: this is
       * the "recoverable in two taps" branch the comment above promises, and
       * without this read it would have been the dead end it warns about.
       */
      const fallbackIds = [...new Set(previousRows.map((r) => r.exercise_id))]
      if (fallbackIds.length > 0) {
        const { data: late } = await supabase
          .from('exercises')
          .select('id, name, equipment')
          .in('id', fallbackIds)
        const lateRows = (late ?? []) as {
          id: string
          name: string
          equipment: string | null
        }[]
        const lateName = new Map(lateRows.map((e) => [e.id, e.name]))
        const lateBw = new Map(
          lateRows.map((e) => [e.id, e.equipment === 'bodyweight']),
        )
        board = seedBoard(
          fallbackIds.map((id) => ({
            exerciseId: id,
            name: lateName.get(id) ?? 'Exercise',
            sets: previousRows.filter((r) => r.exercise_id === id).length,
            bodyweight: lateBw.get(id) === true,
            /* The identical construction on the main last-session path derives
               this and this branch did not, so whether a lifter kept their
               pairings depended on whether a routine read happened to fail. */
            supersetGroup:
              previousRows.find(
                (r) => r.exercise_id === id && r.superset_group !== null,
              )?.superset_group ?? null,
          })),
          previous,
        )
      }
    }
  }

  set({
    name,
    board,
    /*
     * The momentum target stays the LAST SESSION's volume even on a routine
     * start, and that is deliberate. The target answers "beat what you did",
     * which is a fact about history; a routine's planned volume would answer
     * "do what was written down months ago", which is not the same question and
     * is not what the bar on the board measures.
     */
    targetKg: targetKg > 0 ? targetKg : null,
  })

  // Not awaited, and a failure here is not fatal: `flushPending` tries again
  // with the same id the next time a set is banked.
  void ensureWorkoutRow()
}

/**
 * Make sure the workout row exists, and say whether it does.
 *
 * A 23505 is SUCCESS. The row is keyed by an id this device generated and by a
 * unique `(user_id, started_at)` index, so a duplicate means an earlier attempt
 * landed — which is exactly what a retry wants to hear. Treating it as an error
 * is how an idempotent write turns into a stuck queue.
 */
async function ensureWorkoutRow(): Promise<boolean> {
  const { workoutId, userId, name, startedAt, routineId } = state
  if (workoutId === null || userId === null) return false
  const { error } = await supabase.from('workouts').insert({
    id: workoutId,
    user_id: userId,
    name: name === '' ? null : name,
    started_at: new Date(startedAt).toISOString(),
    routine_id: routineId,
  })
  return error === null || error.code === '23505'
}

/**
 * Send everything the server does not have yet.
 *
 * Exported because it is real API rather than a hook for tests: it is what an
 * app-foreground or connectivity listener calls, and the one gap this store
 * still has closes by giving this function a trigger.
 */
export function flushPending(): Promise<void> {
  if (draining !== null) return draining
  draining = run().finally(() => {
    draining = null
  })
  return draining
}

/**
 * The walk itself.
 *
 * One narrow race remains and is deliberate: a set banked between the `while`
 * condition failing and `draining` clearing waits for the next trigger rather
 * than this walk. Closing it needs a second loop around the whole function to
 * catch a window of microseconds, and the next banked set drains it anyway.
 */
async function run(): Promise<void> {
  {
    // Once, not per row: the workout row is a single insert and asking for it
    // inside the loop would put a round trip between every set.
    if (state.pending.length > 0 && !(await ensureWorkoutRow())) return

    // Always the HEAD, re-read each pass rather than iterated over a snapshot,
    // so a set banked mid-drain goes out on this same walk.
    while (state.pending.length > 0) {
      const row = state.pending[0]
      const workoutId = state.workoutId
      if (workoutId === null) return

      const { error } = await supabase.from('workout_sets').insert({
        id: row.id,
        workout_id: workoutId,
        exercise_id: row.exerciseId,
        set_number: row.setNumber,
        weight_kg: row.weightKg,
        reps: row.reps,
        set_type: row.setType,
        // Both columns have been in `workout_sets` since 0001 and neither
        // client has ever written one. `?? null` rather than omitted, so a set
        // queued by an older build and restored by this one sends an explicit
        // null instead of `undefined`, which PostgREST rejects.
        rpe: row.rpe ?? null,
        superset_group: row.supersetGroup ?? null,
      })
      // Same rule as the workout row. Anything that is not a duplicate is a
      // real failure, and the queue keeps its place IN ORDER — a set that
      // cannot be sent must not let the next one past it.
      if (error !== null && error.code !== '23505') return
      set({ pending: state.pending.filter((p) => p.id !== row.id) })
    }
  }
}

/**
 * Bank the current set.
 *
 * The board moves first and returns immediately; the caller fires its haptic
 * off this function returning, not off the insert. Nothing on the logging path
 * waits for a network.
 */
export function bankCurrentSet(
  weightKg: number | null,
  reps: number | null,
  rpe: number | null = null,
): void {
  const position = currentPosition(state.board)
  if (position === null) return

  const exercise = state.board[position.exerciseIndex]
  const setRow = exercise.sets[position.setIndex]
  /*
   * A warm-up never carries an effort rating, and the guard is HERE rather
   * than on the screen because this is the write boundary. The chips render
   * only when the set is not a warm-up, but `dialled` is keyed on
   * `exerciseIndex-setIndex` and not on the set TYPE, so dialling RPE 8 and
   * then tapping Warm-up hides the row while leaving 8 in state. The board
   * then stored an effort rating on a set the ghost deliberately filters out
   * of `working`, which is orphan data contradicting the shipped rule that
   * warm-ups sit outside volume, records and the coach.
   */
  const board = bankSet(
    state.board,
    position,
    weightKg,
    reps,
    setRow.type === 'warmup' ? null : rpe,
  )
  if (board === state.board) return

  /**
   * One rest length for every lift, until per-exercise rest is wired.
   *
   * `resolveRest` in the shared domain answers this properly, from the
   * catalogue and the lifter's own override, and neither is read on native
   * yet. Until they are, the app default is the honest answer, and it comes
   * from `@wazn/domain` so the two apps cannot drift to different minutes.
   *
   * WHETHER to rest is `restsAfterBank`'s question, not this file's: it holds
   * both the warm-up rule and the superset rule, and it reads the board AFTER
   * the bank, which is why it is called with `board` rather than `state.board`.
   * A superset that rested between its two lifts would not be a superset.
   */
  const rests = restsAfterBank(board, position) && DEFAULT_REST_SECONDS > 0

  set({
    board,
    restEndsAt: rests ? Date.now() + DEFAULT_REST_SECONDS * 1000 : null,
    restTotal: rests ? DEFAULT_REST_SECONDS : 0,
  })
  persistSet(
    exercise.exerciseId,
    setRow.setNumber,
    setRow.type,
    weightKg,
    reps,
    rpe,
    exercise.supersetGroup ?? null,
  )
}

/**
 * Pair the lift in front of the lifter with the next one on the board, or
 * break it out of the pair it is in.
 *
 * Group state lives on the EXERCISE and reaches the row at bank time, so this
 * changes nothing already in Postgres — the same contract `setCurrentSetType`
 * holds. Re-pairing mid-session is therefore honest rather than lossy: the
 * three sets logged before the pairing keep their null group, which is what
 * actually happened.
 */
export function toggleCurrentSuperset(): void {
  const position = currentPosition(state.board)
  if (position === null) return
  const board = toggleSuperset(state.board, position.exerciseIndex)
  if (board === state.board) return
  set({ board })
}

/**
 * Type the set the lifter is on.
 *
 * The board is truth (see the top of this file), so this only moves the board;
 * `bankCurrentSet` reads the type off the row it is banking and `persistSet`
 * sends it. There is no update path and there does not need to be one:
 * `markSetType` refuses a banked set, so nothing here can contradict a row
 * that is already in Postgres.
 *
 * A no-op position is a no-op, not a throw. The only way to tap this with
 * nothing in front of you is a chip racing the last commit of the session.
 */
export function setCurrentSetType(type: BoardExercise['sets'][number]['type']): void {
  const position = currentPosition(state.board)
  if (position === null) return
  const board = markSetType(state.board, position, type)
  if (board === state.board) return
  set({ board })
}

/**
 * Put a lift on the board mid-session.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT OPTIONAL ─────────────────────────────
 * The board is seeded from the LAST session, so on a new account it is EMPTY.
 * Until 2026-08-21 native had no way to add anything to it, which meant a new
 * lifter could start a workout, see nothing, and finish it. The app's one
 * sentence is "log a set in under thirty seconds" and a new account could not
 * log one at all. Every check ran against an account with history, so nothing
 * ever said so.
 *
 * ── THREE BLANK SETS, AND NO PREVIOUS ───────────────────────────────────────
 * Three because it is the commonest working prescription and because the board
 * walks off the end cleanly — a lifter who wants a fourth gets it when set
 * three banks and `currentPosition` finds nothing, which is the finish state,
 * not an error. It is a default, not a claim.
 *
 * `previousKg`/`previousReps` are null. For the case this unblocks — a lift
 * with no history — that IS the truth. For a lifter adding a lift they have
 * done before, the honest previous is one `previous_session` RPC away and is a
 * follow-up; null renders as "no ghost", which is a missing hint rather than a
 * wrong one.
 *
 * ── `weightKg: 0` AND NOT `null`, WHICH IS NOT A DETAIL ─────────────────────
 * `live-board.ts:24` defines a null `weightKg` as "bodyweight lift", and the
 * board screen hides the weight dial entirely when it sees one. Seeding every
 * added lift with null therefore shipped a Bench Press you could not put a
 * weight on — caught on a simulator, not by any check, because the picker path
 * had never been walked. The caller knows the equipment; it has to say.
 */
export function addExercise(
  exerciseId: string,
  name: string,
  bodyweight = false,
): void {
  if (state.board.some((e) => e.exerciseId === exerciseId)) return
  const sets = [1, 2, 3].map((setNumber) => ({
    setNumber,
    type: 'normal' as const,
    weightKg: bodyweight ? null : 0,
    reps: null,
    rpe: null,
    done: false,
    previousKg: null,
    previousReps: null,
  }))
  set({
    board: [
      ...state.board,
      { exerciseId, name, bodyweight, supersetGroup: null, sets },
    ],
  })
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

/**
 * The insert. `setType` is the BOARD's type, never a literal.
 *
 * It was `'normal'` hardcoded until 2026-08-19, which meant a warm-up banked
 * on the phone landed in the same table as a working set and stayed there.
 * Every consumer of that column reads it as truth: `estimatedOneRepMax`
 * refuses warm-ups, `exercise_bests` and the record trigger in migration 0009
 * filter on `set_type <> 'warmup'`, and the momentum target this store chases
 * is computed the same way. One wrong literal here poisons e1RM, records and
 * volume for that lifter permanently, and no later edit on the phone can find
 * the rows to fix. The web app carries the lifter's chosen `setType` into the
 * row (`LogScreen`'s `optimistic`); this is the same contract, same table.
 */
function persistSet(
  exerciseId: string,
  setNumber: number,
  setType: BoardExercise['sets'][number]['type'],
  weightKg: number | null,
  reps: number | null,
  rpe: number | null,
  supersetGroup: number | null,
): void {
  set({
    pending: [
      ...state.pending,
      {
        id: Crypto.randomUUID(),
        exerciseId,
        setNumber,
        setType,
        weightKg,
        reps,
        rpe,
        supersetGroup,
      },
    ],
  })
  void flushPending()
}

export async function finishWorkout(): Promise<void> {
  const workoutId = state.workoutId
  set({ status: 'finished', sealed: false })
  if (workoutId === null) return
  // Last chance to land the sets, and it runs BEFORE `ended_at` is written: a
  // workout marked finished while its sets are still on the phone reads, to
  // every query downstream, as a completed session with missing volume.
  await flushPending()
  const { error } = await supabase
    .from('workouts')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', workoutId)
  // Sealed only on success. An update that failed leaves the row without an
  // `ended_at`, and a debrief asked for it would come back empty — so the
  // honest state is "not sealed", and the summary simply says less.
  if (!error) set({ sealed: true })
}

export function resetWorkout(): void {
  set(EMPTY)
}

/** Everything the board draws, derived in one place so the screen has no maths. */
export function selectBoardView(s: LiveState) {
  const position = currentPosition(s.board)
  const banked = bankedVolumeKg(s.board)
  /*
   * `pct` and `recordPace` were computed here for the momentum bar, which the
   * board dropped in the prototype port (see the note in `session/[id].tsx`).
   * Nothing read either one afterwards except their own test. `momentumPct`
   * stays in the shared domain — the web still draws it.
   */
  return {
    position,
    banked,
    exercise: position === null ? null : s.board[position.exerciseIndex],
    set:
      position === null
        ? null
        : s.board[position.exerciseIndex].sets[position.setIndex],
  }
}
