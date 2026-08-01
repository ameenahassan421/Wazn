import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, PreviousSessionRow, WorkoutSet } from '../lib/types'
import { formatRelativeDay } from '../lib/format'
import { formatWeight, fromDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'

/** Stepper increments, in the unit on screen. */
const WEIGHT_STEP: Record<Unit, number> = { lbs: 5, kg: 2.5 }

interface Draft {
  weight: string
  reps: string
}

function draftFromWeight(kg: number | null, reps: number | null, unit: Unit): Draft {
  return {
    weight: kg === null ? '' : formatWeight(kg, unit),
    reps: reps === null ? '' : String(reps),
  }
}

function StepperButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      className="h-16 w-14 shrink-0 rounded-lg border border-line bg-surface text-2xl font-semibold text-text disabled:opacity-40"
    >
      {label.startsWith('Decrease') ? '−' : '+'}
    </button>
  )
}

export function SetEntry({
  exercise,
  unit,
  setsThisWorkout,
  previousSession,
  previousLoading,
  saving,
  onAddSet,
  onBack,
}: {
  exercise: Exercise
  unit: Unit
  setsThisWorkout: WorkoutSet[]
  previousSession: PreviousSessionRow[]
  previousLoading: boolean
  saving: boolean
  onAddSet: (values: { weightKg: number | null; reps: number }) => Promise<boolean>
  onBack: () => void
}) {
  const [draft, setDraft] = useState<Draft>({ weight: '', reps: '' })
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)

  const lastLogged = setsThisWorkout.at(-1)
  const lastPrevious = previousSession.at(-1)

  // Seed once per exercise: this workout's last set for it, else last session's.
  useEffect(() => {
    setSeeded(false)
    setDraft({ weight: '', reps: '' })
    setError(null)
  }, [exercise.id])

  useEffect(() => {
    // Wait for the previous session to arrive, otherwise the first render
    // would seed from nothing and the auto-fill would never happen.
    if (seeded || previousLoading) return
    const source = lastLogged ?? lastPrevious
    if (source) {
      setDraft(draftFromWeight(source.weight_kg, source.reps, unit))
    }
    setSeeded(true)
  }, [seeded, previousLoading, lastLogged, lastPrevious, unit])

  // Flipping the header toggle mid-set converts what is already typed rather
  // than leaving 135 lbs sitting in a field now labelled kg.
  const previousUnit = useRef(unit)
  useEffect(() => {
    const from = previousUnit.current
    if (from === unit) return
    previousUnit.current = unit
    setDraft((d) => {
      if (d.weight.trim() === '') return d
      const parsed = Number.parseFloat(d.weight)
      if (!Number.isFinite(parsed)) return d
      return { ...d, weight: formatWeight(fromDisplayWeight(parsed, from), unit) }
    })
  }, [unit])

  const previousSummary = useMemo(() => {
    const working = previousSession.filter((s) => s.set_type !== 'warmup')
    const rows = working.length > 0 ? working : previousSession
    return rows
      .map((s) => {
        const weight = s.weight_kg === null ? 'BW' : formatWeight(s.weight_kg, unit)
        return s.reps === null ? weight : `${weight} × ${s.reps}`
      })
      .join(' · ')
  }, [previousSession, unit])

  function stepWeight(direction: 1 | -1) {
    const step = WEIGHT_STEP[unit]
    const current = Number.parseFloat(draft.weight)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.max(0, Math.round((base + direction * step) / step) * step)
    setDraft((d) => ({ ...d, weight: next === 0 ? '' : String(next) }))
  }

  function stepReps(direction: 1 | -1) {
    const current = Number.parseInt(draft.reps, 10)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.max(0, base + direction)
    setDraft((d) => ({ ...d, reps: next === 0 ? '' : String(next) }))
  }

  async function submit() {
    const reps = Number.parseInt(draft.reps, 10)
    if (!Number.isFinite(reps) || reps <= 0) {
      setError('Enter the reps you did. Weight can stay empty for bodyweight sets.')
      return
    }

    let weightKg: number | null = null
    if (draft.weight.trim() !== '') {
      const parsed = Number.parseFloat(draft.weight)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(`Weight must be a number in ${unit}, or empty for bodyweight.`)
        return
      }
      weightKg = Number(fromDisplayWeight(parsed, unit).toFixed(2))
    }

    setError(null)
    const ok = await onAddSet({ weightKg, reps })
    if (!ok) return
    // Values stay put so the next set is pre-filled with what was just logged.
  }

  return (
    <section className="flex flex-col gap-3 pb-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 truncate text-base font-semibold">{exercise.name}</h2>
        <button
          type="button"
          onClick={onBack}
          className="h-11 rounded-md px-2 text-sm text-muted"
        >
          Done
        </button>
      </div>

      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        {previousLoading ? (
          <p className="text-xs text-muted">Loading previous session…</p>
        ) : previousSession.length > 0 ? (
          <>
            <p className="text-xs text-muted">
              Previous · {formatRelativeDay(previousSession[0].started_at)}
            </p>
            <p className="tnum mt-0.5 text-sm">{previousSummary}</p>
          </>
        ) : (
          <p className="text-xs text-muted">
            First time logging this exercise. No previous session yet.
          </p>
        )}
      </div>

      {setsThisWorkout.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {setsThisWorkout.map((set) => (
            <li key={set.id} className="flex h-11 items-center gap-3 px-3">
              <span className="tnum w-6 text-sm text-muted">{set.set_number}</span>
              <span className="tnum flex-1 text-lg font-semibold">
                {set.weight_kg === null ? 'BW' : formatWeight(set.weight_kg, unit)}
                <span className="ms-2 text-sm font-normal text-muted">
                  {set.weight_kg === null ? '' : unit}
                </span>
              </span>
              <span className="tnum text-lg font-semibold">{set.reps ?? '—'}</span>
              <span className="text-sm text-muted">reps</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <StepperButton label="Decrease weight" onPress={() => stepWeight(-1)} />
          <div className="flex-1">
            <label htmlFor="weight" className="text-xs text-muted">
              Weight ({unit}) · optional
            </label>
            <input
              id="weight"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={draft.weight}
              onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
              placeholder="BW"
              className="tnum h-16 w-full rounded-lg border border-line bg-surface px-3 text-start text-3xl font-semibold outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <StepperButton label="Increase weight" onPress={() => stepWeight(1)} />
        </div>

        <div className="flex items-center gap-2">
          <StepperButton label="Decrease reps" onPress={() => stepReps(-1)} />
          <div className="flex-1">
            <label htmlFor="reps" className="text-xs text-muted">
              Reps
            </label>
            <input
              id="reps"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={draft.reps}
              onChange={(e) => setDraft((d) => ({ ...d, reps: e.target.value }))}
              placeholder="0"
              className="tnum h-16 w-full rounded-lg border border-line bg-surface px-3 text-start text-3xl font-semibold outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <StepperButton label="Increase reps" onPress={() => stepReps(1)} />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="h-16 w-full rounded-lg bg-accent text-xl font-bold text-accent-ink disabled:opacity-60"
      >
        {saving ? 'Saving…' : `Log set ${setsThisWorkout.length + 1}`}
      </button>
    </section>
  )
}
