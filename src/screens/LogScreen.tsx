import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import { formatDuration, formatWorkoutDate } from '../lib/format'
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
import { SetEntry } from '../components/SetEntry'
import { useRestTimer, DEFAULT_REST_SECONDS } from '../lib/use-rest-timer'
import { FinishSummary } from '../components/FinishSummary'
import { RoutineList } from '../components/RoutineList'
import { RoutineEditor } from '../components/RoutineEditor'
import {
  listRoutines,
  loadRoutine,
  saveRoutine,
  duplicateRoutine,
  deleteRoutine,
} from '../lib/routines'
import type { RoutineDetail, RoutineDraft } from '../lib/routines'
import { summarise } from '../lib/summary'
import type { WorkoutSummary } from '../lib/summary'

type View = 'overview' | 'picker' | 'entry' | 'summary' | 'routine'

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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [usage, setUsage] = useState<Map<string, ExerciseUsageRow>>(new Map())
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [hasHistory, setHasHistory] = useState(false)

  const [view, setView] = useState<View>('overview')
  const [current, setCurrent] = useState<Exercise | null>(null)
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
      })
      .select()
      .single()
    setSaving(false)

    if (insertError) {
      setError(describeError(`Saving set ${setNumber} of ${current.name}`, insertError))
      return false
    }

    setSets((prev) => [...prev, data as WorkoutSet])
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
          onDone={() => {
            setSummary(null)
            setView('overview')
          }}
        />
      </div>
    )
  }

  // Empty state: one button, nothing else.
  if (!workout) {
    return (
      <div className="flex flex-col gap-4 py-10">
        {error && <ErrorNote message={error} />}
        <button
          type="button"
          onClick={() => void startWorkout()}
          disabled={saving}
          className="h-16 w-full rounded-lg bg-accent text-xl font-bold text-accent-ink disabled:opacity-60"
        >
          {hasHistory ? 'Start workout' : 'Start your first workout'}
        </button>
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
        />

        {streak && streak.weeks > 0 && (
          <p className="text-sm text-muted">
            <span className="tnum font-semibold text-text">{streak.weeks}</span>
            {streak.weeks === 1 ? ' week streak' : ' week streak'} ·{' '}
            <span className="tnum">{streak.current_week_sessions}</span> this week
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      {error && <ErrorNote message={error} />}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold">Workout in progress</p>
          <p className="tnum text-xs text-muted">
            {formatDuration(workout.started_at, new Date().toISOString())} ·{' '}
            {sets.length} {sets.length === 1 ? 'set' : 'sets'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void finishWorkout()}
          disabled={saving}
          className="h-12 rounded-md border border-line px-4 text-sm font-semibold disabled:opacity-60"
        >
          Finish
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
          restSeconds={current.default_rest_seconds ?? DEFAULT_REST_SECONDS}
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
            className="h-16 w-full rounded-lg bg-accent text-xl font-bold text-accent-ink"
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
              className="flex h-14 w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 text-start"
            >
              <span className="text-xs text-muted">Next</span>
              <span className="flex-1 truncate text-base font-semibold">
                {nextUp.name}
              </span>
            </button>
          )}

          {grouped.length === 0 ? (
            <p className="text-sm text-muted">
              No sets yet. Pick an exercise to log your first set.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {grouped.map(({ exerciseId, sets: exerciseSets }) => (
                <li key={exerciseId}>
                  <button
                    type="button"
                    onClick={() => {
                      const exercise = exercisesById.get(exerciseId)
                      if (!exercise) return
                      setCurrent(exercise)
                      setView('entry')
                    }}
                    className="w-full rounded-lg border border-line px-3 py-2 text-start"
                  >
                    <span className="block truncate text-sm font-semibold">
                      {exercisesById.get(exerciseId)?.name ?? 'Exercise'}
                    </span>
                    <span className="tnum mt-1 block text-lg">
                      {exerciseSets
                        .map((s) =>
                          s.weight_kg === null
                            ? `BW × ${s.reps ?? '—'}`
                            : `${formatWeight(s.weight_kg, unit)} × ${s.reps ?? '—'}`,
                        )
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-accent px-3 py-2 text-sm text-accent"
    >
      {message}
    </p>
  )
}
