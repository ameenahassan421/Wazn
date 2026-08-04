import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useRestTimer, DEFAULT_REST_SECONDS } from '../lib/use-rest-timer'
import { FinishSummary } from '../components/FinishSummary'
import { RoutineList } from '../components/RoutineList'
import { RoutineGenerator } from '../components/RoutineGenerator'
import { RoutineEditor } from '../components/RoutineEditor'
import {
  listRoutines,
  loadRoutine,
  saveRoutine,
  duplicateRoutine,
  deleteRoutine,
} from '../lib/routines'
import type { RoutineDetail, RoutineDraft } from '../lib/routines'
import {
  groupsFromSets,
  groupOf,
  nextGroupId,
  nextInGroup,
  roundComplete,
} from '../lib/supersets'
import { summarise } from '../lib/summary'
import type { WorkoutSummary } from '../lib/summary'

type View = 'overview' | 'picker' | 'entry' | 'summary' | 'routine' | 'generate'

interface ExerciseBestRow {
  exercise_id: string
  best_weight_kg: number | string
  best_e1rm_kg: number | string
}

export function LogScreen({ userId }: { userId: string }) {
  const { unit } = useUnit()
  // Owned by the screen, not by SetEntry: leaving the exercise to pick the
  // next one must not cancel the rest you are still taking.
  const timer = useRestTimer()
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [summaryDate, setSummaryDate] = useState('')
  const [streak, setStreak] = useState<WeeklyStreakRow | null>(null)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [editing, setEditing] = useState<RoutineDetail | null>(null)
  const [routineBusy, setRoutineBusy] = useState<string | null>(null)
  // Exercise ids the active routine planned, in order. Drives the "next up"
  // hint; the workout itself stays freestyle, so you can deviate at any point.
  const [planned, setPlanned] = useState<string[]>([])
  // Group id to stamp on the next set, set when starting a superset from the
  // overview and cleared once it lands on a row.
  const [pendingGroup, setPendingGroup] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [usage, setUsage] = useState<Map<string, ExerciseUsageRow>>(new Map())
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
  const [current, setCurrent] = useState<Exercise | null>(null)
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
  useEffect(() => {
    if (!confirmFinish) return
    const id = setTimeout(() => setConfirmFinish(false), 4000)
    return () => clearTimeout(id)
  }, [confirmFinish])
  // Re-render each half-minute while a workout is open, so the duration in
  // the status row moves. The value itself is derived at render time.
  const [, setDurationTick] = useState(0)
  useEffect(() => {
    if (!workout) return
    const id = setInterval(() => setDurationTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [workout])
  const [previousSession, setPreviousSession] = useState<PreviousSessionRow[]>([])
  // Which exercise the loaded previous session belongs to. Derived rather than
  // a loading flag: a flag set in an effect lands after the child has already
  // rendered, and the auto-fill would seed from nothing.
  const [previousFor, setPreviousFor] = useState<string | null>(null)

  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  )

  // No synchronous setState here: the effect below calls it on mount, where a
  // state update before the first await would cause a cascading render.
  const load = useCallback(async () => {
    const [catalogue, usageRows, open, anyWorkout, streakRows] = await Promise.all([
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
    ])

    const failure = catalogue.error ?? usageRows.error ?? open.error ?? anyWorkout.error
    if (failure) {
      setError(describeError('Loading your workout', failure))
      setLoading(false)
      return
    }

    // A failed streak must not block the screen — it is decoration, not data.
    setStreak(((streakRows.data ?? []) as WeeklyStreakRow[])[0] ?? null)
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
    } else {
      setSets([])
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
  }, [])

  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  // Previous session for the exercise being logged, excluding this workout.
  // Nothing is cleared when no exercise is selected: the data is consumed only
  // when previousFor matches the current exercise, so a stale list is inert.
  useEffect(() => {
    if (!current) return
    const exerciseId = current.id
    let active = true
    void supabase
      .rpc('previous_session', {
        p_exercise_id: current.id,
        p_exclude_workout: workout?.id ?? null,
      })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) {
          setError(describeError('Loading your previous session', rpcError))
          setPreviousSession([])
          setPreviousFor(exerciseId)
          return
        }
        setPreviousSession((data ?? []) as PreviousSessionRow[])
        setPreviousFor(exerciseId)
      })
    return () => {
      active = false
    }
  }, [current, workout?.id])

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
      setPlanned(detail?.exercises.map((e) => e.exercise_id) ?? [])

      // Jump straight into the first exercise: the point of a routine is that
      // you already know what you are doing.
      const firstId = detail?.exercises[0]?.exercise_id
      const first = firstId ? exercisesById.get(firstId) : undefined
      if (first) {
        setCurrent(first)
        setView('entry')
      } else {
        setView('picker')
      }
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
    setView('picker')
  }

  async function finishWorkout() {
    if (!workout) return
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
    setSaving(false)
    timer.stop()
    setWorkout(null)
    setSets([])
    setCurrent(null)
    setPlanned([])
    setView('summary')
    void load()
  }

  async function addSet({
    weightKg,
    reps,
    setType,
    rpe,
  }: {
    weightKg: number | null
    reps: number
    setType: SetType
    rpe: number | null
  }): Promise<boolean> {
    if (!workout || !current) return false

    const setNumber = sets.filter((s) => s.exercise_id === current.id).length + 1
    // Keep the exercise in whatever group it is already part of this workout.
    const supersetGroup = groupOf(sets, current.id) ?? pendingGroup

    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('workout_sets')
      .insert({
        workout_id: workout.id,
        exercise_id: current.id,
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
      setError(describeError(`Saving set ${setNumber} of ${current.name}`, insertError))
      return false
    }

    const nextSets = [...sets, data as WorkoutSet]
    setSets(nextSets)
    setPendingGroup(null)

    // Supersets rest once per round, not between their exercises — that is
    // the point of one. Advance to whoever is behind instead.
    // Rest starts on a logged set, never on a tap: a failed save must not
    // leave a timer counting against a set that does not exist. Warm-ups start
    // nothing — nobody rests two minutes after an empty bar.
    const rest = current.default_rest_seconds ?? DEFAULT_REST_SECONDS
    if (supersetGroup !== null) {
      const members = groupsFromSets(nextSets).get(supersetGroup) ?? []
      const advanceTo = nextInGroup(nextSets, members, current.id)
      if (advanceTo) {
        // Mid-round: move to whoever is behind and do NOT rest. Resting
        // between a superset's exercises is exactly what it is not.
        const target = exercisesById.get(advanceTo)
        if (target) setCurrent(target)
        return true
      }
      if (setType !== 'warmup' && roundComplete(nextSets, members)) timer.start(rest)
      return true
    }

    if (setType !== 'warmup') timer.start(rest)
    return true
  }

  // The next planned exercise with no sets logged yet. A routine guides; it
  // does not constrain — the picker is still one tap away at all times.
  const nextUp = useMemo(() => {
    if (planned.length === 0) return null
    const done = new Set(sets.map((s) => s.exercise_id))
    const id = planned.find((exerciseId) => !done.has(exerciseId))
    return id ? (exercisesById.get(id) ?? null) : null
  }, [planned, sets, exercisesById])

  const grouped = useMemo(() => {
    const order: string[] = []
    const byExercise = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
      if (!byExercise.has(set.exercise_id)) {
        byExercise.set(set.exercise_id, [])
        order.push(set.exercise_id)
      }
      byExercise.get(set.exercise_id)!.push(set)
    }
    return order.map((id) => ({ exerciseId: id, sets: byExercise.get(id)! }))
  }, [sets])

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
  if (view === 'generate') {
    return (
      <RoutineGenerator
        onBack={() => setView('overview')}
        onDone={() => {
          setView('overview')
          void load()
        }}
      />
    )
  }

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
          onDone={() => {
            setSummary(null)
            setView('overview')
          }}
        />
      </div>
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
          onGenerate={() => setView('generate')}
        />

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

      {view === 'picker' && (
        <ExercisePicker
          exercises={exercises}
          usage={usage}
          onPick={(exercise) => {
            setCurrent(exercise)
            setView('entry')
          }}
          onCancel={() => setView('overview')}
        />
      )}

      {view === 'entry' && current && (
        <SetEntry
          exercise={current}
          unit={unit}
          setsThisWorkout={sets.filter((s) => s.exercise_id === current.id)}
          previousSession={previousFor === current.id ? previousSession : []}
          previousLoading={previousFor !== current.id}
          saving={saving}
          onAddSet={addSet}
          timer={timer}
          supersetGroup={groupOf(sets, current.id) ?? pendingGroup}
          onSuperset={() => void beginSuperset()}
          onBack={() => {
            setCurrent(null)
            setView('overview')
          }}
        />
      )}

      {view === 'overview' && (
        <>
          <button
            type="button"
            onClick={() => setView('picker')}
            className="btn-base btn-primary h-[60px] w-full text-[17px]"
          >
            Add exercise
          </button>

          {nextUp && (
            <button
              type="button"
              onClick={() => {
                setCurrent(nextUp)
                setView('entry')
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-start"
              style={{
                border:
                  '1px dashed color-mix(in srgb, var(--color-accent) 45%, transparent)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <ExerciseThumb exercise={nextUp} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-[0.1em] text-accent">
                  Next
                </span>
                <span className="block truncate text-sm font-medium">
                  {nextUp.name}
                </span>
              </span>
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </button>
          )}

          {grouped.length === 0 ? (
            <p className="text-sm text-muted">
              No sets yet. Pick an exercise to log your first set.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {grouped.map(({ exerciseId, sets: exerciseSets }) => {
                const exercise = exercisesById.get(exerciseId)
                const group = exerciseSets.find(
                  (s) => s.superset_group != null,
                )?.superset_group
                return (
                  <li
                    key={exerciseId}
                    // Members of one superset share a rail down the inline
                    // start, so a round reads as one block rather than as
                    // separate exercises that happen to be adjacent.
                    style={
                      group != null
                        ? {
                            borderInlineStart: '2px solid var(--color-accent-700)',
                            paddingInlineStart: 11,
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!exercise) return
                        setCurrent(exercise)
                        setView('entry')
                      }}
                      className="ring-edge flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-start"
                      style={{ borderRadius: 'var(--radius-md)' }}
                    >
                      {exercise && <ExerciseThumb exercise={exercise} size={48} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {exercise?.name ?? 'Exercise'}
                          </span>
                          {group != null ? (
                            <span className="tag-accent h-5 shrink-0 px-1.5">
                              SS {group}
                            </span>
                          ) : (
                            <span className="tnum shrink-0 text-xs text-muted">
                              {exerciseSets.length}
                            </span>
                          )}
                        </span>
                        <span className="tnum mt-0.5 block truncate text-[15px] text-text/80">
                          {exerciseSets
                            .map((s) =>
                              s.weight_kg === null
                                ? `BW × ${s.reps ?? '—'}`
                                : `${formatWeight(s.weight_kg, unit)} × ${s.reps ?? '—'}`,
                            )
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
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
