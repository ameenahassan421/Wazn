import { useEffect, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import { formatRelativeDay, formatVolume } from '../lib/format'
import type { Exercise } from '../lib/types'
import { describeRest, resolveRest, stepRest } from '../lib/rest'
import { REST_STEP_SECONDS } from '../lib/use-rest-timer'
import { ExerciseThumb } from './ExerciseThumb'

/** One session's worth of this exercise, newest first. */
interface HistoryRow {
  workoutId: string
  startedAt: string
  sets: { weight_kg: number | null; reps: number | null; set_type: string }[]
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
}: {
  exercise: Exercise
  onBack: () => void
}) {
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
      .from('workout_sets')
      .select('weight_kg, reps, set_type, set_number, workouts!inner(id, started_at)')
      .eq('exercise_id', exerciseId)
      .order('set_number', { ascending: true })
      .limit(300)
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setError(describeError('Loading the history for that exercise', queryError))
          setHistory({ exerciseId, rows: [] })
          return
        }
        const bySession = new Map<string, HistoryRow>()
        for (const raw of (data ?? []) as unknown[]) {
          const row = raw as {
            weight_kg: number | null
            reps: number | null
            set_type: string
            workouts: { id: string; started_at: string }
          }
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
        setHistory({ exerciseId, rows: rows.slice(0, 8) })
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
        setError(writeError ? describeError('Saving the rest time', writeError) : null)
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
    if (deleteError) setError(describeError('Clearing the rest time', deleteError))
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
    setError(writeError ? describeError('Saving your note', writeError) : null)
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
        [formatWeight(num(rec.value.best_e1rm_kg), unit), 'est. 1RM'],
        [formatVolume(num(rec.value.best_session_volume_kg), unit), 'best session'],
      ]
    : []

  return (
    <section className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to progress"
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{exercise.name}</h2>
      </div>

      {error && (
        <p
          role="status"
          className="ring-edge border border-accent px-3 py-2 text-sm text-accent"
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
            <p className="mt-0.5 text-[15px] text-muted">Not logged yet</p>
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

      {/* Rest lives here because this is the lift's page, and in the timer bar
          because that is where the opinion forms. Same value, two doors. */}
      {restForThis !== null && (
        <div>
          <h3 className="kicker mb-2">Rest timer</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepRestBy(-1)}
              aria-label="Shorter rest"
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
              aria-label="Longer rest"
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
                Reset
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {restState?.override == null
              ? 'The app default. Change it and the timer uses your number for this lift from the next set on.'
              : `Yours${
                  exercise.default_rest_seconds
                    ? `, over the ${describeRest(exercise.default_rest_seconds)} default`
                    : ''
                }. Zero turns the timer off for this lift.`}
          </p>
        </div>
      )}

      {!rec?.missing && (
        <div>
          <h3 className="kicker mb-2">Notes</h3>
          <textarea
            value={noteText}
            onChange={(e) => setNote({ exerciseId, text: e.target.value })}
            onBlur={(e) => void saveNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Seat position, grip width, anything you keep re-deriving."
            className="ring-edge w-full resize-y bg-surface px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            style={{ borderRadius: 'var(--radius-md)' }}
          />
          <p className="mt-1 text-[11px] text-muted">
            {noteSaving ? 'Saving…' : 'Saved when you tap away.'}
          </p>
        </div>
      )}

      {instructions && instructions.length > 0 && (
        <div>
          <h3 className="kicker mb-2">How to</h3>
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
        <h3 className="kicker mb-2">Recent</h3>
        {hist === null ? (
          <p className="py-2 text-sm text-muted">Loading…</p>
        ) : hist.length === 0 ? (
          <p className="py-2 text-sm text-muted">
            No sets logged for this exercise yet.
          </p>
        ) : (
          <ul>
            {hist.map((session, i) => {
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
