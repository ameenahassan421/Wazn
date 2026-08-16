import { useEffect, useState, useRef } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { useUnit } from '../lib/unit-context'
import { formatEstimate, formatWeight } from '../lib/units'
import { formatRelativeDay, formatVolume } from '../lib/format'
import type { Exercise, MuscleGroup, OneRepMaxPoint } from '../lib/types'
import { describeRest, resolveRest, stepRest } from '../lib/rest'
import { REST_STEP_SECONDS } from '../lib/use-rest-timer'
import { e1rmProgress, ladderBands, repMaxLadder } from '../lib/progress'
import {
  deleteCustomExercise,
  setExerciseArchived,
  updateCustomExercise,
} from '../lib/exercises'
import { ExerciseFields } from './ExerciseFields'
import { ExerciseThumb } from './ExerciseThumb'
import { SeriesChart } from './SeriesChart'
import { useLocale } from '../lib/locale-context'

/** One session's worth of this exercise, newest first. */
interface HistoryRow {
  workoutId: string
  startedAt: string
  sets: { weight_kg: number | null; reps: number | null; set_type: string }[]
}

/** `exercise_rep_distribution` (0007): one row per fixed rep bucket. */
interface RepBucketRow {
  bucket: string
  bucket_order: number
  set_count: number | string
}

interface Records {
  best_weight_kg: number | null
  best_e1rm_kg: number | null
  best_session_volume_kg: number | null
  total_sets: number
  total_sessions: number
  first_logged_at: string | null
}

function IconBack() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon-start"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

/**
 * Accent-ramp class per rep bucket, heaviest range brightest.
 *
 * Classes, not `var(--color-accent-${step})` composed here: Tailwind v4 prunes
 * theme tokens nothing statically references, so a runtime-built variable name
 * resolves to nothing and the bar renders empty. Defined in `index.css`, where
 * the reason is written out in full.
 */
const REP_RANGE_FILL = [
  'rep-fill-1',
  'rep-fill-2',
  'rep-fill-3',
  'rep-fill-4',
  'rep-fill-5',
]

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return Number.isFinite(n) ? n : null
}

/**
 * Everything known about one lift: what it is, how it has gone, what you
 * decided about it last time, and how to do it.
 *
 * Reached from the Progress > Strength row. Deliberately not reachable from
 * inside an active set-entry screen — §2.1 keeps the logging flow clear, and
 * this is reference material, not something to read between sets.
 */
export function ExerciseDetail({
  exercise,
  onBack,
  onChanged,
  onDeleted,
}: {
  exercise: Exercise
  onBack: () => void
  /** A renamed exercise has to reach the catalogue the caller is holding. */
  onChanged?: (exercise: Exercise) => void
  onDeleted?: (exerciseId: string) => void
}) {
  const { t } = useLocale()
  /**
   * `t` changes identity with the locale, and the effects below fetch. Adding
   * it to their deps would re-run a network load every time the language is
   * toggled, which is the bug LogScreen shipped and had to undo. The ref is
   * assigned in an effect rather than during render because
   * `react-hooks/refs` rejects a render-time write.
   */
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const { unit } = useUnit()
  useBackLayer(true, onBack)

  // Each piece of state carries the exercise it belongs to, so switching
  // exercises makes stale data inert rather than needing an effect to clear it.
  const [records, setRecords] = useState<{
    exerciseId: string
    value: Records | null
    missing: boolean
  } | null>(null)
  const [history, setHistory] = useState<{
    exerciseId: string
    rows: HistoryRow[]
  } | null>(null)
  // The estimated-1RM series, one point per session. Server-computed over the
  // lift's whole history rather than derived from the capped set query below,
  // because a trend that silently stops at 300 sets is a trend that lies.
  const [trend, setTrend] = useState<{
    exerciseId: string
    points: OneRepMaxPoint[]
  } | null>(null)
  // Which rep ranges this lift actually gets trained in. Server-computed
  // (migration 0007, live and until now unrendered) rather than bucketed on
  // the client: two implementations of one histogram is two sets of
  // boundaries to disagree about.
  const [spread, setSpread] = useState<{
    exerciseId: string
    rows: RepBucketRow[]
  } | null>(null)
  const [note, setNote] = useState<{ exerciseId: string; text: string } | null>(null)
  const [noteSaving, setNoteSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The user's own rest length for this lift, or null for "whatever the app
  // decides". Carries its exercise id for the same reason the others do.
  const [rest, setRest] = useState<{
    exerciseId: string
    override: number | null
  } | null>(null)
  const [restDirty, setRestDirty] = useState(false)
  // Editing a custom exercise. Held here rather than in a dialog: this is
  // already the lift's own page, and §2.1's objection to modals is about
  // interrupting, which nothing here does.
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(exercise.name)
  const [draftGroup, setDraftGroup] = useState<MuscleGroup>(exercise.muscle_group)
  const [draftEquipment, setDraftEquipment] = useState(exercise.equipment)
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDeleteExercise, setConfirmDeleteExercise] = useState(false)

  const exerciseId = exercise.id

  useEffect(() => {
    let active = true
    void supabase
      .rpc('exercise_records', { target_exercise: exerciseId })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) {
          // Migration 0008 not applied yet: show what does not depend on it
          // rather than failing the whole screen.
          setRecords({ exerciseId, value: null, missing: true })
          return
        }
        const row = (data as Records[] | null)?.[0] ?? null
        setRecords({ exerciseId, value: row, missing: false })
      })
    return () => {
      active = false
    }
  }, [exerciseId])

  useEffect(() => {
    let active = true
    void supabase
      .rpc('exercise_1rm_history', { p_exercise_id: exerciseId })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        // No card rather than an error: the records above and the history
        // below do not depend on this, and a lift with no series is a lift
        // with nothing to say about its trend.
        setTrend({
          exerciseId,
          points: rpcError ? [] : ((data as OneRepMaxPoint[] | null) ?? []),
        })
      })
    return () => {
      active = false
    }
  }, [exerciseId])

  useEffect(() => {
    let active = true
    void supabase
      .rpc('exercise_rep_distribution', { p_exercise_id: exerciseId })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        // Same posture as the trend: no section rather than an error, because
        // nothing else on the page depends on it.
        setSpread({
          exerciseId,
          rows: rpcError ? [] : ((data as RepBucketRow[] | null) ?? []),
        })
      })
    return () => {
      active = false
    }
  }, [exerciseId])

  useEffect(() => {
    let active = true
    void supabase
      .from('workout_sets')
      .select('weight_kg, reps, set_type, set_number, workouts!inner(id, started_at)')
      .eq('exercise_id', exerciseId)
      .order('set_number', { ascending: true })
      .limit(300)
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setError(describeError(tRef.current('detail.error.history'), queryError))
          setHistory({ exerciseId, rows: [] })
          return
        }
        const bySession = new Map<string, HistoryRow>()
        for (const raw of (data ?? []) as unknown[]) {
          const row = raw as {
            weight_kg: number | null
            reps: number | null
            set_type: string
            workouts: { id: string; started_at: string } | null
          }
          // A row whose embedded workout is missing is skipped, not thrown on.
          // Reading `row.workouts.id` unguarded rejected the promise, so
          // `setHistory` never ran and the section sat on "Loading…" for good
          // — the same hang shape as the Log tab's, and the error boundary
          // cannot catch a throw inside a `.then`.
          if (!row.workouts?.id) continue
          const existing = bySession.get(row.workouts.id)
          const set = {
            weight_kg: num(row.weight_kg),
            reps: row.reps,
            set_type: row.set_type,
          }
          if (existing) existing.sets.push(set)
          else
            bySession.set(row.workouts.id, {
              workoutId: row.workouts.id,
              startedAt: row.workouts.started_at,
              sets: [set],
            })
        }
        const rows = [...bySession.values()].sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt),
        )
        setError(null)
        // Every session in the fetched window, not the eight the list shows.
        // The rep-max ladder reads these, and a ladder computed from the last
        // eight sessions is not a record — it is the heaviest recent set
        // wearing the word "max". The list slices at render instead.
        setHistory({ exerciseId, rows })
      })
    return () => {
      active = false
    }
  }, [exerciseId])

  useEffect(() => {
    let active = true
    void supabase
      .from('exercise_notes')
      .select('note')
      .eq('exercise_id', exerciseId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        // A missing table (0008 unapplied) reads the same as no note here, and
        // both should land on an empty field rather than an error.
        setNote({ exerciseId, text: (data?.note as string | undefined) ?? '' })
      })
    return () => {
      active = false
    }
  }, [exerciseId])

  useEffect(() => {
    let active = true
    void supabase
      .from('exercise_rest')
      .select('rest_seconds')
      .eq('exercise_id', exerciseId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        // A missing table (0015 unapplied) reads the same as no override, and
        // both mean "fall back to the default" — so neither is an error here.
        setRest({
          exerciseId,
          override: (data?.rest_seconds as number | undefined) ?? null,
        })
        setRestDirty(false)
      })
    return () => {
      active = false
    }
  }, [exerciseId])

  /**
   * Written on a delay rather than on every tap: five taps of + is one
   * preference, not five round trips, and the number on screen is already
   * correct the moment it is pressed.
   */
  useEffect(() => {
    if (!restDirty || rest === null || rest.exerciseId !== exerciseId) return
    const seconds = rest.override
    if (seconds === null) return
    const id = setTimeout(() => {
      void (async () => {
        const { data: session } = await supabase.auth.getUser()
        const userId = session.user?.id
        if (!userId) return
        const { error: writeError } = await supabase.from('exercise_rest').upsert(
          {
            user_id: userId,
            exercise_id: exerciseId,
            rest_seconds: seconds,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,exercise_id' },
        )
        setError(
          writeError
            ? describeError(tRef.current('detail.error.rest_save'), writeError)
            : null,
        )
        setRestDirty(false)
      })()
    }, 600)
    return () => clearTimeout(id)
  }, [restDirty, rest, exerciseId])

  async function clearRest() {
    const { data: session } = await supabase.auth.getUser()
    const userId = session.user?.id
    if (!userId) return
    setRest({ exerciseId, override: null })
    setRestDirty(false)
    const { error: deleteError } = await supabase
      .from('exercise_rest')
      .delete()
      .eq('exercise_id', exerciseId)
      .eq('user_id', userId)
    if (deleteError) setError(describeError(t('detail.error.rest_clear'), deleteError))
  }

  async function saveNote(text: string) {
    const trimmed = text.trim()
    setNoteSaving(true)
    const { data: session } = await supabase.auth.getUser()
    const userId = session.user?.id
    if (!userId) {
      setNoteSaving(false)
      return
    }

    // An empty note is a deleted note — the table's check constraint rejects
    // blanks, and an empty card is indistinguishable from a real one.
    const { error: writeError } =
      trimmed === ''
        ? await supabase
            .from('exercise_notes')
            .delete()
            .eq('exercise_id', exerciseId)
            .eq('user_id', userId)
        : await supabase.from('exercise_notes').upsert(
            {
              user_id: userId,
              exercise_id: exerciseId,
              note: trimmed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,exercise_id' },
          )

    setNoteSaving(false)
    setError(writeError ? describeError(t('detail.error.note'), writeError) : null)
  }

  const restState = rest?.exerciseId === exerciseId ? rest : null
  const restForThis =
    restState === null
      ? null
      : resolveRest(exercise.default_rest_seconds, restState.override)

  function stepRestBy(direction: 1 | -1) {
    if (restForThis === null) return
    setRest({
      exerciseId,
      override: stepRest(restForThis, direction, REST_STEP_SECONDS),
    })
    setRestDirty(true)
  }

  const rec = records?.exerciseId === exerciseId ? records : null
  const hist = history?.exerciseId === exerciseId ? history.rows : null
  const noteText = note?.exerciseId === exerciseId ? note.text : ''
  const instructions = exercise.instructions ?? null

  const stats: [string, string][] = rec?.value
    ? [
        [formatWeight(num(rec.value.best_weight_kg), unit), 'best set'],
        // An estimate, not a load. `formatWeight` would snap it to the nearest
        // plate and print 116.75 where the coach says 116.7 — see units.ts.
        [formatEstimate(num(rec.value.best_e1rm_kg), unit), 'est. 1RM'],
        [formatVolume(num(rec.value.best_session_volume_kg), unit), 'best session'],
      ]
    : []

  // The draft follows the exercise during render rather than through an effect,
  // the pattern CLAUDE.md's state section requires: switching lifts while an
  // editor is open must not save one lift's name onto another.
  const [draftFor, setDraftFor] = useState(exerciseId)
  if (draftFor !== exerciseId) {
    setDraftFor(exerciseId)
    setEditing(false)
    setConfirmDeleteExercise(false)
    setDraftName(exercise.name)
    setDraftGroup(exercise.muscle_group)
    setDraftEquipment(exercise.equipment)
  }

  async function saveEdit() {
    setSavingEdit(true)
    setError(null)
    try {
      const updated = await updateCustomExercise(exerciseId, {
        name: draftName,
        muscleGroup: draftGroup,
        equipment: draftEquipment,
      })
      onChanged?.(updated)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('detail.error.save'))
    }
    setSavingEdit(false)
  }

  async function toggleArchived() {
    setSavingEdit(true)
    setError(null)
    try {
      const next = await setExerciseArchived(exerciseId, !exercise.archived_at)
      // The picker filters on this, so the catalogue upstream has to hear about
      // it or an archived lift stays listed until the tab is reloaded.
      onChanged?.({ ...exercise, archived_at: next })
    } catch (e) {
      // Until 0024 is applied this is the "needs migration" message, which is
      // how the app already reports 0008 and 0015 being absent.
      setError(e instanceof Error ? e.message : t('detail.error.archive'))
    }
    setSavingEdit(false)
  }

  async function removeExercise() {
    setSavingEdit(true)
    setError(null)
    try {
      await deleteCustomExercise(exerciseId)
      onDeleted?.(exerciseId)
      onBack()
    } catch (e) {
      // The on-delete-restrict refusal lands here, and it is not a failure so
      // much as an answer: the exercise is part of logged history.
      setError(e instanceof Error ? e.message : t('detail.error.delete'))
      setConfirmDeleteExercise(false)
    }
    setSavingEdit(false)
  }

  const buckets = spread?.exerciseId === exerciseId ? spread.rows : null
  const bucketMax = buckets
    ? Math.max(1, ...buckets.map((b) => Number(b.set_count)))
    : 1
  const bucketTotal = buckets
    ? buckets.reduce((sum, b) => sum + Number(b.set_count), 0)
    : 0

  const points = trend?.exerciseId === exerciseId ? trend.points : null
  const progress = points ? e1rmProgress(points) : null
  const ladder = hist
    ? ladderBands(
        repMaxLadder(
          hist.flatMap((row) =>
            row.sets.map((s) => ({ ...s, started_at: row.startedAt })),
          ),
        ),
      )
    : []

  return (
    <section className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('detail.back')}
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{exercise.name}</h2>
      </div>

      {error && (
        <p
          role="status"
          className="ring-edge border border-accent px-3 py-2 text-sm text-soft"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <ExerciseThumb exercise={exercise} size={80} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {exercise.muscle_group} · {exercise.equipment}
          </p>
          {rec?.value && rec.value.total_sets > 0 ? (
            <>
              <p className="tnum mt-0.5 text-[15px]">
                {rec.value.total_sets} sets · {rec.value.total_sessions} sessions
              </p>
              {rec.value.first_logged_at && (
                <p className="tnum text-xs text-muted">
                  Since {formatRelativeDay(rec.value.first_logged_at)}
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-[15px] text-muted">{t('detail.not_logged')}</p>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {stats.map(([value, label]) => (
            <li
              key={label}
              className="ring-edge bg-surface px-2.5 py-2.5"
              style={{ borderRadius: 'var(--radius-md)' }}
            >
              <p className="tnum text-2xl font-medium">{value}</p>
              <p className="mt-0.5 text-[10px] text-muted">{label}</p>
            </li>
          ))}
        </ul>
      )}

      {rec?.missing && (
        <p className="text-sm text-muted">
          Records and notes need migration 0008. Apply it and reload.
        </p>
      )}

      {/* The gate: "is this lift actually progressing?" answered in one
          sentence and one line, both off the same series so they cannot
          disagree. One session is not a trend, so the card waits for two. */}
      {points && progress && progress.sessions > 1 && (
        <section>
          <h3 className="kicker mb-2">{t('detail.e1rm')}</h3>
          <p className="tnum text-2xl font-medium">
            {progress.delta_kg === 0
              ? 'Level'
              : `${progress.delta_kg > 0 ? '+' : '−'}${formatEstimate(Math.abs(progress.delta_kg), unit)} ${unit}`}
            <span className="ms-2 text-xs font-normal text-muted">
              since {formatRelativeDay(progress.since_at)}
            </span>
          </p>
          <SeriesChart
            values={points.map((p) => Number(p.best_1rm_kg))}
            baseline="data"
            ariaLabel={t('detail.chart.aria', {
              sessions: String(progress.sessions),
              from: formatEstimate(progress.earliest_kg, unit),
              to: formatEstimate(progress.latest_kg, unit),
              unit,
            })}
          />
          <p className="tnum mt-1 text-[11px] text-muted">
            {progress.sessions} sessions · now{' '}
            {formatEstimate(progress.latest_kg, unit)} {unit}
            {progress.best_kg > progress.latest_kg &&
              ` · best ${formatEstimate(progress.best_kg, unit)} ${formatRelativeDay(progress.best_at)}`}
          </p>
        </section>
      )}

      {/* Where the work actually happens. The bars step down the accent ramp
          the way plates step down toward the sleeve (docs/design-philosophy),
          heaviest range brightest — one hue, five steps, no second colour. */}
      {buckets && bucketTotal > 0 && (
        <section>
          <h3 className="kicker mb-2">{t('detail.rep_ranges')}</h3>
          <div className="flex flex-col gap-1.5">
            {buckets.map((b, i) => {
              const count = Number(b.set_count)
              return (
                <div key={b.bucket} className="flex items-center gap-2">
                  <span className="tnum w-[46px] shrink-0 text-[13px] text-muted">
                    {b.bucket}
                  </span>
                  <span
                    className="relative block h-[14px] flex-1 overflow-hidden rounded-[3px]"
                    style={{ backgroundColor: 'var(--color-tile-1)' }}
                  >
                    <span
                      className={`absolute inset-block-0 start-0 block rounded-[3px] ${
                        REP_RANGE_FILL[i] ?? 'rep-fill-2'
                      }`}
                      style={{ width: `${(count / bucketMax) * 100}%` }}
                    />
                  </span>
                  <span className="tnum w-7 shrink-0 text-end font-mono text-[13px]">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="tnum mt-1.5 text-[11px] text-muted">
            {bucketTotal} working sets · warm-ups excluded
          </p>
        </section>
      )}

      {ladder.length > 0 && (
        <section>
          <h3 className="kicker mb-2">{t('detail.rep_maxes')}</h3>
          <ul
            className="ring-edge bg-surface"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            {ladder.map((rung) => (
              <li
                key={rung.label}
                className="flex items-baseline gap-3 border-b border-line px-3 py-2 last:border-b-0"
              >
                <span className="tnum w-12 shrink-0 text-xs text-muted">
                  {rung.label} rep
                </span>
                <span className="tnum flex-1 text-2xl font-medium">
                  {formatWeight(rung.best_weight_kg, unit)}
                  <span className="ms-1 text-xs font-normal text-muted">{unit}</span>
                </span>
                <span className="text-xs text-muted">
                  {formatRelativeDay(rung.achieved_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Only a custom exercise is editable. `exercises` is a shared catalogue
          and `exercises_update_own` (0014) refuses a seeded row, so offering
          the control would be offering a button that cannot work. */}
      {exercise.is_custom && (
        <section>
          <div className="flex items-center gap-2">
            <h3 className="kicker flex-1">{t('detail.your_exercise')}</h3>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="btn-base btn-secondary h-12 px-4 text-sm"
            >
              {editing ? t('detail.cancel') : t('detail.edit')}
            </button>
          </div>

          {editing && (
            <div className="mt-3 flex flex-col gap-4">
              <ExerciseFields
                idPrefix="edit-exercise"
                name={draftName}
                muscleGroup={draftGroup}
                equipment={draftEquipment}
                onName={setDraftName}
                onMuscleGroup={setDraftGroup}
                onEquipment={setDraftEquipment}
                nameHint={t('detail.name_hint')}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={savingEdit}
                  className="btn-base btn-hero h-14 flex-1 text-base"
                >
                  {savingEdit ? t('detail.saving') : t('detail.save')}
                </button>
                {/* Archive is the everyday exit and needs no confirmation:
                    it is reversible from this same screen, and the lift keeps
                    every set logged against it. Delete is the rare one, and
                    the database refuses it outright once anything has been
                    logged, so it sits behind a second tap. */}
                <button
                  type="button"
                  onClick={() => void toggleArchived()}
                  disabled={savingEdit}
                  className="btn-base btn-secondary h-14 px-4 text-sm"
                >
                  {exercise.archived_at ? t('detail.restore') : t('detail.archive')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDeleteExercise) {
                      setConfirmDeleteExercise(true)
                      return
                    }
                    void removeExercise()
                  }}
                  disabled={savingEdit}
                  className={`btn-base h-14 px-4 text-sm ${
                    confirmDeleteExercise ? 'btn-primary' : 'btn-quiet'
                  }`}
                >
                  {confirmDeleteExercise
                    ? t('detail.delete.confirm')
                    : t('detail.delete')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Rest lives here because this is the lift's page, and in the timer bar
          because that is where the opinion forms. Same value, two doors. */}
      {restForThis !== null && (
        <div>
          <h3 className="kicker mb-2">{t('detail.rest_timer')}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepRestBy(-1)}
              aria-label={t('detail.rest.shorter')}
              className="btn-base btn-secondary h-12 w-12 shrink-0 text-xl"
            >
              −
            </button>
            <span className="tnum flex-1 text-center text-figure">
              {describeRest(restForThis)}
            </span>
            <button
              type="button"
              onClick={() => stepRestBy(1)}
              aria-label={t('detail.rest.longer')}
              className="btn-base btn-secondary h-12 w-12 shrink-0 text-xl"
            >
              +
            </button>
            {restState !== null && restState.override !== null && (
              <button
                type="button"
                onClick={() => void clearRest()}
                className="btn-base btn-quiet h-12 shrink-0 px-2.5 text-[13px]"
              >
                {t('detail.reset')}
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {restState?.override == null
              ? t('detail.rest.default_note')
              : t('detail.rest.yours', {
                  over: exercise.default_rest_seconds
                    ? t('detail.rest.over_default', {
                        default: describeRest(exercise.default_rest_seconds),
                      })
                    : '',
                })}
          </p>
        </div>
      )}

      {!rec?.missing && (
        <div>
          <h3 className="kicker mb-2">{t('detail.notes')}</h3>
          <textarea
            value={noteText}
            onChange={(e) => setNote({ exerciseId, text: e.target.value })}
            onBlur={(e) => void saveNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t('detail.note.placeholder')}
            className="ring-edge w-full resize-y bg-surface px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            style={{ borderRadius: 'var(--radius-md)' }}
          />
          <p className="mt-1 text-[11px] text-muted">
            {noteSaving ? t('detail.saving') : t('detail.note.saved')}
          </p>
        </div>
      )}

      {instructions && instructions.length > 0 && (
        <div>
          <h3 className="kicker mb-2">{t('detail.how_to')}</h3>
          <ol className="flex flex-col gap-2.5">
            {instructions.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="tnum w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                <span className="flex-1 text-[13px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <h3 className="kicker mb-2">{t('detail.recent')}</h3>
        {hist === null ? (
          <p className="py-2 text-sm text-muted">{t('chrome.loading')}</p>
        ) : hist.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t('detail.empty')}</p>
        ) : (
          <ul>
            {hist.slice(0, 8).map((session, i) => {
              const working = session.sets.filter((s) => s.set_type !== 'warmup')
              const shown = working.length > 0 ? working : session.sets
              return (
                <li key={session.workoutId}>
                  {i > 0 && <div className="rule-fade" />}
                  <div className="flex items-baseline gap-3 py-2.5">
                    <span className="shrink-0 text-xs text-muted">
                      {formatRelativeDay(session.startedAt)}
                    </span>
                    <span className="tnum min-w-0 flex-1 text-sm">
                      {shown
                        .map((s) =>
                          s.weight_kg === null
                            ? 'BW'
                            : `${formatWeight(s.weight_kg, unit)} × ${s.reps ?? '—'}`,
                        )
                        .join(' · ')}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
