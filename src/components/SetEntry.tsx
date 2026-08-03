import { useMemo, useState } from 'react'
import type { Exercise, PreviousSessionRow, SetType, WorkoutSet } from '../lib/types'
import { SET_TYPE_CYCLE, SET_TYPE_LABEL, SET_TYPE_NAME } from '../lib/types'
import { formatRelativeDay } from '../lib/format'
import { formatWeight, fromDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import type { RestTimer } from '../lib/use-rest-timer'
import { RestTimerBar } from './RestTimer'
import { LoadHelper } from './LoadHelper'
import { ExerciseThumb } from './ExerciseThumb'

/** Stepper increments, in the unit on screen. */
const WEIGHT_STEP: Record<Unit, number> = { lbs: 5, kg: 2.5 }

/** One tap steps through these; 10 is "all out". Null clears it. */
const RPE_CHOICES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const

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
      className="btn-base btn-secondary h-[62px] w-[58px] shrink-0 bg-surface text-2xl disabled:opacity-45"
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
  timer,
  supersetGroup,
  onSuperset,
}: {
  exercise: Exercise
  unit: Unit
  setsThisWorkout: WorkoutSet[]
  previousSession: PreviousSessionRow[]
  previousLoading: boolean
  saving: boolean
  onAddSet: (values: {
    weightKg: number | null
    reps: number
    setType: SetType
    rpe: number | null
  }) => Promise<boolean>
  onBack: () => void
  /** Optional so existing tests and any non-workout use keep working. */
  timer?: RestTimer
  supersetGroup?: number | null
  onSuperset?: () => void
}) {
  const [draft, setDraft] = useState<Draft>({ weight: '', reps: '' })
  const [error, setError] = useState<string | null>(null)
  const [setType, setSetType] = useState<SetType>('normal')
  const [rpe, setRpe] = useState<number | null>(null)
  // Which exercise the draft was seeded from, and the unit it is written in.
  // Both are adjusted during render rather than in an effect: an effect would
  // paint one frame with the wrong values first.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [draftUnit, setDraftUnit] = useState<Unit>(unit)

  const lastLogged = setsThisWorkout.at(-1)
  const lastPrevious = previousSession.at(-1)

  if (seededFor !== null && seededFor !== exercise.id) {
    // A different exercise: drop the old draft and seed again below.
    setSeededFor(null)
    setDraft({ weight: '', reps: '' })
    setError(null)
  } else if (seededFor === null && !previousLoading) {
    // Seed from this workout's last set for the exercise, else the last
    // session's. Waiting for the fetch matters: seeding from an empty list
    // would mark the draft done and the auto-fill would never happen.
    const source = lastLogged ?? lastPrevious
    if (source) setDraft(draftFromWeight(source.weight_kg, source.reps, unit))
    setSeededFor(exercise.id)
    setDraftUnit(unit)
  } else if (draftUnit !== unit) {
    // Flipping the header toggle mid-set converts what is already typed rather
    // than leaving 135 lbs sitting in a field now labelled kg.
    setDraftUnit(unit)
    setDraft((d) => {
      if (d.weight.trim() === '') return d
      const parsed = Number.parseFloat(d.weight)
      if (!Number.isFinite(parsed)) return d
      return { ...d, weight: formatWeight(fromDisplayWeight(parsed, draftUnit), unit) }
    })
  }

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
    const ok = await onAddSet({ weightKg, reps, setType, rpe })
    if (!ok) return

    // A set type is a property of one set, not a mode. Failure and drop sets
    // are the exception in a session, so they do not stick to the next one.
    if (setType === 'failure' || setType === 'drop') setSetType('normal')

    // Weight and reps stay put so the next set is pre-filled with what was
    // just logged; RPE does not, because it is a judgement about one set.
    setRpe(null)
  }

  function cycleSetType() {
    const i = SET_TYPE_CYCLE.indexOf(setType)
    setSetType(SET_TYPE_CYCLE[(i + 1) % SET_TYPE_CYCLE.length])
  }

  function cycleRpe() {
    if (rpe === null) return setRpe(RPE_CHOICES[3])
    const i = RPE_CHOICES.indexOf(rpe as (typeof RPE_CHOICES)[number])
    if (i === -1 || i === RPE_CHOICES.length - 1) return setRpe(null)
    setRpe(RPE_CHOICES[i + 1])
  }

  const typedWeight = Number.parseFloat(draft.weight)

  return (
    <section className="flex flex-col gap-3 pb-4">
      <div className="flex items-center gap-3">
        <ExerciseThumb exercise={exercise} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{exercise.name}</h2>
          <p className="truncate text-[11px] text-muted">
            {exercise.muscle_group} · {exercise.equipment}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="btn-base btn-secondary h-12 px-3 text-sm"
        >
          Done
        </button>
      </div>

      <div
        className="ring-edge bg-surface px-[13px] py-2.5"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        {previousLoading ? (
          <p className="text-[11px] text-muted">Loading previous session…</p>
        ) : previousSession.length > 0 ? (
          <>
            <p className="text-[11px] text-muted">
              Previous · {formatRelativeDay(previousSession[0].started_at)}
            </p>
            {/* 20px, not the 24px minimum in the plan's §2.4. This is a
                multi-set string ("60 kg × 8 · 60 kg × 6 · 55 kg × 6"), not a
                single figure — at 24px it wraps to three lines and pushes the
                weight input below the fold. §2.1 (the logging flow is sacred)
                outranks §2.4, so it stops here. See DECISIONS.md. */}
            <p className="tnum mt-0.5 text-xl">{previousSummary}</p>
          </>
        ) : (
          <p className="text-[11px] text-muted">
            First time logging this exercise. No previous session yet.
          </p>
        )}
      </div>

      {timer && <RestTimerBar timer={timer} />}

      {setsThisWorkout.length > 0 && (
        <ul
          className="ring-edge overflow-hidden bg-surface"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {setsThisWorkout.map((set, i) => (
            <li key={set.id}>
              {i > 0 && <div className="rule-solid mx-[13px]" />}
              <div className="flex items-center gap-3 px-[13px] py-2.5">
                <span className="tnum w-5 text-xs text-muted">{set.set_number}</span>
                {/* 24px, not the 21px the redesign asked for: §2.4 sets the
                    floor and DECISIONS.md already raised this row once, to be
                    readable at arm's length between sets. */}
                <span className="tnum flex-1 text-2xl">
                  {set.weight_kg === null ? 'BW' : formatWeight(set.weight_kg, unit)}
                </span>
                <span className="tnum text-2xl">{set.reps ?? '—'}</span>
                <span className="text-xs text-muted">reps</span>
                {set.set_type !== 'normal' && (
                  <span
                    title={SET_TYPE_NAME[set.set_type]}
                    className="tag-neutral h-6 w-6"
                  >
                    {SET_TYPE_LABEL[set.set_type]}
                  </span>
                )}
                {set.rpe !== null && (
                  <span className="tnum text-[11px] text-muted">@{set.rpe}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div>
          <label htmlFor="weight" className="mb-1 block text-[11px] text-muted">
            Weight ({unit}) · optional
          </label>
          <div className="flex items-center gap-2">
            <StepperButton label="Decrease weight" onPress={() => stepWeight(-1)} />
            <input
              id="weight"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={draft.weight}
              onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
              placeholder="BW"
              className="tnum h-[62px] w-full flex-1 border border-line bg-surface px-3 text-start text-[30px] font-medium outline-none placeholder:text-muted focus:border-accent"
              style={{ borderRadius: 'var(--radius-md)' }}
            />
            <StepperButton label="Increase weight" onPress={() => stepWeight(1)} />
          </div>
        </div>

        <div>
          <label htmlFor="reps" className="mb-1 block text-[11px] text-muted">
            Reps
          </label>
          <div className="flex items-center gap-2">
            <StepperButton label="Decrease reps" onPress={() => stepReps(-1)} />
            <input
              id="reps"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={draft.reps}
              onChange={(e) => setDraft((d) => ({ ...d, reps: e.target.value }))}
              placeholder="0"
              className="tnum h-[62px] w-full flex-1 border border-line bg-surface px-3 text-start text-[30px] font-medium outline-none placeholder:text-muted focus:border-accent"
              style={{ borderRadius: 'var(--radius-md)' }}
            />
            <StepperButton label="Increase reps" onPress={() => stepReps(1)} />
          </div>
        </div>
      </div>

      <LoadHelper
        weight={Number.isFinite(typedWeight) ? typedWeight : null}
        unit={unit}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cycleSetType}
          aria-label={`${SET_TYPE_NAME[setType]}. Tap to change.`}
          className={`btn-base h-12 min-w-14 px-3 text-sm ${
            setType === 'normal' ? 'btn-secondary' : 'btn-primary'
          }`}
        >
          {setType === 'normal' ? 'Set' : SET_TYPE_LABEL[setType]}
        </button>

        <button
          type="button"
          onClick={cycleRpe}
          aria-label={rpe === null ? 'Add RPE' : `RPE ${rpe}. Tap to change.`}
          className={`btn-base tnum h-12 min-w-14 px-3 text-sm ${
            rpe === null ? 'btn-secondary' : 'btn-primary'
          }`}
        >
          {rpe === null ? 'RPE' : `@${rpe}`}
        </button>

        {onSuperset && (
          <button
            type="button"
            onClick={onSuperset}
            className={`btn-base h-12 px-3 text-sm ${
              supersetGroup != null ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {supersetGroup != null ? `SS ${supersetGroup}` : 'Superset'}
          </button>
        )}

        <span className="ms-auto text-[11px] text-muted">{SET_TYPE_NAME[setType]}</span>
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
        className="btn-base btn-primary mt-1 h-[66px] w-full text-[19px] disabled:opacity-45"
      >
        {saving ? 'Saving…' : `Log set ${setsThisWorkout.length + 1}`}
      </button>
    </section>
  )
}
