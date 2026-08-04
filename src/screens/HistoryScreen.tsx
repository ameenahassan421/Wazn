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
import { isRecord } from '../lib/types'
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

/** Numerics arrive from PostgREST as strings; convert once, at the edge. */
interface WorkoutTotalsRow {
  workout_id: string
  volume_kg: number | string
  set_count: number | string
  record_count: number | string
}

interface WorkoutTotals {
  volumeKg: number
  setCount: number
  recordCount: number
}

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
  // Volume, set count and records per workout, so a collapsed row can say what
  // the session was without expanding it. One call for the whole history —
  // 154 rows today — rather than one per page, because the user scrolls back
  // faster than a paged aggregate can keep up.
  const [totals, setTotals] = useState<Record<string, WorkoutTotals>>({})

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
    void refreshRecords(set.workout_id)
  }

  /**
   * A correction can promote or demote records anywhere after it — dropping a
   * typo'd 150 kg to 50 kg hands the record to whatever came next. The
   * database rebuilds the flags (migration 0009); the client has to go and
   * look, because the patched local copy still carries the old ones.
   *
   * Deliberately after the local patch, not instead of it: the row updates
   * instantly and the badges settle a moment later. Refetching first would
   * make a one-field correction feel like a page load.
   */
  async function refreshRecords(workoutId: string) {
    const [{ data: setRows }, totalRows] = await Promise.all([
      supabase
        .from('workout_sets')
        .select('*, exercises(id, name, muscle_group, equipment, image_url)')
        .eq('workout_id', workoutId)
        .order('set_number'),
      loadTotals(),
    ])
    if (setRows) {
      setSetsByWorkout((prev) => ({
        ...prev,
        [workoutId]: setRows as SetWithExercise[],
      }))
    }
    setTotals(totalRows)
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
    void refreshRecords(set.workout_id)
  }

  const loadTotals = useCallback(async () => {
    const { data } = await supabase.rpc('workout_totals')
    const next: Record<string, WorkoutTotals> = {}
    for (const row of (data ?? []) as WorkoutTotalsRow[]) {
      next[row.workout_id] = {
        volumeKg: Number(row.volume_kg),
        setCount: Number(row.set_count),
        recordCount: Number(row.record_count),
      }
    }
    return next
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      // Both at once: the totals RPC is independent of the page, and making
      // the list wait for it would put a spinner in front of the whole screen
      // for the sake of one line of secondary text.
      const [page, totalRows] = await Promise.all([fetchPage(0), loadTotals()])
      if (!active) return
      if (page) {
        setWorkouts(page)
        setDone(page.length < PAGE_SIZE)
      }
      setTotals(totalRows)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [fetchPage, loadTotals])

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
                  className="flex min-h-[68px] w-full items-center gap-3 py-2.5 text-start"
                >
                  <span className="min-w-0 flex-1">
                    {/* The date leads, in mono, because History is scanned by
                        when — the name is what you read once you have found
                        the session. */}
                    <span className="kicker block">
                      {formatWorkoutDate(workout.started_at)} ·{' '}
                      {formatTime(workout.started_at)}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-base font-medium">
                        {workout.name?.trim() || 'Workout'}
                      </span>
                      {totals[workout.id]?.recordCount ? (
                        <span
                          className="tag-pr h-[22px] shrink-0"
                          title={`${totals[workout.id].recordCount} personal record${
                            totals[workout.id].recordCount === 1 ? '' : 's'
                          }`}
                        >
                          {totals[workout.id].recordCount === 1
                            ? 'PR'
                            : `${totals[workout.id].recordCount} PR`}
                        </span>
                      ) : null}
                    </span>
                    {/* Volume is the number that makes one session comparable
                        to another, and it was the thing History could not tell
                        you without expanding every row. */}
                    <span className="tnum mt-0.5 block text-[13px] text-muted">
                      {formatDuration(workout.started_at, workout.ended_at)}
                      {totals[workout.id] && (
                        <>
                          {' · '}
                          {formatWeight(totals[workout.id].volumeKg, unit)}
                          {' · '}
                          {totals[workout.id].setCount}{' '}
                          {totals[workout.id].setCount === 1 ? 'set' : 'sets'}
                        </>
                      )}
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
                  <li
                    key={set.id}
                    className={`tnum flex items-center gap-3 text-sm ${
                      isRecord(set) ? 'record-row -mx-1.5 rounded-[6px] px-1.5' : ''
                    }`}
                  >
                    <span className="w-4 shrink-0 text-[11px] text-muted">
                      {index + 1}
                    </span>
                    <span className="flex-1">{describeSet(set, unit)}</span>
                    {/* No flash in History — the record already happened. The
                        persistent tint is the whole point of storing it. */}
                    {isRecord(set) && (
                      <span
                        className="tag-pr h-[20px] shrink-0"
                        title="Personal record"
                      >
                        PR
                      </span>
                    )}
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
