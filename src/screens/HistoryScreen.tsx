import { useCallback, useEffect, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import {
  formatDuration,
  formatSeconds,
  formatTime,
  formatWorkoutDate,
} from '../lib/format'
import type { Workout, WorkoutSet } from '../lib/types'

const PAGE_SIZE = 30

type SetWithExercise = WorkoutSet & { exercises: { name: string } | null }

export function HistoryScreen() {
  const { unit } = useUnit()

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [setsByWorkout, setSetsByWorkout] = useState<Record<string, SetWithExercise[]>>(
    {},
  )

  const fetchPage = useCallback(async (offset: number) => {
    const { data, error: pageError } = await supabase
      .from('workouts')
      .select('*')
      .order('started_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (pageError) {
      setError(describeError('Loading your workout history', pageError))
      return null
    }
    return (data ?? []) as Workout[]
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const page = await fetchPage(0)
      if (!active || !page) {
        setLoading(false)
        return
      }
      setWorkouts(page)
      setDone(page.length < PAGE_SIZE)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [fetchPage])

  async function loadMore() {
    setLoadingMore(true)
    const page = await fetchPage(workouts.length)
    setLoadingMore(false)
    if (!page) return
    setWorkouts((prev) => [...prev, ...page])
    if (page.length < PAGE_SIZE) setDone(true)
  }

  async function toggle(workoutId: string) {
    if (expanded === workoutId) {
      setExpanded(null)
      return
    }
    setExpanded(workoutId)
    if (setsByWorkout[workoutId]) return

    const { data, error: setsError } = await supabase
      .from('workout_sets')
      .select('*, exercises(name)')
      .eq('workout_id', workoutId)
      .order('set_number')

    if (setsError) {
      setError(describeError('Loading the sets for that workout', setsError))
      return
    }
    setSetsByWorkout((prev) => ({
      ...prev,
      [workoutId]: (data ?? []) as SetWithExercise[],
    }))
  }

  if (loading) return <p className="py-10 text-sm text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3 py-3">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-accent px-3 py-2 text-sm text-accent"
        >
          {error}
        </p>
      )}

      {workouts.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          No workouts yet. Log one on the Log tab and it will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {workouts.map((workout) => {
            const open = expanded === workout.id
            const sets = setsByWorkout[workout.id]
            return (
              <li key={workout.id}>
                <button
                  type="button"
                  onClick={() => void toggle(workout.id)}
                  aria-expanded={open}
                  className="flex min-h-14 w-full items-center gap-3 py-3 text-start"
                >
                  <span className="flex-1">
                    <span className="block text-base font-semibold">
                      {workout.name?.trim() || 'Workout'}
                    </span>
                    <span className="tnum block text-xs text-muted">
                      {formatWorkoutDate(workout.started_at)} ·{' '}
                      {formatTime(workout.started_at)} ·{' '}
                      {formatDuration(workout.started_at, workout.ended_at)}
                    </span>
                  </span>
                  <span className="text-sm text-muted">{open ? '–' : '+'}</span>
                </button>

                {open && (
                  <div className="pb-3">
                    {!sets ? (
                      <p className="text-sm text-muted">Loading sets…</p>
                    ) : sets.length === 0 ? (
                      <p className="text-sm text-muted">
                        This workout has no sets recorded.
                      </p>
                    ) : (
                      <ExerciseBreakdown sets={sets} unit={unit} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!done && workouts.length > 0 && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="h-12 w-full rounded-lg border border-line text-sm font-semibold disabled:opacity-60"
        >
          {loadingMore ? 'Loading…' : 'Load older workouts'}
        </button>
      )}
    </div>
  )
}

function ExerciseBreakdown({
  sets,
  unit,
}: {
  sets: SetWithExercise[]
  unit: 'lbs' | 'kg'
}) {
  const order: string[] = []
  const grouped = new Map<string, SetWithExercise[]>()
  for (const set of sets) {
    const name = set.exercises?.name ?? 'Exercise'
    if (!grouped.has(name)) {
      grouped.set(name, [])
      order.push(name)
    }
    grouped.get(name)!.push(set)
  }

  return (
    <div className="flex flex-col gap-3">
      {order.map((name) => (
        <div key={name}>
          <p className="text-sm font-semibold">{name}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {grouped.get(name)!.map((set, index) => (
              <li key={set.id} className="tnum flex items-baseline gap-3 text-base">
                <span className="w-5 text-xs text-muted">{index + 1}</span>
                <span className="flex-1">{describeSet(set, unit)}</span>
                {set.set_type !== 'normal' && (
                  <span className="text-xs text-muted">{set.set_type}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function describeSet(set: SetWithExercise, unit: 'lbs' | 'kg'): string {
  const parts: string[] = []
  if (set.weight_kg !== null) parts.push(`${formatWeight(set.weight_kg, unit)} ${unit}`)
  if (set.reps !== null) parts.push(`${set.reps} reps`)
  if (set.duration_seconds !== null) parts.push(formatSeconds(set.duration_seconds))
  if (set.distance_meters !== null) parts.push(`${set.distance_meters} m`)
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}
