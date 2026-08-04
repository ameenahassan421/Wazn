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
import type { Exercise, Workout, WorkoutSet } from '../lib/types'
import { EditSetDialog } from '../components/EditSetDialog'
import { ExerciseThumb } from '../components/ExerciseThumb'
import { IconChevronDown } from '../components/icons'

const PAGE_SIZE = 30

/** The embedded exercise carries enough to draw a thumbnail, not the whole
 *  row — History pages through hundreds of sets and the rest is unused. */
type EmbeddedExercise = Pick<
  Exercise,
  'id' | 'name' | 'muscle_group' | 'equipment' | 'image_url'
>

type SetWithExercise = WorkoutSet & { exercises: EmbeddedExercise | null }

/** ExerciseThumb wants a full Exercise; the embed is all History fetches. */
function thumbExercise(e: EmbeddedExercise): Exercise {
  return { ...e, is_custom: false, owner_id: null, default_rest_seconds: null }
}

export function HistoryScreen() {
  const { unit } = useUnit()

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  // Which expanded workout is showing its per-row correction buttons.
  const [correcting, setCorrecting] = useState<string | null>(null)
  const [editing, setEditing] = useState<SetWithExercise | null>(null)
  const [busy, setBusy] = useState(false)
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

  /**
   * Editing history writes straight through — there is no draft state to keep
   * in sync, and a correction is a single field. The local copy is patched
   * rather than refetched so an open workout does not collapse under you.
   */
  async function saveSet(
    set: SetWithExercise,
    weightKg: number | null,
    reps: number | null,
  ) {
    setBusy(true)
    const { error: updateError } = await supabase
      .from('workout_sets')
      .update({ weight_kg: weightKg, reps })
      .eq('id', set.id)
    setBusy(false)
    if (updateError) {
      setError(describeError('Saving the correction', updateError))
      return
    }
    setSetsByWorkout((prev) => ({
      ...prev,
      [set.workout_id]: (prev[set.workout_id] ?? []).map((s) =>
        s.id === set.id ? { ...s, weight_kg: weightKg, reps } : s,
      ),
    }))
    setEditing(null)
  }

  async function removeSet(set: SetWithExercise) {
    setBusy(true)
    const { error: deleteError } = await supabase
      .from('workout_sets')
      .delete()
      .eq('id', set.id)
    setBusy(false)
    if (deleteError) {
      setError(describeError('Deleting the set', deleteError))
      return
    }
    setSetsByWorkout((prev) => ({
      ...prev,
      [set.workout_id]: (prev[set.workout_id] ?? []).filter((s) => s.id !== set.id),
    }))
  }

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
      .select('*, exercises(id, name, muscle_group, equipment, image_url)')
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
          className="border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      {workouts.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          No workouts yet. Log one on the Log tab and it will show up here.
        </p>
      ) : (
        <ul>
          {workouts.map((workout, i) => {
            const open = expanded === workout.id
            const sets = setsByWorkout[workout.id]
            return (
              <li key={workout.id}>
                {i > 0 && <div className="rule-fade" />}
                <button
                  type="button"
                  onClick={() => void toggle(workout.id)}
                  aria-expanded={open}
                  className="flex min-h-[60px] w-full items-center gap-3 py-2.5 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">
                      {workout.name?.trim() || 'Workout'}
                    </span>
                    <span className="tnum mt-0.5 block text-xs text-muted">
                      {formatWorkoutDate(workout.started_at)} ·{' '}
                      {formatTime(workout.started_at)} ·{' '}
                      {formatDuration(workout.started_at, workout.ended_at)}
                    </span>
                  </span>
                  <IconChevronDown
                    size={18}
                    className={`shrink-0 text-muted transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {open && (
                  <div className="pb-4">
                    {!sets ? (
                      <p className="text-sm text-muted">Loading sets…</p>
                    ) : sets.length === 0 ? (
                      <p className="text-sm text-muted">
                        This workout has no sets recorded.
                      </p>
                    ) : (
                      <>
                        <ExerciseBreakdown
                          sets={sets}
                          unit={unit}
                          editable={correcting === workout.id}
                          onEditSet={setEditing}
                          onDeleteSet={(s) => void removeSet(s)}
                        />
                        {/* Correcting a set is rare and destructive; it does
                            not deserve two buttons on every row of every
                            session. One entry point per workout reveals them. */}
                        <button
                          type="button"
                          onClick={() =>
                            setCorrecting(correcting === workout.id ? null : workout.id)
                          }
                          className="btn-base btn-secondary mt-3 h-10 px-4 text-sm"
                        >
                          {correcting === workout.id ? 'Done editing' : 'Edit sets'}
                        </button>
                      </>
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
          className="btn-base btn-secondary mt-2 h-[46px] w-full text-sm disabled:opacity-45"
        >
          {loadingMore ? 'Loading…' : 'Load older workouts'}
        </button>
      )}

      {editing && (
        <EditSetDialog
          exerciseName={editing.exercises?.name ?? 'Exercise'}
          weightKg={editing.weight_kg}
          reps={editing.reps}
          unit={unit}
          busy={busy}
          onSave={(w, r) => void saveSet(editing, w, r)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExerciseBreakdown({
  sets,
  unit,
  editable,
  onEditSet,
  onDeleteSet,
}: {
  sets: SetWithExercise[]
  unit: 'lbs' | 'kg'
  /** Per-row correction buttons appear only while the workout is being edited. */
  editable: boolean
  onEditSet: (set: SetWithExercise) => void
  onDeleteSet: (set: SetWithExercise) => void
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
    <div className="flex flex-col gap-3.5">
      {order.map((name) => {
        const rows = grouped.get(name)!
        const exercise = rows.find((s) => s.exercises)?.exercises ?? null
        return (
          <div key={name} className="flex gap-3">
            {exercise && <ExerciseThumb exercise={thumbExercise(exercise)} size={48} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              <ul className="mt-1 flex flex-col">
                {rows.map((set, index) => (
                  <li key={set.id} className="tnum flex items-center gap-3 text-sm">
                    <span className="w-4 shrink-0 text-[11px] text-muted">
                      {index + 1}
                    </span>
                    <span className="flex-1">{describeSet(set, unit)}</span>
                    {set.set_type !== 'normal' && (
                      <span className="shrink-0 text-[11px] text-muted">
                        {set.set_type}
                      </span>
                    )}
                    {editable && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEditSet(set)}
                          aria-label={`Edit set ${index + 1} of ${name}`}
                          className="btn-base btn-quiet h-11 w-11 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSet(set)}
                          aria-label={`Delete set ${index + 1} of ${name}`}
                          className="btn-base btn-quiet h-11 w-9 text-xs"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
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
