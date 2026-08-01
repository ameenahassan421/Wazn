import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import { formatDuration } from '../lib/format'
import type {
  Exercise,
  ExerciseUsageRow,
  PreviousSessionRow,
  SetType,
  Workout,
  WorkoutSet,
} from '../lib/types'
import { ExercisePicker } from '../components/ExercisePicker'
import { SetEntry } from '../components/SetEntry'
import { useRestTimer, DEFAULT_REST_SECONDS } from '../lib/use-rest-timer'

type View = 'overview' | 'picker' | 'entry'

export function LogScreen({ userId }: { userId: string }) {
  const { unit } = useUnit()
  // Owned by the screen, not by SetEntry: leaving the exercise to pick the
  // next one must not cancel the rest you are still taking.
  const timer = useRestTimer()

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
    const [catalogue, usageRows, open, anyWorkout] = await Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.rpc('exercise_usage'),
      supabase
        .from('workouts')
        .select('*')
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
      supabase.from('workouts').select('id').limit(1),
    ])

    const failure = catalogue.error ?? usageRows.error ?? open.error ?? anyWorkout.error
    if (failure) {
      setError(describeError('Loading your workout', failure))
      setLoading(false)
      return
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
    setView('picker')
  }

  async function finishWorkout() {
    if (!workout) return
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('workouts')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', workout.id)
    setSaving(false)

    if (updateError) {
      setError(describeError('Finishing the workout', updateError))
      return
    }
    setWorkout(null)
    setSets([])
    setCurrent(null)
    setView('overview')
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
