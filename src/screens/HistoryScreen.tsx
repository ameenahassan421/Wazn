import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '../lib/locale-context'
import { describeError, supabase } from '../lib/supabase'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import {
  formatCount,
  formatDuration,
  formatSeconds,
  formatTime,
  formatVolumeWithUnit,
  formatWorkoutDate,
} from '../lib/format'
import { PlateRing, PlateSilhouette } from '../components/icons'
import type { Exercise, Workout, WorkoutSet } from '../lib/types'
import { isRecord } from '../lib/types'
import type { SessionVolumeRow } from '../lib/progress'
import { nextSetNumber, prefillFor, routineFromWorkout } from '../lib/history-edit'
import { saveRoutine } from '../lib/routines'
import { ExercisePicker } from '../components/ExercisePicker'
import { EditSetDialog } from '../components/EditSetDialog'
import type { SetEdit } from '../components/EditSetDialog'
import { ExerciseThumb } from '../components/ExerciseThumb'
import { TrainingCalendar } from '../components/TrainingCalendar'
import { WorkoutNotes } from '../components/WorkoutNotes'
import { IconChevronDown } from '../components/icons'

const PAGE_SIZE = 30

/** The translator handed to plain functions and child components. */
type TFunction = (key: string, params?: Record<string, string>) => string

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

export function HistoryScreen({ onStart }: { onStart: () => void }) {
  const { unit } = useUnit()
  const { t } = useLocale()

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  /** Workouts whose sets fetch failed, so the row can offer a retry. */
  const [setsFailed, setSetsFailed] = useState<Set<string>>(new Set())
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  // Confirmation for the two destructive controls, and the one-line receipt
  // after a routine is saved. Both clear when edit mode closes.
  const [confirmDeleteWorkout, setConfirmDeleteWorkout] = useState<string | null>(null)
  const [savedRoutine, setSavedRoutine] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  // Fetched the first time the picker is opened, not on every History open:
  // this screen is a reading surface and 134 rows is not free on gym data.
  const [catalogue, setCatalogue] = useState<Exercise[]>([])
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
  // The whole finished-workout series, for the calendar above the list. It is
  // one row per workout — 154 today — and it is the same RPC Progress reads,
  // so the heatmap and the volume chart can never tell different stories.
  const [sessions, setSessions] = useState<SessionVolumeRow[]>([])

  const fetchPage = useCallback(
    async (offset: number) => {
      const { data, error: pageError } = await supabase
        .from('workouts')
        .select('*')
        .order('started_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (pageError) {
        setError(describeError(t('history.error.load_history'), pageError))
        return null
      }
      return (data ?? []) as Workout[]
    },
    [t],
  )

  /**
   * Editing history writes straight through — there is no draft state to keep
   * in sync, and a correction is a single field. The local copy is patched
   * rather than refetched so an open workout does not collapse under you.
   */
  async function saveSet(set: SetWithExercise, edit: SetEdit) {
    setBusy(true)
    const patch = {
      weight_kg: edit.weightKg,
      reps: edit.reps,
      set_type: edit.setType,
      rpe: edit.rpe,
    }
    const { error: updateError } = await supabase
      .from('workout_sets')
      .update(patch)
      .eq('id', set.id)
    setBusy(false)
    if (updateError) {
      setError(describeError(t('history.error.save_correction'), updateError))
      return
    }
    setSetsByWorkout((prev) => ({
      ...prev,
      [set.workout_id]: (prev[set.workout_id] ?? []).map((s) =>
        s.id === set.id ? { ...s, ...patch } : s,
      ),
    }))
    setEditing(null)
    // A set type change moves a set in or out of the record and chart maths,
    // exactly as a weight change does, so the same self-heal covers both.
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
    const [{ data: setRows }, totalRows, history] = await Promise.all([
      supabase
        .from('workout_sets')
        .select('*, exercises(id, name, muscle_group, equipment, image_url)')
        .eq('workout_id', workoutId)
        .order('set_number'),
      loadTotals(),
      // The calendar is drawn from volume, and a correction changes volume.
      // Same round trip, so it costs nothing to keep the grid honest.
      supabase.rpc('session_volume_history'),
    ])
    if (setRows) {
      setSetsByWorkout((prev) => ({
        ...prev,
        [workoutId]: setRows as SetWithExercise[],
      }))
    }
    setTotals(totalRows)
    if (history.data) setSessions(history.data as SessionVolumeRow[])
  }

  /**
   * Add a set to a finished workout, prefilled from the last working set of
   * that exercise that day. The id is client-generated for the same reason
   * U3a's are: it is the primary key, so a replay is idempotent.
   */
  async function addSet(workoutId: string, exerciseId: string) {
    const sets = setsByWorkout[workoutId] ?? []
    const prefill = prefillFor(sets, exerciseId)
    setBusy(true)
    const { data, error: insertError } = await supabase
      .from('workout_sets')
      .insert({
        id: crypto.randomUUID(),
        workout_id: workoutId,
        exercise_id: exerciseId,
        set_number: nextSetNumber(sets),
        weight_kg: prefill.weightKg,
        reps: prefill.reps,
        set_type: 'normal',
      })
      .select('*, exercises(id, name, muscle_group, equipment, image_url)')
      .single()
    setBusy(false)
    if (insertError || !data) {
      setError(describeError(t('history.error.add_set'), insertError))
      return
    }
    setSetsByWorkout((prev) => ({
      ...prev,
      [workoutId]: [...(prev[workoutId] ?? []), data as SetWithExercise],
    }))
    // Opened straight into the editor: a prefilled set is a starting point, and
    // the reason to add one is almost always that the numbers were different.
    setEditing(data as SetWithExercise)
    void refreshRecords(workoutId)
  }

  /**
   * Delete a whole workout.
   *
   * `workout_sets.workout_id` cascades, so its sets go with it. That is the
   * intent: this is the exit for a session that should not be in the history at
   * all. Two taps, and the row leaves the list immediately rather than after a
   * refetch, so it cannot be tapped twice.
   */
  async function removeWorkout(workoutId: string) {
    setBusy(true)
    const { error: deleteError } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId)
    setBusy(false)
    if (deleteError) {
      setError(describeError(t('history.error.delete_workout'), deleteError))
      return
    }
    setWorkouts((prev) => prev.filter((w) => w.id !== workoutId))
    setCorrecting(null)
    setExpanded(null)
    const [totalRows, history] = await Promise.all([
      loadTotals(),
      supabase.rpc('session_volume_history'),
    ])
    setTotals(totalRows)
    if (history.data) setSessions(history.data as SessionVolumeRow[])
  }

  /**
   * Save this session's shape as a routine.
   *
   * Reps and set types carry, weight does not: see `routineFromWorkout`. The
   * new routine is NOT started or activated, matching the rule the AI generator
   * follows, because turning "save this as a routine" into "you are now doing
   * this" would be a decision the user did not make.
   */
  async function saveAsRoutine(workout: Workout, t: TFunction) {
    const sets = setsByWorkout[workout.id] ?? []
    const draft = routineFromWorkout(
      sets,
      workout.name,
      formatWorkoutDate(workout.started_at),
    )
    if (!draft) {
      setError(t('history.no_routine_sets'))
      return
    }
    setBusy(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      const userId = user.user?.id
      if (!userId) throw new Error(t('history.signin_required'))
      await saveRoutine(userId, draft)
      setSavedRoutine(draft.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('history.routine_save_error'))
    }
    setBusy(false)
  }

  /**
   * Loads the exercise list once, the first time the picker is opened.
   *
   * Returns whether there is a catalogue to show, and surfaces its own error.
   * It used to discard the error entirely (`const { data } = ...`) while the
   * caller opened the full-screen picker without awaiting it — so a failed or
   * slow fetch put up an empty overlay whose own empty state reads
   * `No exercise matches ""`, with nothing said about what went wrong and no
   * way to retry.
   */
  async function openCatalogue(): Promise<boolean> {
    if (catalogue.length > 0) return true
    const { data, error: failure } = await supabase
      .from('exercises')
      .select('*')
      .order('name')
    if (failure) {
      setError(describeError(t('history.error.catalogue'), failure))
      return false
    }
    setCatalogue((data ?? []) as Exercise[])
    // Success is success, even with nothing in it. Returning `rows.length > 0`
    // made a legitimately empty catalogue indistinguishable from a failure, so
    // the button did nothing at all and said nothing either — the picker has
    // its own empty state and is the honest place to land.
    return true
  }

  async function removeSet(set: SetWithExercise) {
    setBusy(true)
    const { error: deleteError } = await supabase
      .from('workout_sets')
      .delete()
      .eq('id', set.id)
    setBusy(false)
    if (deleteError) {
      setError(describeError(t('history.error.delete_set'), deleteError))
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
      // All at once: neither aggregate depends on the page, and making the
      // list wait for them would put a spinner in front of the whole screen
      // for the sake of one line of secondary text.
      const [page, totalRows, history] = await Promise.all([
        fetchPage(0),
        loadTotals(),
        supabase.rpc('session_volume_history'),
      ])
      if (!active) return
      if (page) {
        setWorkouts(page)
        setDone(page.length < PAGE_SIZE)
      }
      setTotals(totalRows)
      // A failed calendar is not a failed History: the list is the screen's
      // job, so an empty grid is drawn rather than an error banner raised.
      setSessions((history.data ?? []) as SessionVolumeRow[])
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
    await loadSets(workoutId)
  }

  /**
   * Fetch one workout's sets, and remember if it fails.
   *
   * The failure has to be recorded per workout, not just announced. Absence
   * from `setsByWorkout` is what the expansion reads as "still loading", so a
   * fetch that errored and returned left the row saying "Loading sets…"
   * forever — with a banner at the top of a screen the reader may have
   * scrolled well past, and nothing to press.
   */
  async function loadSets(workoutId: string) {
    setSetsFailed((prev) => {
      if (!prev.has(workoutId)) return prev
      const next = new Set(prev)
      next.delete(workoutId)
      return next
    })

    const { data, error: setsError } = await supabase
      .from('workout_sets')
      .select('*, exercises(id, name, muscle_group, equipment, image_url)')
      .eq('workout_id', workoutId)
      .order('set_number')

    if (setsError) {
      setError(describeError(t('history.error.load_sets'), setsError))
      setSetsFailed((prev) => new Set(prev).add(workoutId))
      return
    }
    setSetsByWorkout((prev) => ({
      ...prev,
      [workoutId]: (data ?? []) as SetWithExercise[],
    }))
  }

  if (loading) return <p className="py-10 text-sm text-muted">{t('chrome.loading')}</p>

  return (
    <div className="flex flex-col gap-3 py-3">
      {error && (
        <p
          role="alert"
          className="border border-accent px-3 py-2 text-sm text-accent-300"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <TrainingCalendar sessions={sessions} unit={unit} />

      {workouts.length === 0 ? (
        /* The design's screen 18. It replaces a line of muted text that told
           the reader to "log one on the Log tab" — a tab that no longer
           exists, and an instruction with nothing to press either way. An
           empty screen that names the thing you came for and then offers no
           way to get it is the emptiest kind. */
        <div className="flex flex-col items-center px-4 py-14 text-center">
          <PlateSilhouette size={120} className="text-text opacity-[0.14]" />
          <h2 className="font-display mt-7 text-[26px] font-extrabold tracking-[-0.03em]">
            {t('history.empty')}
          </h2>
          <p className="mt-2.5 max-w-[280px] text-sm leading-relaxed text-muted">
            {t('history.empty.body')}
          </p>
          <button
            type="button"
            onClick={onStart}
            className="btn-base btn-hero press mt-7 flex h-[52px] items-center justify-center gap-2.5 px-7 text-[15px] font-bold"
            style={{
              borderRadius: 'var(--radius-pill)',
              boxShadow: 'var(--shadow-cta)',
            }}
          >
            <PlateRing size={18} className="shrink-0" />
            <span>{t('history.empty.cta')}</span>
          </button>
        </div>
      ) : (
        <ul>
          {workouts.map((workout, i) => {
            const open = expanded === workout.id
            const sets = setsByWorkout[workout.id]
            // tabIndex so focus has somewhere to go when the "Add exercise"
            // button disables itself mid-await.
            return (
              <li key={workout.id} tabIndex={-1}>
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
                        {workout.name?.trim() || t('history.workout_fallback')}
                      </span>
                      {totals[workout.id]?.recordCount ? (
                        <span
                          className="tag-pr h-[22px] shrink-0"
                          title={
                            totals[workout.id].recordCount === 1
                              ? t('history.pr_title', {
                                  count: String(totals[workout.id].recordCount),
                                })
                              : t('history.pr_title_plural', {
                                  count: String(totals[workout.id].recordCount),
                                })
                          }
                        >
                          {totals[workout.id].recordCount === 1
                            ? 'PR'
                            : `${formatCount(totals[workout.id].recordCount)} PR`}
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
                          {formatVolumeWithUnit(totals[workout.id].volumeKg, unit)}
                          {' · '}
                          {formatCount(totals[workout.id].setCount)}{' '}
                          {totals[workout.id].setCount === 1
                            ? t('history.set')
                            : t('history.sets')}
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
                    {/* The note reads without entering edit mode — it is the
                        reason you scrolled back to this session — and is
                        rewritten under the same toggle the set corrections
                        live behind. */}
                    {workout.notes && correcting !== workout.id && (
                      <p className="mb-3 whitespace-pre-line border-s-2 border-[color:var(--color-accent-800)] ps-3 text-[13px] leading-relaxed text-text/85">
                        {workout.notes}
                      </p>
                    )}

                    {!sets && setsFailed.has(workout.id) ? (
                      <button
                        type="button"
                        onClick={() => void loadSets(workout.id)}
                        className="btn-base btn-secondary h-12 px-4 text-sm"
                      >
                        {t('history.sets_retry')}
                      </button>
                    ) : !sets ? (
                      <p className="text-sm text-muted">{t('history.loading_sets')}</p>
                    ) : sets.length === 0 ? (
                      <p className="text-sm text-muted">{t('history.no_sets')}</p>
                    ) : (
                      <ExerciseBreakdown
                        sets={sets}
                        unit={unit}
                        editable={correcting === workout.id}
                        onEditSet={setEditing}
                        onDeleteSet={(s) => void removeSet(s)}
                        onAddSet={
                          correcting === workout.id
                            ? (exerciseId) => void addSet(workout.id, exerciseId)
                            : undefined
                        }
                        busy={busy}
                        t={t}
                      />
                    )}

                    {correcting === workout.id && (
                      <div className="mt-3.5">
                        <WorkoutNotes
                          workoutId={workout.id}
                          initialName={workout.name}
                          initialNote={workout.notes ?? null}
                          onSaved={(values) =>
                            setWorkouts((prev) =>
                              prev.map((w) =>
                                w.id === workout.id ? { ...w, ...values } : w,
                              ),
                            )
                          }
                        />
                      </div>
                    )}

                    {/* Whole-session actions, revealed with the per-set ones.
                        Adding an exercise reuses the picker rather than a
                        second chooser: it already knows how to filter and
                        search, and a lighter one here would be a worse
                        version of it. */}
                    {correcting === workout.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            // Awaited, so the overlay never opens onto an
                            // empty list. `busy` carries the wait, which is
                            // what the button already uses to say so.
                            //
                            // The blur is deliberate: disabling the button the
                            // reader just pressed drops focus onto <body>, so
                            // a keyboard or switch user lands back at the top
                            // of the document. Moving focus to the row first
                            // keeps them where they were.
                            event.currentTarget.closest('li')?.focus()
                            setBusy(true)
                            void openCatalogue()
                              .then((ready) => {
                                if (ready) setAddingTo(workout.id)
                              })
                              .finally(() => setBusy(false))
                          }}
                          disabled={busy}
                          className="btn-base btn-secondary h-11 px-4 text-sm"
                        >
                          {t('history.add_exercise')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveAsRoutine(workout, t)}
                          disabled={busy}
                          className="btn-base btn-secondary h-11 px-4 text-sm"
                        >
                          {t('history.save_routine')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmDeleteWorkout !== workout.id) {
                              setConfirmDeleteWorkout(workout.id)
                              return
                            }
                            void removeWorkout(workout.id)
                          }}
                          disabled={busy}
                          className={`btn-base h-11 px-4 text-sm ${
                            confirmDeleteWorkout === workout.id
                              ? 'btn-primary'
                              : 'btn-quiet'
                          }`}
                        >
                          {confirmDeleteWorkout === workout.id
                            ? t('history.delete_workout.confirm')
                            : t('history.delete_workout')}
                        </button>
                      </div>
                    )}

                    {savedRoutine && correcting === workout.id && (
                      <p role="status" className="mt-2 text-[13px] text-accent-300">
                        {t('history.routine_saved', { name: savedRoutine })}
                      </p>
                    )}

                    {/* Correcting a session is rare and destructive; it does
                        not deserve buttons on every row of every workout. One
                        entry point per workout reveals them — and now the
                        name and note too, so there is one way in rather than
                        two competing ones. */}
                    <button
                      type="button"
                      onClick={() => {
                        const leaving = correcting === workout.id
                        setCorrecting(leaving ? null : workout.id)
                        // Leaving edit mode disarms and clears the receipt, so
                        // reopening never presents a primed destructive control
                        // or a stale confirmation.
                        setConfirmDeleteWorkout(null)
                        setSavedRoutine(null)
                      }}
                      className="btn-base btn-secondary mt-3 h-11 px-4 text-sm"
                    >
                      {correcting === workout.id
                        ? t('history.edit_done')
                        : t('history.edit')}
                    </button>
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
          {loadingMore ? t('chrome.loading') : t('history.load_more')}
        </button>
      )}

      {/* Adding an exercise to a finished session is picking one, then adding
          its first set: an exercise is present in a workout only by virtue of
          its sets, so there is nothing else to write. Reuses the real picker
          rather than a lighter chooser, which would be a worse version of the
          one that already knows how to search and filter. */}
      {addingTo && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-ink px-[18px]">
          <div className="mx-auto w-full max-w-[430px]">
            <ExercisePicker
              exercises={catalogue}
              usage={new Map()}
              onPick={(exercise) => {
                const workoutId = addingTo
                setAddingTo(null)
                void addSet(workoutId, exercise.id)
              }}
              onCancel={() => setAddingTo(null)}
            />
          </div>
        </div>
      )}

      {editing && (
        <EditSetDialog
          exerciseName={editing.exercises?.name ?? t('history.exercise_fallback')}
          weightKg={editing.weight_kg}
          reps={editing.reps}
          unit={unit}
          busy={busy}
          setType={editing.set_type}
          rpe={editing.rpe}
          onSave={(edit) => void saveSet(editing, edit)}
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
  onAddSet,
  busy,
  t,
}: {
  sets: SetWithExercise[]
  unit: 'lbs' | 'kg'
  /** Per-row correction buttons appear only while the workout is being edited. */
  editable: boolean
  onEditSet: (set: SetWithExercise) => void
  onDeleteSet: (set: SetWithExercise) => void
  /** Absent outside edit mode, which is what hides the control. */
  onAddSet?: (exerciseId: string) => void
  busy?: boolean
  t: TFunction
}) {
  /*
   * Grouped by exercise_id, not by name.
   *
   * Keying on the name meant a set whose embedded exercise was missing fell
   * back to the literal string "Exercise", and every such set from every
   * different lift collapsed into ONE block under that header. A screenshot
   * showed 18 sets of four lifts merged into a single group called "Exercise".
   * The id is the identity; the name is only how it is displayed.
   */
  const order: string[] = []
  const grouped = new Map<string, SetWithExercise[]>()
  for (const set of sets) {
    if (!grouped.has(set.exercise_id)) {
      grouped.set(set.exercise_id, [])
      order.push(set.exercise_id)
    }
    grouped.get(set.exercise_id)!.push(set)
  }

  return (
    <div className="flex flex-col gap-3.5">
      {order.map((exerciseId) => {
        const rows = grouped.get(exerciseId)!
        const exercise = rows.find((s) => s.exercises)?.exercises ?? null
        const name = exercise?.name ?? t('history.exercise_fallback')
        return (
          <div key={exerciseId} className="flex gap-3">
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
                    <span className="flex-1">{describeSet(set, unit, t)}</span>
                    {/* No flash in History — the record already happened. The
                        persistent tint is the whole point of storing it. */}
                    {isRecord(set) && (
                      <span
                        className="tag-pr h-[20px] shrink-0"
                        title={t('history.personal_record')}
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
                          aria-label={t('history.edit_set.aria', {
                            number: String(index + 1),
                            name,
                          })}
                          className="btn-base btn-quiet h-11 w-11 text-xs"
                        >
                          {t('history.edit_button')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSet(set)}
                          aria-label={t('history.delete_set.aria', {
                            number: String(index + 1),
                            name,
                          })}
                          className="btn-base btn-quiet h-11 w-9 text-xs"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {/* Per exercise, because "I forgot a set" is always about one
                  lift. Prefilled from that lift's last working set that day
                  and opened straight into the editor. */}
              {onAddSet && exercise && (
                <button
                  type="button"
                  onClick={() => onAddSet(exercise.id)}
                  disabled={busy}
                  className="btn-base btn-quiet mt-1 h-11 px-3 text-xs"
                >
                  {t('history.add_set')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function describeSet(set: SetWithExercise, unit: 'lbs' | 'kg', t: TFunction): string {
  const parts: string[] = []
  if (set.weight_kg !== null) parts.push(`${formatWeight(set.weight_kg, unit)} ${unit}`)
  if (set.reps !== null) parts.push(`${set.reps} ${t('history.reps')}`)
  if (set.duration_seconds !== null) parts.push(formatSeconds(set.duration_seconds))
  if (set.distance_meters !== null) parts.push(`${set.distance_meters} m`)
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}
