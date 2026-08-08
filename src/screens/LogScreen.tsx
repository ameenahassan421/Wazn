import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import { formatDuration, formatRelativeDay, formatWorkoutDate } from '../lib/format'
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
import { ExerciseThumb } from '../components/ExerciseThumb'
import { SetEntry } from '../components/SetEntry'
import { DEFAULT_REST_SECONDS, useRestTimer } from '../lib/use-rest-timer'
import { FinishSummary } from '../components/FinishSummary'
import { RoutineList } from '../components/RoutineList'
import { InstallPrompt } from '../components/InstallPrompt'
import { Welcome } from '../components/Welcome'
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
import { RestTimerBar } from '../components/RestTimer'

type View = 'overview' | 'picker' | 'entry' | 'summary' | 'routine'

interface ExerciseBestRow {
  exercise_id: string
  best_weight_kg: number | string
  best_e1rm_kg: number | string
}

export function LogScreen({
  userId,
  onOpenCoach,
}: {
  userId: string
  /** The routine builder lives on the Coach tab (design v2.1), so Log's
   *  "Generate" is navigation rather than a view of its own. */
  onOpenCoach: () => void
}) {
  const { unit } = useUnit()
  // Owned by the screen, not by SetEntry: leaving the exercise to pick the
  // next one must not cancel the rest you are still taking.
  const timer = useRestTimer()
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [summaryDate, setSummaryDate] = useState('')
  // The finished workout's identity, kept past the point where `workout` is
  // cleared, so the summary can name and annotate the thing just logged.
  const [summaryWorkout, setSummaryWorkout] = useState<Workout | null>(null)
  const [streak, setStreak] = useState<WeeklyStreakRow | null>(null)
  const [routines, setRoutines] = useState<Routine[]>([])
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
  const [lastSession, setLastSession] = useState<{
    startedAt: string
    sets: WorkoutSet[]
  } | null>(null)

  const [view, setView] = useState<View>('overview')
  // Onboarding is shown once, to an account with nothing in it, and can be
  // dismissed forward into either path. It is state rather than a route
  // because it is a moment, not a place.
  const [welcomed, setWelcomed] = useState(false)
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
  // Re-render each half-minute while a workout is open, so the duration in
  // the status row moves. The value itself is derived at render time.
  const [, setDurationTick] = useState(0)
  useEffect(() => {
    if (!workout) return
    const id = setInterval(() => setDurationTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [workout])
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
      if (id) void supabase.from('workouts').delete().eq('id', id)
    },
    [],
  )

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

  // No synchronous setState here: the effect below calls it on mount, where a
  // state update before the first await would cause a cascading render.
  const load = useCallback(async () => {
    const [catalogue, usageRows, open, anyWorkout, streakRows, restRows, noteRows] =
      await Promise.all([
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
      ])

    const failure = catalogue.error ?? usageRows.error ?? open.error ?? anyWorkout.error
    if (failure) {
      setError(describeError('Loading your workout', failure))
      setLoading(false)
      return
    }

    // A failed streak must not block the screen — it is decoration, not data.
    setStreak(((streakRows.data ?? []) as WeeklyStreakRow[])[0] ?? null)
    // Same posture for the rest overrides: migration 0015 may not be applied
    // yet, and a missing table must fall the timer back to its default rather
    // than stop the workout loading.
    setRestOverrides(
      new Map(
        ((restRows.data ?? []) as { exercise_id: string; rest_seconds: number }[]).map(
          (row) => [row.exercise_id, row.rest_seconds],
        ),
      ),
    )
    setExerciseNotes(
      new Map(
        ((noteRows.data ?? []) as { exercise_id: string; note: string }[]).map(
          (row) => [row.exercise_id, row.note],
        ),
      ),
    )
    // Routines are only needed on the idle screen; a failure there must not
    // stop an in-progress workout from loading.
    try {
      setRoutines(await listRoutines())
    } catch {
      setRoutines([])
    }
    setExercises((catalogue.data ?? []) as Exercise[])
    setUsage(
      new Map(
        ((usageRows.data ?? []) as ExerciseUsageRow[]).map((row) => [
          row.exercise_id,
          row,
        ]),
      ),
    )
    setHasHistory((anyWorkout.data ?? []).length > 0)

    const active = (open.data ?? [])[0] as Workout | undefined
    setWorkout(active ?? null)

    if (active) {
      const { data, error: setsError } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('workout_id', active.id)
        .order('set_number')
      if (setsError) {
        setError(describeError('Loading the sets in this workout', setsError))
      } else {
        setSets((data ?? []) as WorkoutSet[])
      }

      // The arrangement, restored. Absent when 0020 is not applied, in which
      // case the order is derived from the sets — exactly the pre-v2.2 order.
      setOrder(
        Array.isArray(active.exercise_order)
          ? active.exercise_order.filter(Boolean)
          : [],
      )
      setRemoved(new Set())
      setExtraRows(new Map())

      // Reopening mid-session has to remember what the routine planned, or the
      // ghosts vanish on the first reload and the board loses half its rows.
      if (active.routine_id) {
        try {
          const detail = await loadRoutine(active.routine_id)
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
      // Idle screen only. A failure here must not block the screen — like the
      // streak, it is context, not data you cannot log without.
      try {
        const { data: recent } = await supabase
          .from('workouts')
          .select('id, started_at')
          .not('ended_at', 'is', null)
          .order('started_at', { ascending: false })
          .limit(1)
        const last = (recent ?? [])[0] as { id: string; started_at: string } | undefined
        if (last) {
          const { data: lastSets } = await supabase
            .from('workout_sets')
            .select('*')
            .eq('workout_id', last.id)
            .order('set_number')
          setLastSession({
            startedAt: last.started_at,
            sets: (lastSets ?? []) as WorkoutSet[],
          })
        } else {
          setLastSession(null)
        }
      } catch {
        setLastSession(null)
      }
    }

    setLoading(false)
  }, [applyRoutinePlan])

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
          setPreviousByExercise((prev) =>
            new Map(prev).set(
              exerciseId,
              rpcError ? [] : ((data ?? []) as PreviousSessionRow[]),
            ),
          )
        })
    }
  }, [workout, displayOrder])

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
      const detail = await loadRoutine(routine.id)
      const { data, error: insertError } = await supabase
        .from('workouts')
        .insert({
          user_id: userId,
          started_at: new Date().toISOString(),
          name: routine.name,
          routine_id: routine.id,
        })
        .select()
        .single()
      if (insertError) throw insertError

      setWorkout(data as Workout)
      setSets([])
      setHasHistory(true)
      setRemoved(new Set())
      setExtraRows(new Map())
      applyRoutinePlan(detail)
      setOrder(detail?.exercises.map((e) => e.exercise_id) ?? [])

      // The overview, not the first exercise. The whole session is on the board
      // with its planned rows already drawn, and the first set is one tap from
      // here — where before this you landed inside one exercise and had to
      // guess at the rest of the plan. Design v2.2: the overview is the spine.
      setView(detail && detail.exercises.length > 0 ? 'overview' : 'picker')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that routine.')
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
          setError(describeError('Grouping the superset', updateError))
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
    if (writeError) setError(describeError('Saving the rest time', writeError))
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
      setError(err instanceof Error ? err.message : 'Could not update that routine.')
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
      setError(err instanceof Error ? err.message : 'Could not save the routine.')
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
      setError(err instanceof Error ? err.message : 'Could not open that routine.')
    }
  }

  async function onDuplicateRoutine(routine: Routine) {
    setRoutineBusy(routine.id)
    try {
      await duplicateRoutine(userId, routine.id)
      setRoutines(await listRoutines())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate that routine.')
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
      setError(err instanceof Error ? err.message : 'Could not delete that routine.')
    } finally {
      setRoutineBusy(null)
    }
  }

  async function startWorkout() {
    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('workouts')
      .insert({ user_id: userId, started_at: new Date().toISOString() })
      .select()
      .single()
    setSaving(false)

    if (insertError) {
      setError(describeError('Starting the workout', insertError))
      return
    }
    setWorkout(data as Workout)
    setSets([])
    setHasHistory(true)
    setPlanned([])
    setPlan(new Map())
    setOrder([])
    setRemoved(new Set())
    setExtraRows(new Map())
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
    if (writeError) orderUnavailable.current = true
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
        setError(describeError('Removing the exercise', deleteError))
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
    if (writeError) setError(describeError('Saving the note', writeError))
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
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('workouts')
      .delete()
      .eq('id', discarded)
    setSaving(false)

    if (deleteError) {
      setError(describeError('Discarding the workout', deleteError))
      return
    }

    // Before clearing state, so the unmount guard cannot chase a row that is
    // already gone.
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
      setError(describeError('Leaving the superset', updateError))
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
    const endedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('workouts')
      .update({ ended_at: endedAt })
      .eq('id', workout.id)

    if (updateError) {
      setSaving(false)
      setError(describeError('Finishing the workout', updateError))
      return
    }

    // Bests EXCLUDING this workout, or every set of a new exercise reports a
    // PR against itself. One call for the whole workout, after the write, so
    // a slow summary never delays marking the workout finished.
    const { data: bestRows } = await supabase.rpc('exercise_bests', {
      p_exclude_workout: workout.id,
    })
    const previousBests = new Map(
      ((bestRows ?? []) as ExerciseBestRow[]).map((r) => [
        r.exercise_id,
        { weightKg: Number(r.best_weight_kg), e1rmKg: Number(r.best_e1rm_kg) },
      ]),
    )

    setSummary(
      summarise(sets, workout.started_at, endedAt, exercisesById, previousBests),
    )
    setSummaryDate(formatWorkoutDate(workout.started_at))
    setSummaryWorkout({ ...workout, ended_at: endedAt })
    // Mid-workout there is no such thing as a skipped exercise — there is only
    // not-yet-done, and saying otherwise is the app scolding somebody who is
    // still lifting. Finish is the end of the flow rather than the middle of
    // it, so this is the one moment where "skipped" is allowed to exist.
    setSkipped(
      displayOrder
        .filter((id) => !sets.some((s) => s.exercise_id === id))
        .map((id) => exercisesById.get(id)?.name ?? 'Exercise'),
    )
    setRoutineUpdate(routineDiff(workout))
    setSaving(false)
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

    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('workout_sets')
      .insert({
        workout_id: workout.id,
        exercise_id: exercise.id,
        set_number: setNumber,
        weight_kg: weightKg,
        reps,
        set_type: setType,
        rpe,
        superset_group: supersetGroup,
      })
      .select()
      .single()
    setSaving(false)

    if (insertError) {
      setError(
        describeError(`Saving set ${setNumber} of ${exercise.name}`, insertError),
      )
      return null
    }

    const nextSets = [...sets, data as WorkoutSet]
    setSets(nextSets)
    setPendingGroup(null)
    addToBoard(exercise.id)

    // Rest starts on a logged set, never on a tap: a failed save must not leave
    // a timer counting against a set that does not exist. Everything else the
    // commit implies — round-rest, alternation, warm-ups, "no timer on this
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
    if (outcome.restSeconds !== null) timer.start(outcome.restSeconds)
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

  // Up to three exercises from the last finished session, in the order they
  // were performed, each collapsed to its working sets.
  const lastSummary = useMemo(() => {
    if (!lastSession) return []
    const order: string[] = []
    const byExercise = new Map<string, WorkoutSet[]>()
    for (const set of lastSession.sets) {
      if (!byExercise.has(set.exercise_id)) {
        byExercise.set(set.exercise_id, [])
        order.push(set.exercise_id)
      }
      byExercise.get(set.exercise_id)!.push(set)
    }
    return order.slice(0, 3).flatMap((id) => {
      const exercise = exercisesById.get(id)
      if (!exercise) return []
      const rows = byExercise.get(id)!
      const working = rows.filter((s) => s.set_type !== 'warmup')
      return [
        {
          exercise,
          summary: (working.length > 0 ? working : rows)
            .slice(0, 2)
            .map((s) =>
              s.weight_kg === null
                ? `BW × ${s.reps ?? '—'}`
                : `${formatWeight(s.weight_kg, unit)} × ${s.reps ?? '—'}`,
            )
            .join(' · '),
        },
      ]
    })
  }, [lastSession, exercisesById, unit])

  if (loading) {
    return <p className="py-10 text-sm text-muted">Loading…</p>
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
        <FinishSummary
          summary={summary}
          unit={unit}
          dateLabel={summaryDate}
          exercisesById={exercisesById}
          workout={summaryWorkout}
          skipped={skipped}
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
  if (!workout && !welcomed && !hasHistory && routines.length === 0) {
    return (
      <Welcome
        onGenerate={() => {
          setWelcomed(true)
          onOpenCoach()
        }}
        onSkip={() => setWelcomed(true)}
      />
    )
  }

  // Empty state: one button, then context. Nothing here is a control you have
  // to read before you can start lifting.
  if (!workout) {
    return (
      <div className="flex flex-col gap-[18px] pt-4">
        {error && <ErrorNote message={error} />}
        <div>
          <button
            type="button"
            onClick={() => void startWorkout()}
            disabled={saving}
            className="btn-base btn-hero press h-[62px] w-full text-[18px] disabled:opacity-45"
          >
            {hasHistory ? 'Start workout' : 'Start your first workout'}
          </button>

          {streak && streak.weeks > 0 && (
            <p className="mt-2.5 flex items-center gap-2 whitespace-nowrap text-[13px] text-muted">
              <StreakPlates weeks={streak.weeks} />
              <span>
                <span className="tnum font-medium text-text">{streak.weeks}</span> week
                streak ·{' '}
                <span className="tnum font-medium text-text">
                  {streak.current_week_sessions}
                </span>{' '}
                this week
              </span>
            </p>
          )}
        </div>

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

        {/* Offered only once the app has proved useful — `hasHistory` means
            at least one workout exists — and never while one is open. */}
        <InstallPrompt earned={hasHistory} />

        {lastSummary.length > 0 && lastSession && (
          <section>
            <h2 className="kicker mb-2">
              Last session · {formatRelativeDay(lastSession.startedAt)}
            </h2>
            <ul>
              {lastSummary.map(({ exercise, summary: text }, i) => (
                <li key={exercise.id}>
                  {i > 0 && <div className="rule-fade" />}
                  <div className="flex items-center gap-3 py-2">
                    <ExerciseThumb exercise={exercise} size={48} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {exercise.name}
                    </span>
                    <span className="tnum shrink-0 text-[13px] text-muted">{text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      {error && <ErrorNote message={error} />}

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-medium">
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-accent"
            />
            <span className="truncate">{workout.name ?? 'Workout'} · in progress</span>
          </p>
          <p className="tnum text-xs text-muted">
            {formatDuration(workout.started_at, new Date().toISOString())} ·{' '}
            {sets.length} {sets.length === 1 ? 'set' : 'sets'}
          </p>
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
          {confirmFinish ? 'Finish?' : 'Finish'}
        </button>
      </div>

      {/* Discard lives behind the armed finish, on its own line: it is the
          destructive twin of the button next to it, and putting them shoulder
          to shoulder in the header is how a mis-tap deletes a session. */}
      {confirmFinish && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[11px] text-muted">
            {sets.length === 0
              ? 'Nothing logged yet — finishing throws this one away.'
              : 'Finish saves it. Discard deletes it and its sets.'}
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
            {confirmDiscard ? 'Discard?' : 'Discard workout'}
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

      {view === 'entry' && current && (
        <SetEntry
          exercise={current}
          unit={unit}
          setsThisWorkout={sets.filter((s) => s.exercise_id === current.id)}
          previousSession={previousByExercise.get(current.id) ?? []}
          // Presence in the map is the loaded flag. Seeding from an empty list
          // before the fetch lands is what broke the auto-fill once.
          previousLoading={!previousByExercise.has(current.id)}
          saving={saving}
          onAddSet={async (values) => (await addSet(values)) !== null}
          timer={timer}
          restSeconds={restFor(current)}
          onSaveRest={(seconds) => void saveRestDefault(current.id, seconds)}
          supersetGroup={groupOf(sets, current.id) ?? pendingGroup}
          onSuperset={() => void beginSuperset()}
          onUngroup={
            groupOf(sets, current.id) !== null
              ? () => void ungroupExercise(current.id)
              : undefined
          }
          onBack={() => {
            setCurrent(null)
            setEditingKey(null)
            setView('overview')
          }}
        />
      )}

      {view === 'overview' && (
        <>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted">
              No exercises yet. Add one to put it on the board.
            </p>
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
            Add exercise
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
              className="sticky z-10 -mx-[18px] bg-ink px-[18px] pt-2 pb-1"
              style={{
                // The tab bar is 60px plus its own safe-area padding; 4px of
                // air keeps the bar off it without a gap you could read as a
                // seam.
                bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 10px) + 64px)',
                // The same hairline the tab bar carries, for the same reason:
                // it marks the edge where content stops and chrome starts, so
                // a control passing behind reads as scrolling under a bar
                // rather than as being cut in half.
                borderTop: '1px solid rgba(236,235,232,0.09)',
              }}
            >
              <RestTimerBar timer={timer} />
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

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="ring-edge border border-accent px-3 py-2 text-sm text-accent"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      {message}
    </p>
  )
}
