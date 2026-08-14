import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { publishActiveWorkout } from '../lib/active-workout'
import { dueRoutine } from '../lib/rotation'
import type { RoutineWithRun } from '../lib/rotation'
import { lazyScreen } from '../lib/lazy-screen'
import { useUnit } from '../lib/unit-context'
import { useLocale } from '../lib/locale-context'
import {
  formatDuration,
  formatShortDate,
  formatSyncedAt,
  formatWeekday,
  formatWorkoutDate,
} from '../lib/format'
import type {
  Exercise,
  ExerciseUsageRow,
  PreviousSessionRow,
  Routine,
  SetType,
  WeeklyStreakRow,
  Workout,
  WorkoutSet,
} from '../lib/types'
import { ExercisePicker } from '../components/ExercisePicker'
import { IconBack, IconHistory, PlateRing } from '../components/icons'
import { SetEntry } from '../components/SetEntry'
import { SessionQueue } from '../components/SessionQueue'
import { UpNextCard } from '../components/UpNextCard'
import { recentRecords, thisWeek } from '../lib/progress'
import type { RecordSetRow, SessionVolumeRow } from '../lib/progress'
import { LastPrCard, RecentSessionCard, WeekCard } from '../components/HomeFeed'
import { countsForRecords, totalVolumeKg } from '../lib/summary'
import { DEFAULT_REST_SECONDS, useRestTimer } from '../lib/use-rest-timer'
import { FinishSummary } from '../components/FinishSummary'
import { RoutineList } from '../components/RoutineList'
import { InstallPrompt } from '../components/InstallPrompt'
import { CoachBrief } from '../components/CoachBrief'
import { Welcome } from '../components/Welcome'
import { InviteCard } from '../components/InviteCard'
import type { Inviter } from '../lib/social'
import { hasBeenWelcomed, markWelcomed } from '../lib/welcomed'
import { useWakeLock } from '../lib/use-wake-lock'
import { RoutineEditor } from '../components/RoutineEditor'
import {
  listRoutines,
  loadRoutine,
  saveRoutine,
  duplicateRoutine,
  deleteRoutine,
} from '../lib/routines'
import type { RoutineDetail, RoutineDraft } from '../lib/routines'
import { groupOf, nextGroupId, ungroupIds } from '../lib/supersets'
import { summarise } from '../lib/summary'
import type { WorkoutSummary } from '../lib/summary'
import { resolveRest } from '../lib/rest'
import { commitOutcome } from '../lib/commit'
import type { CommitOutcome } from '../lib/commit'
import { buildBlock, groupAdjacent, mergeOrder } from '../lib/plan'
import type { OverviewRow, PlannedSet, WorkoutPlan } from '../lib/plan'
import { WorkoutOverview } from '../components/WorkoutOverview'
import type { OverviewBlock } from '../components/WorkoutOverview'
import { RestChip } from '../components/RestTimer'
import { RestExpanded } from '../components/RestExpanded'
import { RestCanvas } from '../components/RestCanvas'
import { pickRestCard } from '../lib/rest-canvas'
import type { CrewToday } from '../lib/rest-canvas'
import { recordCoachView } from '../lib/coach'
import { fetchFeed, nameOf } from '../lib/social'
import {
  ack,
  classifyFailure,
  discardWrites,
  enqueue,
  finishOpId,
  hasPendingStart,
  head,
  newId,
  pendingSetCount,
  retry,
  retryDelayMs,
  shouldSurface,
} from '../lib/write-queue'
import type { QueuedWrite } from '../lib/write-queue'
import {
  browserStorage,
  clear as clearCheckpoint,
  isUsable,
  load as loadCheckpoint,
  save as saveCheckpoint,
} from '../lib/checkpoint'
import { indexedDbStore } from '../lib/idb'
import {
  getQueue,
  getSnapshot,
  mergeQueues,
  putQueue,
  putSnapshot,
  withDeadline,
} from '../lib/offline-store'
import { isOnline, useOnline } from '../lib/use-online'

type View = 'overview' | 'picker' | 'entry' | 'summary' | 'routine' | 'import'

/**
 * The Hevy import, loaded on demand.
 *
 * A person opens this once in their life and most never open it at all, so it
 * has no business in the chunk that has to be interactive before the first set.
 * It is also excluded from the service worker's precache (`vite.config.ts`),
 * because an import that writes to Supabase cannot work offline anyway.
 *
 * `lazyScreen` rather than `lazy`, for the reason the three tabs needed it: a
 * deploy retires the hashed chunk an open page is about to import. Reloading
 * is safe here because this is only ever reachable with no workout open.
 */
const HevyImport = lazyScreen(() =>
  import('../components/HevyImport').then((m) => ({ default: m.HevyImport })),
)

/**
 * What the device keeps so a gym with no signal is still a gym you can log in.
 *
 * Split in two because they change at completely different rates: the
 * catalogue is rewritten once per load, the board on every set. Maps and Sets
 * are stored as entry arrays — IndexedDB's structured clone would carry a Map
 * fine, but the same records are read back through a validator and plain JSON
 * is what a validator can check.
 */
interface CatalogueSnapshot {
  exercises: Exercise[]
  usage: [string, ExerciseUsageRow][]
  restOverrides: [string, number][]
  exerciseNotes: [string, string][]
  routines: RoutineWithRun[]
  hasHistory: boolean
  lastSession: LastSession | null
  /** Finished-workout volume per day, for the home's week row. */
  weekRows?: SessionVolumeRow[]
}

/**
 * The last finished workout, as the home feed needs it.
 *
 * `name` and `endedAt` were added for the recent-session card and are optional
 * on the type for one reason: a snapshot cached by an earlier build has
 * neither, and a device coming back online after an update must not render
 * `undefined min`. Everything reading them treats missing as unknown.
 */
interface LastSession {
  startedAt: string
  sets: WorkoutSet[]
  name?: string | null
  endedAt?: string | null
}

interface BoardSnapshot {
  workout: Workout | null
  sets: WorkoutSet[]
  order: string[]
  planned: string[]
  plan: [string, PlannedSet[]][]
  previous: [string, PreviousSessionRow[]][]
}

/**
 * A queued write, as the row it will become.
 *
 * The optimistic row and the queued write have said the same thing in two
 * shapes since U3a; this is the one conversion between them, so a restored
 * set and a just-committed set cannot drift apart. PR flags stay false: a
 * record is computed in the database against every earlier set, and an
 * unsent row genuinely cannot know.
 */
function asSetRow(q: Extract<QueuedWrite, { kind: 'set' }>): WorkoutSet {
  return {
    id: q.id,
    workout_id: q.workoutId,
    exercise_id: q.exerciseId,
    set_number: q.setNumber,
    weight_kg: q.weightKg,
    reps: q.reps,
    rpe: q.rpe,
    duration_seconds: null,
    distance_meters: null,
    set_type: q.setType,
    superset_group: q.supersetGroup,
    pr_weight: false,
    pr_e1rm: false,
  }
}

interface ExerciseBestRow {
  exercise_id: string
  best_weight_kg: number | string
  best_e1rm_kg: number | string
}

export function LogScreen({
  userId,
  onOpenCoach,
  onOpenHistory,
  onOpenProgress,
  inviter,
  initialView = 'overview',
}: {
  userId: string
  /** The routine builder lives on the Coach tab (design v2.1), so Log's
   *  "Generate" is navigation rather than a view of its own. */
  onOpenCoach: () => void
  /** The home feed's cards are the doors to the other screens now that the
   *  five-tab bar is going: the week and the last session open History, the
   *  record opens Progress. */
  onOpenHistory: () => void
  onOpenProgress: () => void
  /** Whoever invited this person, resolved once by App. */
  inviter: Inviter | null
  /**
   * What to do on arrival.
   *
   * `'import'` is a view and is seeded straight into `view`. `'picker'` is
   * NOT — it is an action. Seeding `view = 'picker'` did nothing at all: the
   * picker only renders inside the open-workout branch, and the `if (!workout)`
   * return above it fires first, so the empty-history screen's "Start a
   * workout" landed the reader back on home. It also armed the back layer for
   * a view that was never on screen, costing one phantom history entry.
   *
   * A workout has to exist for the picker to have anything to add to, and
   * creating one enqueues a write — so it runs on arrival rather than in a
   * state initialiser.
   */
  initialView?: 'overview' | 'picker' | 'import'
}) {
  const { unit } = useUnit()
  const { t, locale } = useLocale()
  /**
   * `t` changes identity when the locale does. `load` and `drain` must NOT:
   * an effect calls `load()` whenever its identity changes, so putting `t` in
   * its deps meant toggling the language mid-workout re-ran the whole load —
   * seven fetches and a state restore, on the one screen that must never lose
   * a set. Read through a ref instead, assigned in an effect: the
   * `react-hooks/refs` rule rejects a render-time ref write.
   */
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  // Owned by the screen, not by SetEntry: leaving the exercise to pick the
  // next one must not cancel the rest you are still taking.
  const timer = useRestTimer()
  /**
   * Which lift the running rest belongs to — E1's rest canvas needs to know
   * what is coming, not what just happened.
   *
   * In a superset those are different exercises: a round alternates, so the
   * next thing under the bar is the partner. `commitOutcome` already decides
   * that (`advanceTo`), and this is the same answer kept for the canvas.
   */
  const [restingExerciseId, setRestingExerciseId] = useState<string | null>(null)
  const [restExpanded, setRestExpanded] = useState(false)
  // The layer never outlives the rest itself.
  if (restExpanded && timer.remaining === null) setRestExpanded(false)
  /**
   * What the crew did today, fetched at most once per open workout and never on
   * the load path — see the effect below.
   */
  const [crew, setCrew] = useState<CrewToday | null>(null)
  const crewRequested = useRef(false)
  /** One `rest_canvas` view row per workout. See RestCanvas's `onView`. */
  const canvasViewed = useRef(false)
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [summaryDate, setSummaryDate] = useState('')
  /**
   * The finished session's sets and their board order, snapshotted.
   *
   * The finish handler clears `sets` in the same pass that builds the summary,
   * so the breakdown card cannot read them off live state — it would render an
   * empty card, silently, and only a screenshot would say so.
   */
  const [summarySets, setSummarySets] = useState<WorkoutSet[]>([])
  const [summaryOrder, setSummaryOrder] = useState<string[]>([])
  const [summaryOrdinal, setSummaryOrdinal] = useState<number | null>(null)
  // The finished workout's identity, kept past the point where `workout` is
  // cleared, so the summary can name and annotate the thing just logged.
  const [summaryWorkout, setSummaryWorkout] = useState<Workout | null>(null)
  const [streak, setStreak] = useState<WeeklyStreakRow | null>(null)
  const [routines, setRoutines] = useState<RoutineWithRun[]>([])
  const [editing, setEditing] = useState<RoutineDetail | null>(null)
  const [routineBusy, setRoutineBusy] = useState<string | null>(null)
  // Exercise ids the active routine planned, in order. The workout itself
  // stays freestyle, so you can deviate at any point.
  const [planned, setPlanned] = useState<string[]>([])
  /**
   * The routine's set targets per exercise — row count and reps, never weight.
   * A routine stores what to do; only history knows what you lifted.
   */
  const [plan, setPlan] = useState<WorkoutPlan>(new Map())
  /**
   * Block order, design v2.2. This is the user's arrangement, read back from
   * `workouts.exercise_order` (migration 0020) so a reload does not forget it,
   * and it doubles as the membership record for a block with no sets yet.
   */
  const [order, setOrder] = useState<string[]>([])
  /**
   * Set to true the first time a write to `exercise_order` is refused, which is
   * what an unapplied 0020 looks like. Ordering then lives for the session only
   * — the pre-v2.2 behaviour — instead of erroring at every drag.
   */
  const orderUnavailable = useRef(false)
  /** Exercises taken off the board, so a routine does not put them straight back. */
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  /** Rows added past the plan by "+ Add set", per exercise. */
  const [extraRows, setExtraRows] = useState<Map<string, number>>(new Map())
  /** Per-lift notes (migration 0008), surfaced on the block for the first time. */
  const [exerciseNotes, setExerciseNotes] = useState<Map<string, string>>(new Map())
  /** The row the overview should bring under the thumb after a commit. */
  const [focusKey, setFocusKey] = useState<string | null>(null)
  /** The row the focused view is open on, so the overview can ring it. */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  /** Blocks with nothing logged, named on the finish summary and nowhere else. */
  const [skipped, setSkipped] = useState<string[]>([])
  /**
   * Today's session, shaped as a routine, offered on the finish summary when it
   * no longer matches the routine it was started from.
   *
   * Offered there and nowhere else. §2.1 protects the logging *flow*, and
   * Finish is the end of it rather than the middle — asking this mid-workout
   * would be a modal between sets, which is the thing the whole app refuses.
   */
  const [routineUpdate, setRoutineUpdate] = useState<{
    routineId: string
    name: string
    draft: RoutineDraft
  } | null>(null)
  // Group id to stamp on the next set, set when starting a superset from the
  // overview and cleared once it lands on a row.
  const [pendingGroup, setPendingGroup] = useState<number | null>(null)

  /**
   * Sets committed on screen that the server has not acknowledged yet — U3's
   * trust-ladder rung 2.
   *
   * Held in a ref as well as state because the drain loop must always see the
   * current queue: a `useCallback` closing over state would retry against
   * whatever the queue was when it was created. Every mutation goes through
   * `updateQueue` so the two never disagree.
   */
  const [queue, setQueue] = useState<QueuedWrite[]>([])
  const queueRef = useRef<QueuedWrite[]>([])
  const drainingRef = useRef(false)

  /**
   * The device's own copy of everything — U3b, trust-ladder rungs 3 and 4.
   *
   * Opened once: `indexedDB.open` is a handshake, not a per-render cost. Null
   * wherever IndexedDB is not reachable (a locked-down WebView, a Firefox
   * private window), in which case every read below returns nothing and every
   * write is a no-op — a slower app with no offline cache, never a broken one.
   */
  const offlineStore = useMemo(() => indexedDbStore(), [])
  const online = useOnline()
  /**
   * True once the load path has read what the device was holding.
   *
   * Both durable copies of the queue are written by effects that watch state,
   * and on mount that state is empty — so without this gate the first render
   * OVERWRITES the checkpoint and the IndexedDB queue with nothing, before the
   * async load has had a chance to read either.
   *
   * That is not a new hazard introduced here. The checkpoint effect has
   * cleared itself on mount since U3a (`if (!workout) clearCheckpoint`), which
   * runs before the load effect and always beat `loadCheckpoint` to the key —
   * so rung 1 could never actually restore anything. It survived review
   * because nothing had ever driven a reload in a browser. The airplane-mode
   * run in `e2e/offline.spec.ts` is what found it.
   */
  const restoredRef = useRef(false)
  /** When the screen is showing cached reads, and how old they are. */
  const [cachedAt, setCachedAt] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [usage, setUsage] = useState<Map<string, ExerciseUsageRow>>(new Map())
  // Per-user rest defaults (migration 0015). Small — one row per lift the user
  // has an opinion about — so it rides the initial load rather than being
  // fetched when an exercise opens, which would put a round trip in front of
  // the timer.
  const [restOverrides, setRestOverrides] = useState<Map<string, number>>(new Map())
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [hasHistory, setHasHistory] = useState(false)
  // The idle screen answers "what did I do last time" without a tab change.
  // Only fetched when there is no workout open — mid-session it is noise.
  const [lastSession, setLastSession] = useState<LastSession | null>(null)
  // The home feed's two extra facts. Idle screen only — mid-workout neither
  // card is on screen, so neither query runs.
  const [weekRows, setWeekRows] = useState<SessionVolumeRow[]>([])
  const [recordRows, setRecordRows] = useState<RecordSetRow[]>([])

  const [view, setView] = useState<View>(
    initialView === 'import' ? 'import' : 'overview',
  )
  const arrivalDone = useRef(false)

  /*
   * "Start a workout", arriving from the empty History or Progress screen.
   *
   * After the load, because `startWorkout` creates the workout and enqueues
   * its insert — doing that before the load has read the device would race
   * the checkpoint restore for the same screen.
   */
  useEffect(() => {
    if (loading || initialView !== 'picker' || arrivalDone.current) return
    arrivalDone.current = true
    startWorkout()
    // `startWorkout` is not a dependency: it is redefined every render and
    // wrapping it — and `openWorkout`, and everything those two reach — in
    // useCallback would be a large change to silence a warning about a call
    // that runs exactly once, guarded by the ref above. Narrowly disabled
    // rather than left as a standing warning, so a real omission here would
    // still be visible in review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialView])

  // Onboarding is shown once, to an account with nothing in it, and can be
  // dismissed forward into either path. It is state rather than a route
  // because it is a moment, not a place.
  /**
   * Read from storage on first render, not defaulted to false. Every screen
   * here unmounts when you leave it, so a `useState(false)` meant the
   * first-run screen came back every time a new user returned to home.
   */
  const [welcomed, setWelcomed] = useState(() => hasBeenWelcomed(userId))

  const dismissWelcome = () => {
    markWelcomed(userId)
    setWelcomed(true)
  }
  const [current, setCurrent] = useState<Exercise | null>(null)

  // The screen stays on while a workout is open. Racking the bar and finding
  // a locked phone costs most of the 30-second budget the whole app is built
  // around. Silent, guarded, and released the moment the workout ends.
  useWakeLock(workout !== null)
  // Every sub-view is one back layer deep: the system back gesture returns
  // to the overview instead of closing the app. One entry for all of them —
  // picker → entry reuses it, so back never retraces the picking steps.
  useBackLayer(view !== 'overview', () => {
    setEditing(null)
    setCurrent(null)
    setSummary(null)
    setView('overview')
  })
  // Two-tap finish: one graze of a button must not end the workout. The
  // armed state relaxes on its own.
  const [confirmFinish, setConfirmFinish] = useState(false)
  // Discard is armed the same way, and only ever reachable from the armed
  // finish row — two deliberate taps, no modal. §8 of the UX heuristics: undo
  // beats "are you sure", and where undo is impossible, arming is the next
  // best thing, because it never interrupts anything.
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // One window governs both, and touching either restarts it. The armed row
  // now carries a sentence and a second control, so the four seconds that
  // were right for a lone Finish button would take Discard out from under a
  // thumb already on its way there.
  useEffect(() => {
    if (!confirmFinish) return
    const id = setTimeout(() => {
      setConfirmFinish(false)
      setConfirmDiscard(false)
    }, 6000)
    return () => clearTimeout(id)
  }, [confirmFinish, confirmDiscard])
  /*
   * Re-render while a workout is open, so the duration in the status row
   * moves. The value itself is derived at render time.
   *
   * L3: the tick was 30s, so the elapsed figure was up to half a minute stale
   * and a glance between sets could read a minute behind. 10s costs three
   * cheap re-renders a minute against a number people check constantly, and
   * the alternative considered and rejected was 1s: a seconds-accurate clock
   * on the hot path buys nothing when the figure is rendered in whole minutes.
   */
  const [, setDurationTick] = useState(0)
  useEffect(() => {
    if (!workout) return
    const id = setInterval(() => setDurationTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [workout])

  /*
   * Tell the header a workout is open, so Discard is reachable from the
   * overflow menu (L8). The callback goes through a ref rather than being
   * captured, or the header would hold whichever `discardWorkout` closure
   * existed when the workout id last changed and could delete against stale
   * state. See `lib/active-workout.ts` for why this is a store and not a
   * context.
   */
  const discardRef = useRef<() => void>(() => {})
  discardRef.current = () => void discardWorkout()
  const workoutId = workout?.id ?? null
  useEffect(() => {
    publishActiveWorkout(
      workoutId ? { id: workoutId, discard: () => discardRef.current() } : null,
    )
    return () => publishActiveWorkout(null)
  }, [workoutId])
  /**
   * Last session per exercise, for every block on the board — not only the one
   * being logged. The overview ghosts last time on every row, which is the
   * retention engine and the reason the previous fetch is now plural.
   *
   * Presence in the map IS the loaded flag, so the focused view's seeding rule
   * is unchanged: a missing entry means "still loading", and `SetEntry` waits
   * rather than seeding from an empty list. A flag set in an effect would land
   * after the child had already rendered, which is how the auto-fill broke once.
   */
  const [previousByExercise, setPreviousByExercise] = useState<
    Map<string, PreviousSessionRow[]>
  >(new Map())
  /** Requests already in flight or answered, keyed workout+exercise. */
  const previousRequested = useRef(new Set<string>())

  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  )

  /**
   * A workout with no sets in it is not a workout — it is a tap.
   *
   * Four of them are sitting in production History right now as blank rows,
   * from desktop taps that started a session and walked away. They cannot be
   * distinguished from a real workout after the fact, so they are removed at
   * the moment they are abandoned instead.
   *
   * Only on unmount — leaving the Log tab — and on finish. Deliberately NOT on
   * `pagehide`: that fires when a phone is pocketed, and a workout started at
   * the rack before the first set is exactly the case that must survive it.
   */
  const emptyWorkoutId = useRef<string | null>(null)
  useEffect(() => {
    emptyWorkoutId.current = workout && sets.length === 0 ? workout.id : null
  }, [workout, sets.length])
  useEffect(
    () => () => {
      const id = emptyWorkoutId.current
      if (!id) return
      // A workout whose own insert is still queued has never reached the
      // server, so there is nothing to delete — dropping its writes IS the
      // discard. Deleting anyway would be a request that can only 404, and
      // leaving the insert queued would sync the blank row this guard exists
      // to prevent.
      const landed = !hasPendingStart(queueRef.current, id)
      const rest = queueRef.current.filter((w) => w.workoutId !== id)
      queueRef.current = rest
      void putQueue(offlineStore, userId, rest)
      if (landed) void supabase.from('workouts').delete().eq('id', id)
    },
    [offlineStore, userId],
  )

  const updateQueue = useCallback((fn: (q: QueuedWrite[]) => QueuedWrite[]) => {
    queueRef.current = fn(queueRef.current)
    setQueue(queueRef.current)
  }, [])

  /**
   * Send one queued write. Everything network-shaped about the queue is here.
   *
   * The client-generated id IS the primary key on both inserts, so replaying a
   * write that already landed is refused (`23505`) rather than duplicated, and
   * both updates are idempotent by nature.
   */
  const send = useCallback(async (item: QueuedWrite) => {
    switch (item.kind) {
      case 'set':
        return supabase
          .from('workout_sets')
          .insert({
            id: item.id,
            workout_id: item.workoutId,
            exercise_id: item.exerciseId,
            set_number: item.setNumber,
            weight_kg: item.weightKg,
            reps: item.reps,
            set_type: item.setType,
            rpe: item.rpe,
            superset_group: item.supersetGroup,
          })
          .select()
          .single()
      case 'workout-start':
        return supabase
          .from('workouts')
          .insert({
            id: item.id,
            user_id: item.userId,
            started_at: item.startedAt,
            name: item.name,
            routine_id: item.routineId,
          })
          .select()
          .single()
      case 'workout-finish':
        return (
          supabase
            .from('workouts')
            .update({ ended_at: item.endedAt })
            // Device wins for its own data, and this is the one field where two
            // devices could disagree: whoever finished the session is the one
            // who was in the gym, so this overwrites rather than merges.
            .eq('id', item.workoutId)
            .select()
            .maybeSingle()
        )
      case 'workout-discard':
        return supabase.from('workouts').delete().eq('id', item.workoutId).select()
    }
  }, [])

  /**
   * Drain the queue, oldest first, until it is empty.
   *
   * One loop at a time (`drainingRef`), because two would race on the same
   * head and send it twice — which the primary key would catch, but only after
   * both had gone out.
   *
   * Head-first with a failed head retried rather than skipped, which is not
   * politeness about ordering: `workout_sets.workout_id` references
   * `workouts`, so the sets of a workout started offline must stay behind the
   * insert that creates it.
   *
   * Three outcomes, and the middle one is what U3b added:
   *
   *  - **landed** — acked, and for a set, reconciled against the server's row,
   *    which carries the PR flags an optimistic row genuinely cannot know.
   *  - **offline** — not a failure. Nothing was refused; there was no network.
   *    The attempt is not counted, nothing is said, and the loop stops until
   *    something wakes it. Before this, a basement gym produced three fast
   *    retries and then an error banner over a board somebody was lifting
   *    from, which is the interruption §2.1 forbids and a lie besides.
   *  - **rejected** — a server answered and said no. Counted, backed off, and
   *    surfaced once `shouldSurface` says silence has stopped being honest.
   */
  const drain = useCallback(async () => {
    if (drainingRef.current) return
    // No radio, no point. The `online`/`visibilitychange` listeners below are
    // what start this again, so nothing is lost by not trying.
    if (!isOnline()) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const item = head(queueRef.current)
        if (!item) break

        const { data, error: writeError } = await send(item)

        if (!writeError || classifyFailure(writeError) === 'landed') {
          updateQueue((q) => ack(q, item.id))
          if (item.kind === 'set' && data) {
            const row = data as WorkoutSet
            setSets((prev) => prev.map((s) => (s.id === row.id ? row : s)))
          }
          setError(null)
          continue
        }

        if (classifyFailure(writeError) === 'offline') {
          // Leave it at the head, uncounted. It is still true that the user
          // did this set; the only thing in doubt is this building's signal.
          break
        }

        updateQueue((q) => retry(q, item.id))
        const attempts = queueRef.current.find((q) => q.id === item.id)?.attempts ?? 1
        if (shouldSurface(attempts)) {
          setError(
            describeError(
              item.kind === 'set'
                ? tRef.current('log.queue.set_retry', {
                    number: String(item.setNumber),
                  })
                : tRef.current('log.queue.workout_retry'),
              writeError,
            ),
          )
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempts)))
      }
    } finally {
      drainingRef.current = false
    }
  }, [send, updateQueue])

  /**
   * Wake the queue the moment there is somewhere to send it.
   *
   * Deliberately NOT the Background Sync API: it does not exist on iOS, and
   * half the beta cohort is on iPhones. These three events are what every
   * browser has — `online` for the radio coming back, `visibilitychange` for
   * the phone coming out of a pocket (iOS suppresses `online` in a
   * backgrounded tab), and a slow interval as the backstop for a network that
   * changed without saying so, which is the captive-portal case
   * `navigator.onLine` is famously wrong about.
   */
  useEffect(() => {
    const wake = () => {
      if (queueRef.current.length > 0) void drain()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    const id = setInterval(wake, 20_000)
    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      clearInterval(id)
    }
  }, [drain])

  /**
   * The queue, on the device, durably.
   *
   * Written on every change rather than at intervals: the whole promise is
   * that a set survives the tab dying between the check and the ack, and a
   * batched write is a window where it would not. The checkpoint below holds a
   * synchronous copy of the same thing for the harder case — see checkpoint.ts
   * for why both exist.
   */
  useEffect(() => {
    if (!restoredRef.current) return
    void putQueue(offlineStore, userId, queue)
  }, [offlineStore, userId, queue])

  /**
   * Wait for the queue to empty, bounded.
   *
   * Used at Finish and nowhere else. Finish is the end of the logging flow
   * rather than the middle of it, so a wait is allowed here — and it is
   * necessary, because the summary and `exercise_bests` are computed against
   * what the server actually has.
   */
  const flushQueue = useCallback(
    async (timeoutMs = 8000) => {
      // Nothing to wait for with no radio. Finishing offline is a supported
      // ending, not a failure, so it must not cost eight seconds first.
      if (!isOnline()) return queueRef.current.length === 0
      void drain()
      const deadline = Date.now() + timeoutMs
      while (queueRef.current.length > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 120))
        if (!isOnline()) break
      }
      return queueRef.current.length === 0
    },
    [drain],
  )

  /**
   * The checkpoint, rewritten whenever anything it protects changes.
   *
   * Committed sets already survive a refresh because Postgres has them. What
   * did not survive anything is exactly what is written here: writes still in
   * flight, and the board's client-only state — block order when 0020 is
   * unapplied, rows added past the plan, exercises taken off the board.
   */
  useEffect(() => {
    // Not before the load path has read it. See `restoredRef`.
    if (!restoredRef.current) return
    const storage = browserStorage()
    if (!workout) {
      clearCheckpoint(storage)
      return
    }
    saveCheckpoint(storage, {
      workoutId: workout.id,
      savedAt: Date.now(),
      queue,
      order,
      extraRows: [...extraRows],
      removed: [...removed],
    })
  }, [workout, queue, order, extraRows, removed])

  /**
   * The board, on the device — the rows the checkpoint deliberately does not
   * hold.
   *
   * The checkpoint's job is the client-only state; committed sets were always
   * safe because Postgres had them. That reasoning has one hole and offline is
   * it: a workout reopened with no signal cannot ask Postgres for anything, so
   * the acked sets and the workout row itself have to be here too. Without
   * this, "kill the tab mid-workout, reopen" works online and shows an empty
   * screen in a basement.
   */
  /**
   * Ending a session clears its cached board, and the two callers that do it
   * are Finish and Discard.
   *
   * Deliberately NOT `if (!workout)` inside the effect below: `workout` is
   * null on mount too, for the moment before the load resolves, and clearing
   * there would wipe the board a dead-zone reopen is about to read.
   */
  const clearBoardSnapshot = useCallback(() => {
    void putSnapshot(offlineStore, userId, 'board', {
      workout: null,
      sets: [],
      order: [],
      planned: [],
      plan: [],
      previous: [],
    } satisfies BoardSnapshot)
  }, [offlineStore, userId])

  useEffect(() => {
    if (!restoredRef.current || !workout) return
    void putSnapshot(offlineStore, userId, 'board', {
      workout,
      sets,
      order,
      planned,
      plan: [...plan],
      previous: [...previousByExercise],
    } satisfies BoardSnapshot)
  }, [offlineStore, userId, workout, sets, order, planned, plan, previousByExercise])

  /** Override, then the catalogue's default for the movement, then the app's. */
  const restFor = useCallback(
    (exercise: Exercise) =>
      resolveRest(exercise.default_rest_seconds, restOverrides.get(exercise.id)),
    [restOverrides],
  )

  /**
   * Turn a routine into ghost rows: the exercise order, and per exercise the
   * row count and rep targets.
   *
   * Warm-up rows in a routine are dropped — a ghost is always a working set,
   * and a warm-up you have not done yet is a suggestion the ramp already makes
   * better in the focused view.
   */
  const applyRoutinePlan = useCallback((detail: RoutineDetail | null) => {
    const exercises = detail?.exercises ?? []
    setPlanned(exercises.map((e) => e.exercise_id))
    setPlan(
      new Map(
        exercises.map((e) => [
          e.exercise_id,
          e.sets
            .filter((s) => s.set_type !== 'warmup')
            .map<PlannedSet>((s) => ({ reps: s.reps, setType: s.set_type })),
        ]),
      ),
    )
  }, [])

  /**
   * A routine's exercises and set targets, from the network or from the last
   * time it was fetched.
   *
   * "Start my usual split" is what a routine is for, and the gym where you run
   * it is the gym with no signal. Every fetch caches the detail, so from the
   * second time onwards it opens in a basement. A routine never opened on this
   * device still cannot be started offline — there is nothing to fall back to
   * — and the error says so rather than pretending.
   */
  const routineDetail = useCallback(
    async (routineId: string): Promise<RoutineDetail | null> => {
      try {
        const detail = await loadRoutine(routineId)
        void putSnapshot(offlineStore, userId, `routine:${routineId}`, detail)
        return detail
      } catch (err) {
        const cached = await getSnapshot<RoutineDetail | null>(
          offlineStore,
          userId,
          `routine:${routineId}`,
        )
        if (cached) return cached.value
        throw err
      }
    },
    [offlineStore, userId],
  )

  /**
   * Restore the queue from both durable copies.
   *
   * Two of them exist on purpose — IndexedDB for volume and the localStorage
   * checkpoint for the synchronous last-gasp write — and merging them by id
   * costs nothing, because the id is the primary key and a write that reaches
   * the server twice is refused rather than doubled. See checkpoint.ts.
   *
   * Nothing is filtered out by which workout is open. A queue is "writes this
   * device has not delivered", full stop: a session finished in a dead zone
   * leaves a finish op behind with no open workout to belong to, and dropping
   * it because the board is empty would lose the workout. Whatever is already
   * in memory is kept and merged rather than replaced, so a load that happens
   * while the queue is live cannot swallow it.
   *
   * Returns the unsent sets belonging to `activeId`, so the caller can put
   * them back on screen: the user did those sets, and the only thing in doubt
   * is whether the network noticed.
   */
  const restoreQueue = useCallback(
    async (
      activeId: string | null,
      checkpointQueue: QueuedWrite[],
      knownSetIds: Set<string>,
    ) => {
      const durable = await getQueue(offlineStore, userId)
      let merged: QueuedWrite[] = []
      updateQueue((live) => {
        merged = mergeQueues(mergeQueues(live, durable), checkpointQueue)
        return merged
      })
      void drain()
      return merged.filter(
        (w): w is Extract<QueuedWrite, { kind: 'set' }> =>
          w.kind === 'set' && w.workoutId === activeId && !knownSetIds.has(w.id),
      )
    },
    [drain, offlineStore, updateQueue, userId],
  )

  /**
   * The gym dead zone — trust-ladder rung 4, and the read half of GATE 4.
   *
   * With no network there is nothing to fetch and the alternative to this is a
   * blank screen with an error on it, which for a person standing at a squat
   * rack is the app failing at the one moment it was built for. Everything
   * needed to log is on the device already: the catalogue, the board, the
   * previous-session ghosts. It is stamped as cached, never passed off as
   * live.
   *
   * Returns false when there is nothing cached — a first run with no signal
   * genuinely has nothing to show, and the honest answer is the error.
   */
  const restoreFromCache = useCallback(async () => {
    const [catalogue, board] = await Promise.all([
      getSnapshot<CatalogueSnapshot>(offlineStore, userId, 'catalogue'),
      getSnapshot<BoardSnapshot>(offlineStore, userId, 'board'),
    ])
    if (!catalogue) return false

    setExercises(catalogue.value.exercises)
    setUsage(new Map(catalogue.value.usage))
    setRestOverrides(new Map(catalogue.value.restOverrides))
    setExerciseNotes(new Map(catalogue.value.exerciseNotes))
    setRoutines(catalogue.value.routines)
    setHasHistory(catalogue.value.hasHistory)
    setLastSession(catalogue.value.lastSession)
    // Absent from snapshots written before the home feed existed.
    setWeekRows(catalogue.value.weekRows ?? [])

    const active = board?.value.workout ?? null
    setWorkout(active)
    setSets(board?.value.sets ?? [])
    setPlanned(board?.value.planned ?? [])
    setPlan(new Map(board?.value.plan ?? []))
    setPreviousByExercise(new Map(board?.value.previous ?? []))
    // Every ghost this board can draw is already answered, so the effect that
    // fetches them must not fire into a dead radio for each block.
    for (const [exerciseId] of board?.value.previous ?? []) {
      if (active) previousRequested.current.add(`${active.id}:${exerciseId}`)
    }

    if (active) {
      const checkpoint = loadCheckpoint(browserStorage())
      const usable = isUsable(checkpoint, active.id, Date.now())
      setOrder(usable ? checkpoint.order : (board?.value.order ?? []))
      setExtraRows(new Map(usable ? checkpoint.extraRows : []))
      setRemoved(new Set(usable ? checkpoint.removed : []))
      const known = new Set((board?.value.sets ?? []).map((s) => s.id))
      const unsent = await restoreQueue(
        active.id,
        usable ? checkpoint.queue : [],
        known,
      )
      if (unsent.length > 0) setSets((prev) => [...prev, ...unsent.map(asSetRow)])
    } else {
      setOrder([])
      setRemoved(new Set())
      setExtraRows(new Map())
      // NOT cleared. A workout finished in a dead zone leaves its finish op
      // behind with no open workout to belong to, and throwing the queue away
      // because the board is empty would throw the session away with it.
      await restoreQueue(null, [], new Set())
    }

    setCachedAt(catalogue.savedAt)
    setError(null)
    restoredRef.current = true
    setLoading(false)
    return true
  }, [offlineStore, restoreQueue, userId])

  // No synchronous setState here: the effect below calls it on mount, where a
  // state update before the first await would cause a cascading render.
  const load = useCallback(async () => {
    /**
     * No radio, no requests. Seven fetches into a dead antenna cost a
     * six-second deadline before the fallback below can run, and the fallback
     * is the answer either way — the device's copy is exactly what those
     * requests would have been raced against.
     *
     * Falls through when there is nothing cached: a first run with no signal
     * genuinely has nothing to show, and the honest outcome is the attempt and
     * then the error.
     */
    if (!isOnline() && (await restoreFromCache())) return

    /**
     * Bounded, because an unbounded read is how the Log tab gets stuck.
     *
     * A dead radio rejects and the offline path below takes over. A network
     * that accepts and then goes quiet — a captive portal, or a service worker
     * holding a request open — never rejects at all, so `Promise.all` never
     * settles and the screen shows "Loading…" forever with a full cache on the
     * device it is not looking at. The screenshot harness photographed exactly
     * that. Past the deadline, the device's own copy is the answer.
     */
    const answered = await withDeadline(
      Promise.all([
        supabase.from('exercises').select('*').order('name'),
        supabase.rpc('exercise_usage'),
        supabase
          .from('workouts')
          .select('*')
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1),
        supabase.from('workouts').select('id').limit(1),
        // Streak is a Monday-based week in the caller's zone; the server cannot
        // know where the user is, so the browser tells it.
        supabase.rpc('weekly_streak', {
          p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        supabase.from('exercise_rest').select('exercise_id, rest_seconds'),
        // Per-lift notes have existed since migration 0008 and have been read
        // by nothing outside the exercise detail page. The block's meta line is
        // where "seat position 4" was always meant to be.
        supabase.from('exercise_notes').select('exercise_id, note'),
      ]),
    )

    if (!answered) {
      if (await restoreFromCache()) return
      setError(
        describeError(
          tRef.current('log.error.load_workout'),
          new Error('the server did not answer'),
        ),
      )
      // Read the durable queue off the device BEFORE declaring the load path
      // finished. The ref gates the effect that persists `queue`, and on this
      // path `restoreFromCache` returned false — so nothing has merged the
      // stored queue into memory yet, and flipping the ref first would write
      // an EMPTY queue straight over somebody's unsent sets. That is a worse
      // bug than the one this line exists to fix.
      await restoreQueue(null, [], new Set())
      // Now the ref, which means "the load path has finished reading the
      // device" — not that it succeeded. Left false, the effects it gates
      // never run again for the life of the screen and a set logged after a
      // failed load would not survive the tab dying. A failed read is exactly
      // when durability matters most.
      restoredRef.current = true
      setLoading(false)
      return
    }
    const [catalogue, usageRows, open, anyWorkout, streakRows, restRows, noteRows] =
      answered

    const failure = catalogue.error ?? usageRows.error ?? open.error ?? anyWorkout.error
    if (failure) {
      // No network is not a load error — it is the state the whole of U3b
      // exists for. Fall back to what the device already knows, and only say
      // something went wrong if there is genuinely nothing to fall back to.
      if (classifyFailure(failure) === 'offline' && (await restoreFromCache())) return
      setError(describeError(tRef.current('log.error.load_workout'), failure))
      // Same as the deadline path above, in the same order: merge the durable
      // queue in first, then declare the read over.
      await restoreQueue(null, [], new Set())
      restoredRef.current = true
      setLoading(false)
      return
    }
    setCachedAt(null)

    // A failed streak must not block the screen — it is decoration, not data.
    setStreak(((streakRows.data ?? []) as WeeklyStreakRow[])[0] ?? null)
    // Same posture for the rest overrides: migration 0015 may not be applied
    // yet, and a missing table must fall the timer back to its default rather
    // than stop the workout loading.
    const restEntries = (
      (restRows.data ?? []) as { exercise_id: string; rest_seconds: number }[]
    ).map<[string, number]>((row) => [row.exercise_id, row.rest_seconds])
    setRestOverrides(new Map(restEntries))
    const noteEntries = (
      (noteRows.data ?? []) as { exercise_id: string; note: string }[]
    ).map<[string, string]>((row) => [row.exercise_id, row.note])
    setExerciseNotes(new Map(noteEntries))
    // Routines are only needed on the idle screen; a failure there must not
    // stop an in-progress workout from loading.
    const routineList = await listRoutines().catch<RoutineWithRun[]>(() => [])
    setRoutines(routineList)
    const catalogueRows = (catalogue.data ?? []) as Exercise[]
    setExercises(catalogueRows)
    const usageEntries = ((usageRows.data ?? []) as ExerciseUsageRow[]).map<
      [string, ExerciseUsageRow]
    >((row) => [row.exercise_id, row])
    setUsage(new Map(usageEntries))
    const anyHistory = (anyWorkout.data ?? []).length > 0
    setHasHistory(anyHistory)

    const active = (open.data ?? [])[0] as Workout | undefined
    setWorkout(active ?? null)

    let restoredSets: WorkoutSet[] = []
    let lastFinished: LastSession | null = null
    let weekHistory: SessionVolumeRow[] = []
    let prHistory: RecordSetRow[] = []

    if (active) {
      const { data, error: setsError } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('workout_id', active.id)
        .order('set_number')
      if (setsError) {
        setError(describeError(tRef.current('log.error.load_sets'), setsError))
      } else {
        restoredSets = (data ?? []) as WorkoutSet[]
        setSets(restoredSets)
      }

      // The arrangement, restored. Absent when 0020 is not applied, in which
      // case the order is derived from the sets — exactly the pre-v2.2 order.
      const stored = Array.isArray(active.exercise_order)
        ? active.exercise_order.filter(Boolean)
        : []

      /**
       * The checkpoint — trust-ladder rung 1. Restored only when it belongs to
       * the workout the server just handed us and has not aged out; a
       * checkpoint for another workout is not wrong, it is finished.
       *
       * This is what makes killing the tab mid-workout survivable. Committed
       * sets were always safe because Postgres had them; what was not safe was
       * a set whose insert had not come back yet, and — when 0020 is unapplied
       * — the board's whole arrangement.
       */
      const checkpoint = loadCheckpoint(browserStorage())
      const usable = isUsable(checkpoint, active.id, Date.now())
      if (usable) {
        setOrder(stored.length > 0 ? stored : checkpoint.order)
        setExtraRows(new Map(checkpoint.extraRows))
        setRemoved(new Set(checkpoint.removed))
      } else {
        setOrder(stored)
        setRemoved(new Set())
        setExtraRows(new Map())
      }

      // Sets that were on screen and never acknowledged. They go back on
      // screen as they were — the user did them — and back in the queue. The
      // client-generated id makes the retry idempotent even if one of them
      // actually landed before the tab died.
      const unsent = await restoreQueue(
        active.id,
        usable ? checkpoint.queue : [],
        new Set(restoredSets.map((row) => row.id)),
      )
      if (unsent.length > 0) {
        restoredSets = [...restoredSets, ...unsent.map(asSetRow)]
        setSets(restoredSets)
      }

      // Reopening mid-session has to remember what the routine planned, or the
      // ghosts vanish on the first reload and the board loses half its rows.
      if (active.routine_id) {
        try {
          const detail = await routineDetail(active.routine_id)
          applyRoutinePlan(detail)
        } catch {
          setPlanned([])
          setPlan(new Map())
        }
      } else {
        setPlanned([])
        setPlan(new Map())
      }
    } else {
      setSets([])
      setOrder([])
      setPlanned([])
      setPlan(new Map())
      setRemoved(new Set())
      setExtraRows(new Map())
      // Same reasoning as the offline path: undelivered writes outlive the
      // workout they belong to, so the queue is restored here, never cleared.
      await restoreQueue(null, [], new Set())
      // Idle screen only. A failure here must not block the screen — like the
      // streak, it is context, not data you cannot log without.
      try {
        /**
         * The home feed, in one round trip rather than three.
         *
         * The recent-session card costs nothing extra: the sets fetched below
         * already carry weight, reps and the PR flags, so its volume and its
         * PR pill are arithmetic rather than another query. Only the week row
         * and the last PR need the server, and the last PR needs it because a
         * record set three sessions ago is not in the last session's sets.
         *
         * All of it is behind the `else` — no workout open. Mid-session none
         * of these cards is on screen and none of these queries runs.
         */
        const [recent, volume, records] = await Promise.all([
          supabase
            .from('workouts')
            .select('id, name, started_at, ended_at')
            .not('ended_at', 'is', null)
            .order('started_at', { ascending: false })
            .limit(1),
          supabase.rpc('session_volume_history'),
          // The referenced-table order genuinely orders the parent rows here
          // because the select uses `!inner`. The limit is a ceiling, not the
          // list length: `recentRecords` sorts and slices after this.
          supabase
            .from('workout_sets')
            .select(
              'exercise_id, weight_kg, reps, pr_weight, pr_e1rm, workouts!inner(started_at)',
            )
            .or('pr_weight.eq.true,pr_e1rm.eq.true')
            .order('started_at', { referencedTable: 'workouts', ascending: false })
            .limit(20),
        ])
        weekHistory = (volume.data ?? []) as SessionVolumeRow[]
        prHistory = ((records.data ?? []) as unknown[]).map((raw) => {
          const row = raw as RecordSetRow & { workouts?: { started_at: string } | null }
          return { ...row, started_at: row.workouts?.started_at ?? '' }
        })
        const last = (recent.data ?? [])[0] as
          | {
              id: string
              name: string | null
              started_at: string
              ended_at: string | null
            }
          | undefined
        if (last) {
          const { data: lastSets } = await supabase
            .from('workout_sets')
            .select('*')
            .eq('workout_id', last.id)
            .order('set_number')
          lastFinished = {
            startedAt: last.started_at,
            name: last.name,
            endedAt: last.ended_at,
            sets: (lastSets ?? []) as WorkoutSet[],
          }
        }
      } catch {
        lastFinished = null
      }
      setLastSession(lastFinished)
      setWeekRows(weekHistory)
      setRecordRows(prHistory)
    }

    /**
     * The device's copy of everything the screen just fetched.
     *
     * Written from the values rather than from state, because state is not
     * readable here yet — and written on every successful load, so the cache
     * a dead zone falls back to is never older than the last time there was
     * signal.
     */
    void putSnapshot(offlineStore, userId, 'catalogue', {
      exercises: catalogueRows,
      usage: usageEntries,
      restOverrides: restEntries,
      exerciseNotes: noteEntries,
      routines: routineList,
      hasHistory: anyHistory,
      lastSession: lastFinished,
      weekRows: weekHistory,
    } satisfies CatalogueSnapshot)

    restoredRef.current = true
    setLoading(false)
  }, [
    applyRoutinePlan,
    offlineStore,
    restoreFromCache,
    restoreQueue,
    routineDetail,
    userId,
  ])

  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  /**
   * Which exercises are on today's board, in the order they are drawn.
   *
   * Three sources, all of them honest about what they mean: `order` is what the
   * user arranged (and the only record of a block with no sets in it), the sets
   * are what has actually happened, and `planned` is what the routine asked
   * for. `removed` wins over all of them, so taking a lift off the board does
   * not have the routine put it straight back.
   *
   * Superset members are pulled adjacent last, because the rail is one line
   * spanning a group and a split group cannot be drawn at all.
   */
  const displayOrder = useMemo(() => {
    const members: string[] = []
    const add = (id: string) => {
      if (!removed.has(id) && !members.includes(id)) members.push(id)
    }
    for (const id of order) add(id)
    for (const set of sets) add(set.exercise_id)
    for (const id of planned) add(id)
    return groupAdjacent(mergeOrder(order, members), (id) => groupOf(sets, id))
  }, [order, sets, planned, removed])

  /**
   * Last session for every block on the board, not only the one being logged.
   *
   * One RPC per block, issued in parallel and once each — a block list is four
   * to eight lifts, so this is one round trip of wall time, and the answers are
   * cached for the rest of the workout. An error stores an empty list rather
   * than an error banner: a missing previous ghost costs a comparison, and §2.1
   * does not allow the logging flow to be interrupted over one.
   */
  useEffect(() => {
    if (!workout) return
    // With no radio there is nothing to ask. The ghosts this board already has
    // came out of the cache and must not be replaced with the empty answer a
    // dead request produces — losing them costs every comparison on the board,
    // which is most of the reason to look at it.
    if (!online) return
    const workoutId = workout.id
    for (const exerciseId of displayOrder) {
      const key = `${workoutId}:${exerciseId}`
      if (previousRequested.current.has(key)) continue
      previousRequested.current.add(key)
      void supabase
        .rpc('previous_session', {
          p_exercise_id: exerciseId,
          p_exclude_workout: workoutId,
        })
        .then(({ data, error: rpcError }) => {
          // A request that died on the way out is not an answer of "no
          // previous session", so it is allowed to be asked again.
          if (rpcError && classifyFailure(rpcError) === 'offline') {
            previousRequested.current.delete(key)
            return
          }
          setPreviousByExercise((prev) =>
            new Map(prev).set(
              exerciseId,
              rpcError ? [] : ((data ?? []) as PreviousSessionRow[]),
            ),
          )
        })
    }
  }, [workout, displayOrder, online])

  /**
   * Start a workout from a routine: create it, then seed the exercise order.
   * Sets are NOT pre-inserted — a routine says what to do, and a set row means
   * it was done. Pre-inserting would put lifts in History that never happened
   * if the session is cut short.
   */
  async function startFromRoutine(routine: Routine) {
    setRoutineBusy(routine.id)
    setError(null)
    try {
      const detail = await routineDetail(routine.id)
      openWorkout(routine)
      applyRoutinePlan(detail)
      setOrder(detail?.exercises.map((e) => e.exercise_id) ?? [])

      // The overview, not the first exercise. The whole session is on the board
      // with its planned rows already drawn, and the first set is one tap from
      // here — where before this you landed inside one exercise and had to
      // guess at the rest of the plan. Design v2.2: the overview is the spine.
      setView(detail && detail.exercises.length > 0 ? 'overview' : 'picker')
    } catch (err) {
      setError(describeError(t('log.error.start_routine'), err))
    } finally {
      setRoutineBusy(null)
    }
  }

  /**
   * Group the current exercise, then pick a partner. Existing sets for this
   * exercise are stamped too, so the group covers the whole workout rather
   * than only what comes next — otherwise History would show half a superset.
   */
  async function beginSuperset() {
    if (!workout || !current) return
    const existing = groupOf(sets, current.id)
    const group = existing ?? nextGroupId(sets)

    if (existing === null) {
      const ids = sets.filter((s) => s.exercise_id === current.id).map((s) => s.id)
      if (ids.length > 0) {
        const { error: updateError } = await supabase
          .from('workout_sets')
          .update({ superset_group: group })
          .in('id', ids)
        if (updateError) {
          setError(describeError(t('log.error.group_superset'), updateError))
          return
        }
        setSets((prev) =>
          prev.map((s) => (ids.includes(s.id) ? { ...s, superset_group: group } : s)),
        )
      }
    }

    setPendingGroup(group)
    setView('picker')
  }

  /**
   * Remember a rest length for one lift, for this user only.
   *
   * `exercises.default_rest_seconds` is not writable here and should not be:
   * `exercises` is a shared catalogue and one person's ninety seconds is not
   * everyone's. Migration 0015 gives the preference its own user-scoped row,
   * the same split `exercise_notes` uses. See DECISIONS.md.
   */
  async function saveRestDefault(exerciseId: string, seconds: number) {
    // Optimistic: the value is already on screen in the timer the user just
    // adjusted, and a spinner on a preference is worse than a silent retry.
    setRestOverrides((prev) => new Map(prev).set(exerciseId, seconds))
    const { error: writeError } = await supabase.from('exercise_rest').upsert(
      {
        user_id: userId,
        exercise_id: exerciseId,
        rest_seconds: seconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,exercise_id' },
    )
    // Quiet when there is no network: the value is on screen, it is in the
    // checkpoint, and an error banner between sets is what §2.1 forbids.
    if (writeError && classifyFailure(writeError) !== 'offline') {
      setError(describeError(t('log.error.save_rest'), writeError))
    }
  }

  /** Write today's session back over the routine it came from. One tap, opt-in. */
  async function applyRoutineUpdate() {
    if (!routineUpdate) return
    setSaving(true)
    setError(null)
    try {
      await saveRoutine(userId, routineUpdate.draft, routineUpdate.routineId)
      setRoutines(await listRoutines())
      setRoutineUpdate(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('log.error.update_routine'))
    } finally {
      setSaving(false)
    }
  }

  async function persistRoutine(draft: RoutineDraft) {
    setSaving(true)
    setError(null)
    try {
      await saveRoutine(userId, draft, editing?.id)
      setRoutines(await listRoutines())
      setEditing(null)
      setView('overview')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('log.error.save_routine'))
    } finally {
      setSaving(false)
    }
  }

  async function onEditRoutine(routine: Routine) {
    setError(null)
    try {
      setEditing(await loadRoutine(routine.id))
      setView('routine')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('log.error.open_routine'))
    }
  }

  async function onDuplicateRoutine(routine: Routine) {
    setRoutineBusy(routine.id)
    try {
      await duplicateRoutine(userId, routine.id)
      setRoutines(await listRoutines())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('log.error.duplicate_routine'))
    } finally {
      setRoutineBusy(null)
    }
  }

  async function onDeleteRoutine(routine: Routine) {
    setRoutineBusy(routine.id)
    try {
      await deleteRoutine(routine.id)
      setRoutines(await listRoutines())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('log.error.delete_routine'))
    } finally {
      setRoutineBusy(null)
    }
  }

  /**
   * Open a workout, without waiting for anyone's permission.
   *
   * OPTIMISTIC since U3b, and for the same reason the sets are: a workout that
   * cannot be started with no signal is a workout that cannot be logged with
   * no signal, and GATE 4 says "a full airplane-mode workout". The id is
   * generated here and IS the primary key, so the insert queued behind it can
   * be replayed without creating a second session, and every set that follows
   * already knows what it belongs to.
   *
   * `routine` seeds the name and the plan; absent, this is freestyle.
   */
  function openWorkout(routine: { id: string; name: string } | null): Workout {
    const startedAt = new Date().toISOString()
    const local: Workout = {
      id: newId(),
      user_id: userId,
      started_at: startedAt,
      ended_at: null,
      name: routine?.name ?? null,
      notes: null,
      routine_id: routine?.id ?? null,
      exercise_order: null,
    }
    setWorkout(local)
    setSets([])
    setHasHistory(true)
    setRemoved(new Set())
    setExtraRows(new Map())
    updateQueue((q) =>
      enqueue(q, {
        kind: 'workout-start',
        id: local.id,
        workoutId: local.id,
        userId,
        startedAt,
        name: local.name,
        routineId: local.routine_id ?? null,
        attempts: 0,
      }),
    )
    void drain()
    return local
  }

  function startWorkout() {
    setError(null)
    openWorkout(null)
    setPlanned([])
    setPlan(new Map())
    setOrder([])
    setView('picker')
  }

  /**
   * Persist the block order (migration 0020).
   *
   * Optimistic, and deliberately quiet on failure. An unapplied 0020 is a
   * refused PATCH, and the honest response to that mid-workout is to keep the
   * order for the session and stop asking — not to put an error banner over a
   * board somebody is lifting from. The screen then behaves exactly as it did
   * before v2.2: order derived from the sets.
   */
  async function persistOrder(next: string[]) {
    // Deduped on the way in. `addToBoard` reads `order` from its closure, so
    // two sets committed for a new exercise in quick succession can both see it
    // absent and both append it. `mergeOrder` tolerates that on read; the
    // column should not have to.
    const deduped = [...new Set(next)]
    setOrder(deduped)
    if (!workout || orderUnavailable.current) return
    const { error: writeError } = await supabase
      .from('workouts')
      .update({ exercise_order: deduped })
      .eq('id', workout.id)
    // Only a refusal means the column is not there. A write that never left
    // the device says nothing about the schema, and treating it as proof would
    // stop the app from ever trying again after one dead zone.
    if (writeError && classifyFailure(writeError) !== 'offline') {
      orderUnavailable.current = true
    }
  }

  /** Put an exercise on the board, keeping whatever order is already there. */
  function addToBoard(exerciseId: string) {
    setRemoved((prev) => {
      if (!prev.has(exerciseId)) return prev
      const next = new Set(prev)
      next.delete(exerciseId)
      return next
    })
    if (order.includes(exerciseId)) return
    void persistOrder([...order, exerciseId])
  }

  /**
   * Take a block off the board. Sets it has go with it — that is the whole
   * meaning of removing an exercise from a workout, and it is why the control
   * is armed and lives two taps from anything that logs.
   */
  async function removeFromBoard(exerciseId: string) {
    const ids = sets.filter((s) => s.exercise_id === exerciseId).map((s) => s.id)
    if (ids.length > 0) {
      const { error: deleteError } = await supabase
        .from('workout_sets')
        .delete()
        .in('id', ids)
      if (deleteError) {
        setError(describeError(t('log.error.remove_exercise'), deleteError))
        return
      }
      setSets((prev) => prev.filter((s) => !ids.includes(s.id)))
    }
    setRemoved((prev) => new Set(prev).add(exerciseId))
    if (current?.id === exerciseId) setCurrent(null)
    void persistOrder(order.filter((id) => id !== exerciseId))
  }

  /**
   * Write a per-lift note (migration 0008). An empty note is a deleted note —
   * the table's own constraint says so, so blanking it removes the row rather
   * than storing an empty string the block would render as a stray separator.
   */
  async function saveExerciseNote(exerciseId: string, note: string) {
    const trimmed = note.trim()
    setExerciseNotes((prev) => {
      const next = new Map(prev)
      if (trimmed === '') next.delete(exerciseId)
      else next.set(exerciseId, trimmed)
      return next
    })
    const { error: writeError } =
      trimmed === ''
        ? await supabase
            .from('exercise_notes')
            .delete()
            .eq('user_id', userId)
            .eq('exercise_id', exerciseId)
        : await supabase.from('exercise_notes').upsert(
            {
              user_id: userId,
              exercise_id: exerciseId,
              note: trimmed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,exercise_id' },
          )
    if (writeError && classifyFailure(writeError) !== 'offline') {
      setError(describeError(t('log.error.save_note'), writeError))
    }
  }

  /**
   * Throw the open workout away. Sets go with it — `workout_sets.workout_id`
   * cascades — which is the point: this is the exit for a session that should
   * never have been started, and for one that was abandoned mid-way.
   */
  async function discardWorkout() {
    if (!workout) return
    const discarded = workout.id
    setConfirmDiscard(false)
    setConfirmFinish(false)
    setError(null)
    /**
     * Every write for this workout goes first, and the delete goes on the end
     * — a queued insert against a workout that no longer exists fails on the
     * foreign key forever and would surface as an error about a session the
     * user deliberately threw away.
     *
     * A workout whose own insert had not drained yet needs no delete at all:
     * it has never existed anywhere but this device, which is exactly the case
     * for a session started and abandoned in a dead zone. `discardWrites`
     * decides, and it is tested.
     */
    updateQueue((q) => discardWrites(q, discarded).queue)
    void drain()

    // Before clearing state, so the unmount guard cannot chase a row that is
    // already gone.
    emptyWorkoutId.current = null
    clearBoardSnapshot()
    timer.stop()
    setWorkout(null)
    setSets([])
    setCurrent(null)
    setPlanned([])
    setPlan(new Map())
    setOrder([])
    setRemoved(new Set())
    setExtraRows(new Map())
    setPendingGroup(null)
    setFocusKey(null)
    setEditingKey(null)
    setView('overview')
    void load()
  }

  /**
   * Take this exercise out of its superset. If that leaves one exercise alone
   * in the group, the group dissolves — a superset of one is not a superset,
   * and a lone "SS 1" badge names a partner that no longer exists.
   */
  async function ungroupExercise(exerciseId: string) {
    if (!workout) return
    setPendingGroup(null)
    const ids = ungroupIds(sets, exerciseId)
    if (ids.length === 0) return

    const { error: updateError } = await supabase
      .from('workout_sets')
      .update({ superset_group: null })
      .in('id', ids)
    if (updateError) {
      setError(describeError(t('log.error.leave_superset'), updateError))
      return
    }
    setSets((prev) =>
      prev.map((s) => (ids.includes(s.id) ? { ...s, superset_group: null } : s)),
    )
  }

  /**
   * Today's work as a routine draft, or null when it already matches the one
   * the workout was started from.
   *
   * Only exercises with something logged go in. A block you skipped is not a
   * change of plan — it is a day you did not get to it, and writing that into
   * the template would delete the lift from every future session.
   */
  function routineDiff(active: Workout) {
    const routineId = active.routine_id
    if (!routineId) return null
    const name = routines.find((r) => r.id === routineId)?.name ?? active.name
    if (!name) return null

    const done = displayOrder.filter((id) =>
      sets.some((s) => s.exercise_id === id && s.set_type !== 'warmup'),
    )
    if (done.length === 0) return null

    const draft: RoutineDraft = {
      name,
      exercises: done.map((exerciseId) => ({
        exerciseId,
        sets: sets
          .filter((s) => s.exercise_id === exerciseId && s.set_type !== 'warmup')
          .map((s) => ({ reps: s.reps, setType: s.set_type })),
      })),
    }

    const shape = (rows: { reps: number | null }[]) =>
      rows.map((r) => r.reps ?? '?').join(',')
    const unchanged =
      done.length === planned.length &&
      done.every((id, i) => planned[i] === id) &&
      done.every(
        (id, i) => shape(plan.get(id) ?? []) === shape(draft.exercises[i].sets),
      )
    return unchanged ? null : { routineId, name, draft }
  }

  async function finishWorkout() {
    if (!workout) return
    // Finishing a workout with nothing in it is the commonest way a blank row
    // reaches History. There is no session to save, so it is discarded rather
    // than written — and no summary screen is shown for a workout that never
    // happened.
    if (sets.length === 0) {
      await discardWorkout()
      return
    }
    setConfirmFinish(false)
    setSaving(true)
    setError(null)

    // Land every optimistic set before summarising. The summary and
    // `exercise_bests` are computed against what the server has, so finishing
    // with writes in flight would report a workout smaller than the one just
    // performed — and mark it ended, putting those sets beyond reach.
    //
    // A wait is allowed here and nowhere else: §2.1 protects the logging flow,
    // and this is the end of it rather than the middle.
    const flushed = await flushQueue()
    const endedAt = new Date().toISOString()
    /**
     * Ending a workout with no signal is a supported ending, not a failure.
     *
     * Everything the summary needs about the session itself — duration,
     * volume, sets, exercises — is already on this device, because `sets` is
     * what the user just did. Only two things need the server, and both wait:
     * `ended_at` becomes a queued op, and records are left uncounted rather
     * than guessed at (see below).
     */
    const deferred = !isOnline() || !flushed
    if (deferred && !isOnline()) {
      updateQueue((q) =>
        enqueue(q, {
          kind: 'workout-finish',
          id: finishOpId(workout.id),
          workoutId: workout.id,
          endedAt,
          attempts: 0,
        }),
      )
    } else if (!flushed) {
      // Online, and writes are genuinely stuck rather than merely unsent.
      // Marking the workout ended now would put those sets beyond reach.
      setSaving(false)
      setError(
        queueRef.current.length === 1
          ? t('log.finish_still_saving.set', {
              count: String(queueRef.current.length),
            })
          : t('log.finish_still_saving.sets', {
              count: String(queueRef.current.length),
            }),
      )
      return
    }

    if (!deferred) {
      const { error: updateError } = await supabase
        .from('workouts')
        .update({ ended_at: endedAt })
        .eq('id', workout.id)

      if (updateError) {
        setSaving(false)
        setError(describeError(t('log.error.finish'), updateError))
        return
      }
    }

    /**
     * Bests EXCLUDING this workout, or every set of a new exercise reports a
     * PR against itself. One call for the whole workout, after the write, so a
     * slow summary never delays marking the workout finished.
     *
     * With no network there are no bests to compare against, and an empty map
     * does not mean "no previous best" — it means "not asked". Reporting PRs
     * from it would celebrate a record on every single exercise. So an offline
     * summary shows none, and says why. The flags themselves are computed in
     * the database on insert, so the records are still right in History and
     * Progress the moment the queue drains.
     */
    const previousBests = new Map<string, { weightKg: number; e1rmKg: number }>()
    if (!deferred) {
      const { data: bestRows } = await supabase.rpc('exercise_bests', {
        p_exclude_workout: workout.id,
      })
      for (const r of (bestRows ?? []) as ExerciseBestRow[]) {
        previousBests.set(r.exercise_id, {
          weightKg: Number(r.best_weight_kg),
          e1rmKg: Number(r.best_e1rm_kg),
        })
      }
    }

    const computed = summarise(
      sets,
      workout.started_at,
      endedAt,
      exercisesById,
      previousBests,
    )
    setSummary(deferred ? { ...computed, prs: [] } : computed)
    // Snapshot before the clears below reach `sets` and `displayOrder`.
    setSummarySets(sets)
    setSummaryOrder(displayOrder)
    setSummaryDate(formatWorkoutDate(workout.started_at))
    // Which session this was. Counted rather than stored — no column carries
    // it — and never awaited: the finish screen's one job is to be instant,
    // and the ordinal is a kicker. Offline it never arrives, and the kicker
    // is the date alone, which is what it has always been.
    setSummaryOrdinal(null)
    if (!deferred) {
      void supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        // Scoped explicitly, NOT left to RLS. `workouts_select_visible`
        // (0011_social.sql) also admits other lifters' finished workouts when
        // their profile is public or followed, so an unscoped count would
        // number this session against the whole visible feed.
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .lte('started_at', workout.started_at)
        .then(({ count }) => {
          if (typeof count === 'number' && count > 0) setSummaryOrdinal(count)
        })
    }
    setSummaryWorkout({ ...workout, ended_at: endedAt })
    // Mid-workout there is no such thing as a skipped exercise — there is only
    // not-yet-done, and saying otherwise is the app scolding somebody who is
    // still lifting. Finish is the end of the flow rather than the middle of
    // it, so this is the one moment where "skipped" is allowed to exist.
    setSkipped(
      displayOrder
        .filter((id) => !sets.some((s) => s.exercise_id === id))
        .map((id) => exercisesById.get(id)?.name ?? t('log.exercise_fallback')),
    )
    setRoutineUpdate(routineDiff(workout))
    setSaving(false)
    // The session is over, so the cached board must stop describing it — or a
    // reopen with no signal would restore the workout that was just finished.
    clearBoardSnapshot()
    emptyWorkoutId.current = null
    timer.stop()
    setWorkout(null)
    setSets([])
    setCurrent(null)
    setPlanned([])
    setPlan(new Map())
    setOrder([])
    setRemoved(new Set())
    setExtraRows(new Map())
    setFocusKey(null)
    setEditingKey(null)
    setView('summary')
    void load()
  }

  /**
   * The one write that means a set happened, and the only one there has ever
   * been. Both the focused view's "Log set" button and the overview's row check
   * come through here, so the protect-list behaviours below cannot diverge
   * between them.
   *
   * Returns the commit's consequences rather than a bare boolean, because the
   * overview needs to know where the next actionable row is — null means the
   * write failed and nothing happened.
   */
  async function addSet(
    {
      weightKg,
      reps,
      setType,
      rpe,
    }: {
      weightKg: number | null
      reps: number
      setType: SetType
      rpe: number | null
    },
    /** Defaults to the focused exercise; the overview names the block instead. */
    exercise: Exercise | null = current,
  ): Promise<CommitOutcome | null> {
    if (!workout || !exercise) return null

    const setNumber = sets.filter((s) => s.exercise_id === exercise.id).length + 1
    // Keep the exercise in whatever group it is already part of this workout.
    const supersetGroup = groupOf(sets, exercise.id) ?? pendingGroup

    /**
     * OPTIMISTIC, since U3a. The row goes on screen now; the insert follows it.
     *
     * This used to await Postgres before touching state, which is why U7
     * measured tap -> set on screen at 195ms against a 100ms budget: one round
     * trip is the floor, and the fix was never to make the round trip faster.
     * Design v2.2 anticipated this exactly — "a committed row that has not
     * reached the server yet renders committed. It happened — the user did it."
     *
     * The id is generated here and IS the primary key, so a replay after a
     * crash cannot insert the set twice, and the row never has to be remounted
     * under a different key.
     *
     * `pr_weight`/`pr_e1rm` stay false until the server answers. They are the
     * one thing an optimistic row genuinely cannot know — records are computed
     * in the database against every earlier set — so the badge arrives on
     * reconcile rather than being guessed at and then taken away.
     */
    const optimistic: WorkoutSet = {
      id: newId(),
      workout_id: workout.id,
      exercise_id: exercise.id,
      set_number: setNumber,
      weight_kg: weightKg,
      reps,
      rpe,
      duration_seconds: null,
      distance_meters: null,
      set_type: setType,
      superset_group: supersetGroup,
      pr_weight: false,
      pr_e1rm: false,
    }

    const nextSets = [...sets, optimistic]
    setSets(nextSets)
    setPendingGroup(null)
    addToBoard(exercise.id)

    updateQueue((q) =>
      enqueue(q, {
        kind: 'set',
        id: optimistic.id,
        workoutId: workout.id,
        exerciseId: exercise.id,
        setNumber,
        weightKg,
        reps,
        setType,
        rpe,
        supersetGroup,
        attempts: 0,
      }),
    )
    void drain()

    // Rest starts on a logged set, never on a tap. It no longer waits for the
    // server to agree: the set happened when the user pressed the check, and a
    // rest timer that starts a round trip late is a rest timer that is wrong by
    // a round trip. Everything else the commit implies — round-rest, alternation, warm-ups, "no timer on this
    // lift" — is decided by `commitOutcome`, which is tested.
    const outcome = commitOutcome({
      sets: nextSets,
      exerciseId: exercise.id,
      setType,
      supersetGroup,
      restSeconds: restFor(exercise),
    })
    if (outcome.advanceTo) {
      const target = exercisesById.get(outcome.advanceTo)
      if (target && view === 'entry') setCurrent(target)
    }
    if (outcome.restSeconds !== null) {
      timer.start(outcome.restSeconds)
      // The lift the canvas will talk about: the partner in a superset, this
      // exercise otherwise. Set alongside the timer rather than derived from
      // the board, because "whose rest is this" is a fact about the commit and
      // the board cannot recover it afterwards.
      setRestingExerciseId(outcome.advanceTo ?? exercise.id)
    }
    return outcome
  }

  /**
   * Commit a ghost row exactly as it reads. One tap, and the only thing that
   * turns client state into a database row.
   */
  async function commitGhost(exerciseId: string, row: OverviewRow) {
    const exercise = exercisesById.get(exerciseId)
    if (!exercise || row.reps === null) return
    const outcome = await addSet(
      { weightKg: row.weightKg, reps: row.reps, setType: row.setType, rpe: null },
      exercise,
    )
    if (!outcome) return

    // Put the next actionable ghost under the thumb that just committed. In a
    // superset that is the partner's next row, because a round alternates.
    const nextId = outcome.advanceTo ?? exerciseId
    const already = sets.filter(
      (s) => s.exercise_id === nextId && s.set_type !== 'warmup',
    ).length
    setFocusKey(`ghost:${nextId}:${nextId === exerciseId ? already + 1 : already}`)
  }

  // The dashed "Next up" card is gone, and nothing replaces it: it was a hint
  // standing in for the rest of the session, and the rest of the session is
  // now on screen. `planned` still feeds block membership.

  /**
   * The board: one block per exercise, committed rows then ghosts.
   *
   * Everything here is derived. No ghost is stored anywhere, and nothing in
   * this memo writes — pressing a check is the only thing that does.
   */
  const blocks = useMemo<OverviewBlock[]>(() => {
    const byExercise = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
      if (!byExercise.has(set.exercise_id)) byExercise.set(set.exercise_id, [])
      byExercise.get(set.exercise_id)!.push(set)
    }
    return displayOrder.map((exerciseId) => {
      const exercise = exercisesById.get(exerciseId)
      return {
        ...buildBlock({
          exerciseId,
          sets: byExercise.get(exerciseId) ?? [],
          previous: previousByExercise.get(exerciseId) ?? [],
          plan: plan.get(exerciseId),
          supersetGroup: groupOf(sets, exerciseId),
          extra: extraRows.get(exerciseId) ?? 0,
        }),
        exercise,
        note: exerciseNotes.get(exerciseId) ?? null,
        restSeconds: exercise ? restFor(exercise) : DEFAULT_REST_SECONDS,
      }
    })
  }, [
    displayOrder,
    sets,
    previousByExercise,
    plan,
    extraRows,
    exerciseNotes,
    exercisesById,
    restFor,
  ])

  /**
   * Move the focused view to another lift on the board.
   *
   * The three clears are not optional. `editingKey` and `focusKey` are ROW
   * keys scoped to the exercise being left, so carrying them across rings a
   * row on the wrong block when the overview comes back; `pendingGroup` is
   * the "a superset is starting from here" latch, and carrying it paints a
   * superset badge on a lift that is not in one.
   */
  function jumpToExercise(exerciseId: string) {
    const exercise = exercisesById.get(exerciseId)
    if (!exercise) return
    setCurrent(exercise)
    setEditingKey(null)
    setFocusKey(null)
    setPendingGroup(null)
    setView('entry')
  }

  /** Out of the focused view, back to the board. */
  function backToOverview() {
    setCurrent(null)
    setEditingKey(null)
    setView('overview')
  }

  /** The next lift after this one in board order, or null at the end. */
  function nextOnBoard(exerciseId: string): Exercise | null {
    const i = displayOrder.indexOf(exerciseId)
    if (i === -1 || i >= displayOrder.length - 1) return null
    return exercisesById.get(displayOrder[i + 1]) ?? null
  }

  /**
   * The crew's day, for the rest canvas's third card — §8-E1's "the crew's
   * activity today".
   *
   * Fetched on the FIRST REST of a workout and never on the load path. The Log
   * screen already issues seven requests before it can draw, and a garnish that
   * only ever renders during a rest has no business in front of the Start
   * button. Once per workout, online only, and silent about every failure: the
   * canvas simply falls through to a card about the session.
   */
  useEffect(() => {
    if (timer.remaining === null || crewRequested.current || !online) return
    crewRequested.current = true
    void (async () => {
      try {
        const rows = await fetchFeed()
        const today = new Date().toDateString()
        const mine = rows.filter(
          (r) => r.user_id !== userId && new Date(r.ended_at).toDateString() === today,
        )
        if (mine.length === 0) return
        const best = mine.reduce((a, b) => (b.volume_kg > a.volume_kg ? b : a))
        setCrew({
          lifters: new Set(mine.map((r) => r.user_id)).size,
          best: {
            name: nameOf(best),
            volumeKg: best.volume_kg,
            records: best.record_count,
          },
        })
      } catch {
        /* a card that does not exist is the honest version of this failing */
      }
    })()
  }, [timer.remaining, online, userId])

  /** Cleared with the workout, so the next session asks again. */
  useEffect(() => {
    if (workout) return
    crewRequested.current = false
    canvasViewed.current = false
  }, [workout])

  /**
   * The one fact the rest canvas shows, or null for the plain timer. Pure, and
   * derived from what the board already holds — see `src/lib/rest-canvas.ts`.
   */
  const resting = timer.remaining !== null
  const restCard = useMemo(
    () =>
      resting
        ? pickRestCard({ unit, restingExerciseId, blocks, sets, crew }, locale)
        : null,
    // `resting`, not `timer.remaining`: the countdown changes every second and
    // the card does not. Recomputing it 120 times a rest would hand the canvas
    // a new object each tick for no change in what it says.
    [resting, unit, locale, restingExerciseId, blocks, sets, crew],
  )

  /**
   * The three facts the recent-session card states, from sets already on the
   * device. No query: the last session's rows were fetched for this screen
   * anyway, and they carry weight, reps and the PR flags.
   *
   * `countsForRecords` is what makes the volume agree with the finish screen
   * and with `session_debrief` — warm-ups and sets missing weight or reps are
   * out, in all three.
   */
  const lastCounted = useMemo(
    () => (lastSession?.sets ?? []).filter(countsForRecords),
    [lastSession],
  )
  const lastVolumeKg = useMemo(() => totalVolumeKg(lastCounted), [lastCounted])
  const lastHadPr = useMemo(
    () => lastCounted.some((s) => s.pr_weight || s.pr_e1rm),
    [lastCounted],
  )

  const week = useMemo(() => thisWeek(weekRows), [weekRows])
  const lastRecord = useMemo(
    () => recentRecords(recordRows, (id) => exercisesById.get(id)?.name, 1)[0] ?? null,
    [recordRows, exercisesById],
  )

  if (loading) {
    return <p className="py-10 text-sm text-muted">{t('log.loading')}</p>
  }

  // Ahead of the empty state and the welcome screen, because both of them are
  // where it is reached from and neither should draw underneath it.
  if (view === 'import') {
    return (
      <Suspense
        fallback={<p className="py-10 text-sm text-muted">{t('log.loading')}</p>}
      >
        <HevyImport
          userId={userId}
          exercises={exercises}
          onImported={() => void load()}
          onCancel={() => setView('overview')}
        />
      </Suspense>
    )
  }

  // The summary lands here: finishing clears `workout`, so this has to come
  // before the empty state or the summary would never be shown.
  if (view === 'routine') {
    return (
      <div className="py-3">
        {error && <ErrorNote message={error} />}
        <RoutineEditor
          routine={editing}
          exercises={exercises}
          saving={saving}
          onSave={(draft) => void persistRoutine(draft)}
          onCancel={() => {
            setEditing(null)
            setView('overview')
          }}
        />
      </div>
    )
  }

  if (view === 'summary' && summary) {
    return (
      <div className="py-3">
        {/* The summary's own failures were invisible. `applyRoutineUpdate`
            sets an error like every other mutation here, but this branch
            rendered FinishSummary alone — so pressing "Update <routine>" and
            having it fail looked identical to it succeeding. The routine
            branch above has carried an ErrorNote all along. */}
        {error && <ErrorNote message={error} />}
        <FinishSummary
          summary={summary}
          unit={unit}
          dateLabel={summaryDate}
          exercisesById={exercisesById}
          workout={summaryWorkout}
          skipped={skipped}
          sets={summarySets}
          order={summaryOrder}
          ordinal={summaryOrdinal}
          routineUpdate={
            routineUpdate
              ? {
                  name: routineUpdate.name,
                  saving,
                  onUpdate: () => void applyRoutineUpdate(),
                }
              : undefined
          }
          onDone={() => {
            setSummary(null)
            setSummaryWorkout(null)
            setSummarySets([])
            setSummaryOrder([])
            setSummaryOrdinal(null)
            setSkipped([])
            setRoutineUpdate(null)
            setView('overview')
          }}
        />
      </div>
    )
  }

  // A brand-new account: no workouts, no routines, nothing to look at. Shown
  // once and only here, because this is the screen the app opens on.
  //
  // `!error` is load-bearing. When `load()` gives up it sets an error and
  // returns without touching `hasHistory` or `routines`, so they hold their
  // initial `false` and `[]` — indistinguishable from an empty account. A
  // lifter with years of history, on a cold device with a bad connection,
  // was told "let's build your first routine" and never shown what went
  // wrong. Worse, this screen offers the Hevy import, which is gated on an
  // empty account precisely because running an export twice duplicates every
  // workout in it — a failed read must not be what opens that door. Falling
  // through renders the empty branch below, which already draws ErrorNote.
  if (!error && !workout && !welcomed && !hasHistory && routines.length === 0) {
    return (
      <Welcome
        inviter={inviter}
        onGenerate={() => {
          dismissWelcome()
          onOpenCoach()
        }}
        onSkip={dismissWelcome}
        onImport={() => {
          dismissWelcome()
          setView('import')
        }}
      />
    )
  }

  // Empty state: one button, then context. Nothing here is a control you have
  // to read before you can start lifting.
  if (!workout) {
    // The lift the rotation is pointing at. `dueRoutine` returns null for a
    // single routine — calling the only door "due" is telling somebody the
    // only door is the door — but a single routine IS what is up next, so the
    // card takes it while the "due" label does not.
    const upNext = dueRoutine(routines) ?? (routines.length === 1 ? routines[0] : null)

    return (
      <div className="flex flex-col gap-[18px] pt-4">
        {error && <ErrorNote message={error} />}
        {/* U3b's trust notes come first, with the error line: "some sets have
            not reached the server" is about the data, and it outranks anything
            the coach has to say. */}
        {cachedAt !== null && <CachedNote savedAt={cachedAt} />}
        <SyncNote online={online} pending={pendingSetCount(queue)} />

        {/* The greeting. Two lines, as the design has it: what today is by
            the calendar, then what today is by the plan.

            The design's hero is "{Plan} day, {Name}." — this app has no name
            to put there. `profiles.display_name` has existed since migration
            0001 and nothing has ever written it; the only name the app
            collects is a username, and "Upper A, @ameen." is worse than no
            greeting at all. So the hero names the session and stops, which is
            the half of the sentence the app can actually stand behind. And it
            is the routine name alone rather than "{Plan} day" — routine names
            here are free text and most of them already end in "Day". */}
        <div>
          <p className="flex items-center gap-2 text-[13px] text-muted">
            {/* The streak plates stay: they are this app's own mark for the
                fact the design writes as "week 12", and they were already
                built. What goes is the separate streak paragraph under the
                Start button — it said the same thing twice.

                Every figure is isolated. Unisolated, the two counts ended up
                adjacent under Arabic — "6" and "0" printed side by side in a
                sentence that never put them together. */}
            {streak && streak.weeks > 0 && <StreakPlates weeks={streak.weeks} />}
            <span className="min-w-0 truncate">
              {streak && streak.weeks > 0 ? (
                <>
                  <span dir="ltr" className="tnum">
                    {streak.weeks}
                  </span>{' '}
                  {t('log.streak.week_streak')}
                  {streak.current_week_sessions > 0 && (
                    <>
                      {' · '}
                      <span dir="ltr" className="tnum">
                        {streak.current_week_sessions}
                      </span>{' '}
                      {t('log.streak.this_week')}
                    </>
                  )}
                </>
              ) : (
                formatShortDate(new Date().toISOString())
              )}
            </span>
          </p>
          {/* The hero names today. The design's is "{Plan} day, {Name}." and
              this app has neither half to put there: nothing has ever written
              `profiles.display_name`, and the plan's name is already the
              subject of the Up next card two rows down — using it here made
              the screen say "Core & Conditioning" twice in one glance. The
              weekday is what is left, and it is the honest half: it is the
              question the design's hero actually answers. */}
          <h1 className="font-display mt-2 text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em]">
            {formatWeekday(new Date(), locale)}.
          </h1>
        </div>

        {/* B1's pre-workout briefing. Mounted HERE and nowhere else, which is
            what enforces §4-A1's core-loop rule: this branch renders only
            when no workout is open, so the coach cannot appear mid-session
            without someone moving this line. It draws itself from SQL and
            returns null when it has nothing to say, so it costs no layout on
            a new account and never delays Start. */}
        {/* Above the coach, because an invite is time-sensitive in a way a
            briefing is not — somebody is waiting to be followed back. This is
            the surface the invite never used to reach. */}
        {inviter && <InviteCard inviter={inviter} />}

        <CoachBrief onOpen={onOpenCoach} />

        {upNext && (
          <UpNextCard
            routine={upNext}
            busy={routineBusy === upNext.id}
            onStart={() => void startFromRoutine(upNext)}
          />
        )}

        {/* The design's two-up row. Both halves are doors: the week goes to
            History, the record to Progress. With the tab bar gone that is how
            those screens are reached — content that is also navigation.

            Rendered in every state, including the account that has never
            trained. It was gated on `hasHistory` for one release, on the
            reasoning that a card with nothing in it is clutter — but a door
            that appears only once you have walked through it is not a door,
            and Progress had no other way in. An empty week row is not empty
            anyway: it shows today, which is the whole invitation. */}
        <div className="flex gap-3">
          <WeekCard days={week} onOpen={onOpenHistory} />
          <LastPrCard record={lastRecord} onOpen={onOpenProgress} />
        </div>

        {/* One line where a list of exercise rows used to be. The old recap
            was the same facts spread over four rows of thumbnails; the design
            asks the home for a glance, and the depth is one tap away in
            History rather than printed here. */}
        {lastSession && (
          <RecentSessionCard
            name={lastSession.name ?? null}
            startedAt={lastSession.startedAt}
            endedAt={lastSession.endedAt ?? null}
            volumeKg={lastVolumeKg}
            hasPr={lastHadPr}
            onOpen={onOpenHistory}
          />
        )}

        <RoutineList
          routines={routines}
          busyId={routineBusy}
          onStart={(r) => void startFromRoutine(r)}
          onEdit={(r) => void onEditRoutine(r)}
          onDuplicate={(r) => void onDuplicateRoutine(r)}
          onDelete={(r) => void onDeleteRoutine(r)}
          onNew={() => {
            setEditing(null)
            setView('routine')
          }}
          onGenerate={onOpenCoach}
        />

        {/* The switcher's way back to the import if they skipped it during
            onboarding.

            Only while there is no history, and that is a real limit rather
            than a layout choice: importing the same export twice would
            duplicate every workout in it, and nothing here de-duplicates.
            Gating on an empty account makes that impossible instead of
            merely unlikely. */}
        {!hasHistory && !error && (
          <button
            type="button"
            onClick={() => setView('import')}
            className="btn-base btn-secondary h-12 w-full text-sm"
          >
            {t('log.import')}
          </button>
        )}

        {/* Offered only once the app has proved useful — `hasHistory` means
            at least one workout exists — and never while one is open. */}
        <InstallPrompt earned={hasHistory} />

        {/* Start, fixed at the thumb — the design's own placement, and the
            reason the routines and the recap can sit below it without pushing
            the one button this screen exists for off the bottom of a scroll.
            Same sticky recipe and tab-bar clearance as the workout's commit
            cluster, so the two screens' hot controls live in one place. */}
        <div
          className="sticky z-10 -mx-[18px] mt-auto flex items-center gap-2.5 px-[18px] pt-4"
          style={{
            // Flush to the bottom edge, like the design's bar, so the fade
            // reaches the edge of the screen. Anchored anywhere above it, a
            // strip of the routines list shows underneath and reads as the
            // bar having come loose.
            bottom: 0,
            // The row owns the safe-area inset now that it sits at 0.
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 22px)',
            // No drift at the end of the scroll: the correction is `bottom`
            // minus the trailing space, and the only trailing space is main's
            // padding. The old value added 64px for a tab bar that is no
            // longer there.
            marginBottom: 'calc(-1 * max(env(safe-area-inset-bottom, 0px), 10px))',
            // The design's fade rather than a rule: the row floats over the
            // feed instead of cutting it off, and the last card stays half
            // visible under it as a hint that the list continues.
            background: 'linear-gradient(180deg, transparent, var(--color-ink) 45%)',
          }}
        >
          <button
            type="button"
            onClick={() => void startWorkout()}
            disabled={saving}
            className="btn-base btn-hero press flex h-[58px] flex-1 items-center justify-center gap-2.5 text-[16px] font-bold disabled:opacity-45"
            style={{
              borderRadius: 'var(--radius-pill)',
              boxShadow: 'var(--shadow-cta)',
            }}
          >
            <PlateRing size={20} className="shrink-0" />
            <span>{hasHistory ? t('log.start') : t('log.start_first')}</span>
          </button>
          {/* The one piece of navigation the design keeps as furniture. Every
              other screen is reached through something that says what it
              holds — a record, a week, a coach line — but "what did I do
              before" has no card of its own, and it is the question asked
              most often after "what am I doing now". */}
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label={t('nav.history')}
            className="press flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--flip-bg)', color: 'var(--flip-text)' }}
          >
            <IconHistory size={22} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      {error && <ErrorNote message={error} />}

      <div className="flex items-center gap-3">
        {/* Back is a chevron at the inline start of the workout's chrome —
            where forty years of phone interfaces put it, and where the design
            puts it. It used to sit inside the focused view on a row of its
            own, which cost a 48px band and read as floating; the chrome row
            already exists, and the escape belongs beside the workout it
            escapes to. */}
        {view === 'entry' && (
          <button
            type="button"
            onClick={backToOverview}
            aria-label={t('entry.back')}
            className="btn-base btn-quiet -ms-1 h-12 w-12 shrink-0"
          >
            <IconBack />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-medium">
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-accent"
            />
            <span className="truncate">
              {t('log.in_progress', {
                name: workout.name ?? t('log.workout_fallback'),
              })}
            </span>
          </p>
          <p className="tnum text-xs text-muted" dir="auto">
            {formatDuration(workout.started_at, new Date().toISOString())} ·{' '}
            {sets.length} {sets.length === 1 ? t('log.set') : t('log.sets')}
          </p>
          {/* Under the duration, not over the board: the state of the network
              is context, and the board is the thing being lifted from. */}
          {/* ONE line, deliberately. A board drawn from the device says it is
              offline and says how many sets are waiting; it does not also say
              when it last synced, because that is four lines of meta above the
              thing being lifted from and the exact timestamp is not a
              mid-set question. The idle screen, where you read rather than
              lift, carries it — see `CachedNote` below. */}
          <SyncNote
            online={online}
            pending={pendingSetCount(queue)}
            cached={cachedAt !== null}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmFinish) void finishWorkout()
            else setConfirmFinish(true)
          }}
          disabled={saving}
          className={`btn-base h-12 px-4 text-sm disabled:opacity-45 ${
            confirmFinish ? 'btn-primary' : 'btn-secondary'
          }`}
        >
          {confirmFinish ? t('log.finish_confirm') : t('log.finish')}
        </button>
      </div>

      {/* Discard lives behind the armed finish, on its own line: it is the
          destructive twin of the button next to it, and putting them shoulder
          to shoulder in the header is how a mis-tap deletes a session. */}
      {confirmFinish && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[11px] text-muted">
            {sets.length === 0 ? t('log.finish_hint_empty') : t('log.finish_hint')}
          </p>
          <button
            type="button"
            onClick={() => {
              if (confirmDiscard) void discardWorkout()
              else setConfirmDiscard(true)
            }}
            disabled={saving}
            className={`btn-base h-12 shrink-0 px-3 text-[13px] disabled:opacity-45 ${
              confirmDiscard ? 'btn-primary' : 'btn-quiet'
            }`}
          >
            {confirmDiscard ? t('log.discard_confirm') : t('log.discard')}
          </button>
        </div>
      )}

      {view === 'picker' && (
        <ExercisePicker
          exercises={exercises}
          usage={usage}
          onPick={(exercise) => {
            addToBoard(exercise.id)
            // A lift the app has never seen has nothing to ghost, so the board
            // has nothing to show and the keyboard is the point: go straight to
            // the focused view, exactly as before v2.2. Everything else lands on
            // the overview, where its planned rows are already drawn.
            const seen = (usage.get(exercise.id)?.set_count ?? 0) > 0
            if (seen || plan.has(exercise.id)) {
              setCurrent(null)
              setView('overview')
            } else {
              setCurrent(exercise)
              setView('entry')
            }
          }}
          onCancel={() => setView('overview')}
          onCreated={(exercise) =>
            // Into the local catalogue immediately: the picker is about to
            // hand this exercise straight to set entry, and a reload would
            // put a round trip in the middle of the hot path.
            setExercises((prev) =>
              [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
        />
      )}

      {restExpanded && timer.remaining !== null && (
        <RestExpanded
          timer={timer}
          onCollapse={() => setRestExpanded(false)}
          card={restCard}
          nextLabel={(() => {
            const ex = exercises.find((e) => e.id === restingExerciseId)
            if (!ex) return null
            // Working sets only. Counting every row made this say "set 5"
            // while the canvas card directly above it — which goes through
            // `buildBlock`, and does filter — said set 3, on the same
            // overlay, about the same lift.
            const n =
              sets.filter((x) => x.exercise_id === ex.id && x.set_type !== 'warmup')
                .length + 1
            return t('rest.next_set', { name: ex.name, n: String(n) })
          })()}
        />
      )}

      {view === 'entry' && current && (
        <SetEntry
          exercise={current}
          unit={unit}
          plannedSets={blocks.find((b) => b.exerciseId === current.id)?.planned}
          nextExerciseName={nextOnBoard(current.id)?.name ?? null}
          onNextExercise={() => {
            const next = nextOnBoard(current.id)
            if (next) jumpToExercise(next.id)
          }}
          sessionQueue={
            <SessionQueue
              blocks={blocks}
              currentExerciseId={current.id}
              onJump={jumpToExercise}
            />
          }
          setsThisWorkout={sets.filter((s) => s.exercise_id === current.id)}
          previousSession={previousByExercise.get(current.id) ?? []}
          // Presence in the map is the loaded flag. Seeding from an empty list
          // before the fetch lands is what broke the auto-fill once.
          previousLoading={!previousByExercise.has(current.id)}
          saving={saving}
          onAddSet={async (values) => (await addSet(values)) !== null}
          timer={timer}
          onExpandRest={() => setRestExpanded(true)}
          restSeconds={restFor(current)}
          onSaveRest={(seconds) => void saveRestDefault(current.id, seconds)}
          supersetGroup={groupOf(sets, current.id) ?? pendingGroup}
          onSuperset={() => void beginSuperset()}
          onUngroup={
            groupOf(sets, current.id) !== null
              ? () => void ungroupExercise(current.id)
              : undefined
          }
        />
      )}

      {view === 'overview' && (
        <>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted">{t('log.empty')}</p>
          ) : (
            <WorkoutOverview
              blocks={blocks}
              unit={unit}
              busy={saving}
              editingKey={editingKey}
              focusKey={focusKey}
              onCommit={(exerciseId, row) => void commitGhost(exerciseId, row)}
              onOpenRow={(exerciseId, row) => {
                const exercise = exercisesById.get(exerciseId)
                if (!exercise) return
                setCurrent(exercise)
                setEditingKey(row.key)
                setFocusKey(null)
                setView('entry')
              }}
              onAddGhost={(exerciseId) =>
                setExtraRows((prev) =>
                  new Map(prev).set(exerciseId, (prev.get(exerciseId) ?? 0) + 1),
                )
              }
              onReorder={(next) => void persistOrder(next)}
              onSaveNote={(exerciseId, note) => void saveExerciseNote(exerciseId, note)}
              onSaveRest={(exerciseId, seconds) =>
                void saveRestDefault(exerciseId, seconds)
              }
              onUngroup={(exerciseId) => void ungroupExercise(exerciseId)}
              onRemove={(exerciseId) => void removeFromBoard(exerciseId)}
            />
          )}

          {/* Adding an exercise is the one thing this screen does that is not
              logging, so it sits below the board rather than above it — the
              board is what you came here to read. */}
          <button
            type="button"
            onClick={() => setView('picker')}
            className="btn-base btn-secondary h-[54px] w-full text-[15px]"
          >
            {t('log.add_exercise')}
          </button>

          {/* The timer lives here as well as in the focused view, because a
              check pressed on the board starts a rest and a countdown you
              cannot see is a countdown that does not exist. Sticky above the
              tab bar, never a modal.

              The wrapper is opaque, and that is the whole fix for the one
              defect the screenshot run found here: transparent, it let the
              board show through the 12px of padding above and below the bar, so
              a pinned bar mid-scroll read as a rendering fault cutting a
              control in half. Measured rather than eyeballed — at the end of
              the board nothing overlaps at all; it is only ever mid-scroll,
              which is what a sticky bar is for. */}
          {timer.remaining !== null && (
            <div
              // `flex-col` with a gap so the canvas and the bar read as two
              // objects in one place rather than one object with a seam. With
              // the canvas absent — which is most of the time — a single child
              // makes the gap a no-op and the bar is exactly what it was.
              className="sticky z-10 -mx-[18px] flex flex-col gap-1.5 bg-ink px-[18px] pt-2"
              style={{
                // Flush, with the inset as its own padding — same recipe as
                // the other two clusters. This one kept its `+ 64px` when the
                // tab bar was retired, so it floated a tab-bar's height above
                // the bottom with the board showing through underneath.
                bottom: 0,
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
                // Trailing space below this bar is the overview wrapper's
                // py-3 plus main's padding. Without this the bar rides up its
                // own pinned line over the last stretch of the scroll.
                marginBottom:
                  'calc(-12px - max(env(safe-area-inset-bottom, 0px), 10px))',
                // A hairline where content stops and chrome starts, so a
                // control passing behind reads as scrolling under a bar
                // rather than as being cut in half.
                borderTop: '1px solid var(--divider-solid)',
              }}
            >
              {/* E1's rest canvas, ABOVE the bar and inside the same wrapper.
                  Above, because the timer row and the ± / Skip controls must
                  keep the coordinates they have today — §8-E1 says the log
                  control may not move, shrink, or arrive later, and a surface
                  that grows downward would move all three. The card only ever
                  appears while nothing is being touched (see RestCanvas), so
                  the growth never lands under a thumb in motion. */}
              <RestCanvas
                card={restCard}
                remaining={timer.remaining}
                onView={() => {
                  if (canvasViewed.current) return
                  canvasViewed.current = true
                  void recordCoachView('rest_canvas', 'view')
                }}
                onDismiss={() => void recordCoachView('rest_canvas', 'dismiss')}
              />
              <RestChip timer={timer} onExpand={() => setRestExpanded(true)} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The streak, drawn as a loaded bar rather than as dots.
 *
 * Four plates, ascending toward the centre exactly as the wordmark loads
 * them: the same shape language the logo uses, so the mark and the interface
 * are made of the same part. Filled plates are weeks completed.
 */
function StreakPlates({ weeks }: { weeks: number }) {
  const HEIGHTS = [7, 10, 13, 16]
  const shown = Math.min(weeks, HEIGHTS.length)
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-[3px]">
      {HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={i < shown ? 'bg-accent' : 'bg-neutral-800'}
          style={{ width: 4, height: h, borderRadius: 2 }}
        />
      ))}
    </span>
  )
}

/**
 * What the app is doing about the network, said quietly.
 *
 * Deliberately not an `ErrorNote`. Nothing has gone wrong: the sets are on
 * screen, they are on the device, and they will be on the server. §2.1 says
 * nothing interrupts the logging flow, and the wellness-app-design law says
 * feedback mid-workout is inline and passive — a line, not a banner, no border,
 * no `role="alert"`, `aria-live="polite"` so a screen reader mentions it
 * between sets instead of cutting across one.
 *
 * It says nothing at all when there is a connection and nothing pending, which
 * is almost always.
 */
function SyncNote({
  online,
  pending,
  cached = false,
}: {
  online: boolean
  pending: number
  cached?: boolean
}) {
  const { t } = useLocale()
  if (online && pending === 0 && !cached) return null
  const sets = (n: number) => `${n} ${n === 1 ? t('log.set') : t('log.sets')}`
  const label =
    pending > 0
      ? online
        ? t('log.sync.saving', { count: sets(pending) })
        : t('log.sync.offline_pending', { count: sets(pending) })
      : !online
        ? t('log.sync.offline')
        : t('log.sync.cached')
  return (
    <p className="tnum text-xs text-muted" aria-live="polite" data-testid="sync-note">
      {label}
    </p>
  )
}

/**
 * The stamp on cached reads — trust-ladder rung 4's honesty clause.
 *
 * Showing week-old data as though it were live is worse than showing nothing;
 * showing it with the time it was true is what makes it useful in a basement.
 */
function CachedNote({ savedAt }: { savedAt: number }) {
  const { t } = useLocale()
  return (
    <p className="text-xs text-muted" aria-live="polite" data-testid="cached-note">
      {t('log.cache.prefix')} <span className="tnum">{formatSyncedAt(savedAt)}</span>
    </p>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="ring-edge border border-accent px-3 py-2 text-sm text-accent-300"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      {message}
    </p>
  )
}
