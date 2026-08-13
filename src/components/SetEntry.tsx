import { useEffect, useMemo, useState } from 'react'
import type { Exercise, PreviousSessionRow, SetType, WorkoutSet } from '../lib/types'
import { SET_TYPE_CYCLE, SET_TYPE_LABEL, SET_TYPE_NAME, isRecord } from '../lib/types'
import { formatRelativeDay } from '../lib/format'
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import type { RestTimer } from '../lib/use-rest-timer'
import { RestTimerBar } from './RestTimer'
import { LoadHelper } from './LoadHelper'
import { ExerciseThumb } from './ExerciseThumb'
import { IconBack } from './icons'
import { useLocale } from '../lib/locale-context'

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
  sign,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  sign: 'up' | 'down'
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
      {sign === 'down' ? '−' : '+'}
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
  restSeconds,
  onSaveRest,
  supersetGroup,
  onSuperset,
  onUngroup,
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
  /** This lift's resolved rest length, for the timer's keep-it affordance. */
  restSeconds?: number
  onSaveRest?: (seconds: number) => void
  supersetGroup?: number | null
  onSuperset?: () => void
  /** Clears this exercise's group for the whole workout. Omit to hide. */
  onUngroup?: () => void
}) {
  const { t } = useLocale()
  const [draft, setDraft] = useState<Draft>({ weight: '', reps: '' })
  const [error, setError] = useState<string | null>(null)
  const [setType, setSetType] = useState<SetType>('normal')
  const [rpe, setRpe] = useState<number | null>(null)
  // Which exercise the draft was seeded from, and the unit it is written in.
  // Both are adjusted during render rather than in an effect: an effect would
  // paint one frame with the wrong values first.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [draftUnit, setDraftUnit] = useState<Unit>(unit)

  // Two taps to arm, matching the finish control: breaking a superset is
  // destructive and undoing it means re-picking a partner.
  const [confirmUngroup, setConfirmUngroup] = useState(false)
  useEffect(() => {
    if (!confirmUngroup) return
    const id = setTimeout(() => setConfirmUngroup(false), 4000)
    return () => clearTimeout(id)
  }, [confirmUngroup])

  const lastLogged = setsThisWorkout.at(-1)
  const lastPrevious = previousSession.at(-1)

  if (seededFor !== null && seededFor !== exercise.id) {
    // A different exercise: drop the old draft and seed again below.
    setSeededFor(null)
    setDraft({ weight: '', reps: '' })
    setError(null)
    // The set type does not travel between exercises. Warming up on bench and
    // then switching to rows used to carry the warm-up flag across with you,
    // and every row set after that landed excluded from PRs and charts.
    setSetType('normal')
    setRpe(null)
    setConfirmUngroup(false)
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

  // Warm-ups do not consume a working-set number. Three warm-ups then "Log
  // set 1" is the honest reading, and it is also the loudest possible signal
  // that the working sets have not started yet.
  const workingCount = setsThisWorkout.filter((s) => s.set_type !== 'warmup').length
  const warmupCount = setsThisWorkout.length - workingCount

  /** Display-unit weights of warm-ups already logged, so the ramp can say so. */
  const loggedWarmups = useMemo(
    () =>
      setsThisWorkout
        .filter((s) => s.set_type === 'warmup' && s.weight_kg !== null)
        .map((s) => toDisplayWeight(s.weight_kg as number, unit)),
    [setsThisWorkout, unit],
  )

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
      setError(t('entry.error.reps'))
      return
    }

    let weightKg: number | null = null
    if (draft.weight.trim() !== '') {
      const parsed = Number.parseFloat(draft.weight)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(t('entry.error.weight', { unit }))
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

  /**
   * Log one row of the warm-up ramp exactly as it reads, without touching the
   * draft or the set type.
   *
   * The ramp used to be numbers to copy by hand: read 95, type 95, set the
   * type to warm-up, log, repeat. This is the same set in one tap, and it
   * cannot leave the warm-up flag switched on behind it, because it never
   * switches it on in the first place.
   */
  async function logRampStep(weight: number, reps: number) {
    setError(null)
    await onAddSet({
      weightKg: Number(fromDisplayWeight(weight, unit).toFixed(2)),
      reps,
      setType: 'warmup',
      rpe: null,
    })
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
      <div className="flex items-center gap-2">
        {/* Back is a chevron at the inline start — where forty years of
            phone interfaces put it — not a "Done" that reads as submit. */}
        <button
          type="button"
          onClick={onBack}
          aria-label={t('entry.back')}
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack />
        </button>
        <ExerciseThumb exercise={exercise} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-medium">{exercise.name}</h2>
          <p className="truncate text-xs text-muted">
            {exercise.muscle_group} · {exercise.equipment}
          </p>
        </div>
      </div>

      <div
        className="ring-edge bg-surface px-[13px] py-2.5"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        {previousLoading ? (
          <p className="text-[11px] text-muted">{t('entry.previous.loading')}</p>
        ) : previousSession.length > 0 ? (
          <>
            <p className="kicker">
              Previous · {formatRelativeDay(previousSession[0].started_at)}
            </p>
            {/* 20px, not the 24px minimum in the plan's §2.4. This is a
                multi-set string ("60 kg × 8 · 60 kg × 6 · 55 kg × 6"), not a
                single figure — at 24px it wraps to three lines and pushes the
                weight input below the fold. §2.1 (the logging flow is sacred)
                outranks §2.4, so it stops here. See DECISIONS.md. */}
            <p className="tnum font-display mt-1 text-[19px] font-medium">
              {previousSummary}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted">{t('entry.previous.none')}</p>
        )}
      </div>

      {timer && (
        <RestTimerBar
          timer={timer}
          defaultSeconds={restSeconds}
          onSaveDefault={onSaveRest}
        />
      )}

      {setsThisWorkout.length > 0 && (
        <ul
          className="ring-edge overflow-hidden bg-surface"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {setsThisWorkout.map((set, i) => (
            <li key={set.id}>
              {i > 0 && <div className="rule-solid mx-[13px]" />}
              {/* A record flashes once, on the set that just landed, and then
                  keeps the 7% tint for as long as the row exists. Older
                  records in the same session are already tinted and must not
                  re-flash every time a new set is logged — §2.1 forbids
                  anything that pulls attention mid-workout, and a list that
                  lights up on every render is exactly that. */}
              {/* The newest non-record row gets the 90ms commit arrival —
                  the motion system's answer to "did that save?". A record row
                  does not also get it: the two utilities both set `animation`
                  and would fight, and the flash already answers the question
                  louder. Keyed by set.id, so the animation runs when the row
                  mounts and never again on re-render. */}
              <div
                className={`flex items-center gap-3 px-[13px] py-2.5 ${
                  i === setsThisWorkout.length - 1
                    ? isRecord(set)
                      ? 'record-flash'
                      : 'set-commit'
                    : isRecord(set)
                      ? 'record-row'
                      : ''
                }`}
              >
                <span className="tnum w-5 font-mono text-[11px] text-muted">
                  {set.set_number}
                </span>
                {/* 24px, not the 21px the redesign asked for: §2.4 sets the
                    floor and DECISIONS.md already raised this row once, to be
                    readable at arm's length between sets. */}
                <span className="tnum flex-1 text-figure">
                  {set.weight_kg === null ? 'BW' : formatWeight(set.weight_kg, unit)}
                </span>
                <span className="tnum text-figure">{set.reps ?? '—'}</span>
                <span className="text-[11px] text-muted">reps</span>
                {isRecord(set) && (
                  <span className="tag-pr h-[22px] shrink-0" title={t('entry.pr')}>
                    PR
                  </span>
                )}
                {set.set_type !== 'normal' && (
                  <span
                    title={SET_TYPE_NAME[set.set_type]}
                    className="tag-neutral h-6 w-6"
                  >
                    {SET_TYPE_LABEL[set.set_type]}
                  </span>
                )}
                {set.rpe !== null && (
                  <span className="tnum font-mono text-[11px] text-muted">
                    @{set.rpe}
                  </span>
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
            <StepperButton
              label={t('entry.weight.decrease')}
              sign="down"
              onPress={() => stepWeight(-1)}
            />
            <input
              id="weight"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={draft.weight}
              onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
              placeholder="BW"
              className="tnum font-display h-[62px] w-full flex-1 border border-line bg-surface px-3 text-start text-[30px] font-medium outline-none placeholder:text-muted focus:border-accent"
              style={{ borderRadius: 'var(--radius-md)' }}
            />
            <StepperButton
              label={t('entry.weight.increase')}
              sign="up"
              onPress={() => stepWeight(1)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="reps" className="mb-1 block text-[11px] text-muted">
            Reps
          </label>
          <div className="flex items-center gap-2">
            <StepperButton
              label={t('entry.reps.decrease')}
              sign="down"
              onPress={() => stepReps(-1)}
            />
            <input
              id="reps"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={draft.reps}
              onChange={(e) => setDraft((d) => ({ ...d, reps: e.target.value }))}
              placeholder="0"
              className="tnum font-display h-[62px] w-full flex-1 border border-line bg-surface px-3 text-start text-[30px] font-medium outline-none placeholder:text-muted focus:border-accent"
              style={{ borderRadius: 'var(--radius-md)' }}
            />
            <StepperButton
              label={t('entry.reps.increase')}
              sign="up"
              onPress={() => stepReps(1)}
            />
          </div>
        </div>
      </div>

      <LoadHelper
        weight={Number.isFinite(typedWeight) ? typedWeight : null}
        unit={unit}
        onLogStep={(weight, reps) => void logRampStep(weight, reps)}
        loggedWeights={loggedWarmups}
        busy={saving}
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
          aria-label={
            rpe === null
              ? t('entry.rpe.add')
              : t('entry.rpe.change', { value: String(rpe) })
          }
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
            aria-label={
              supersetGroup != null
                ? t('entry.superset.add', { group: String(supersetGroup) })
                : t('entry.superset.start')
            }
            className={`btn-base h-12 px-3 text-sm ${
              supersetGroup != null ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {supersetGroup != null
              ? t('entry.superset.badge', { group: String(supersetGroup) })
              : t('entry.superset.label')}
          </button>
        )}

        {/* Grouping used to be permanent — there was no way back from a
            mis-tapped superset short of finishing the workout. */}
        {onUngroup && supersetGroup != null && (
          <button
            type="button"
            onClick={() => {
              if (confirmUngroup) {
                setConfirmUngroup(false)
                onUngroup()
              } else {
                setConfirmUngroup(true)
              }
            }}
            aria-label={t('entry.superset.leave', { group: String(supersetGroup) })}
            className={`btn-base h-12 px-2.5 text-[13px] ${
              confirmUngroup ? 'btn-primary' : 'btn-quiet'
            }`}
          >
            {confirmUngroup ? t('entry.ungroup.confirm') : t('entry.ungroup')}
          </button>
        )}

        {supersetGroup == null && (
          <span className="ms-auto truncate text-[11px] text-muted">
            {SET_TYPE_NAME[setType]}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent-300">
          {error}
        </p>
      )}

      {/* The warm-up mode is carried by the biggest element on the screen, not
          by a 48px chip you set three sets ago and stopped looking at.
          Warm-up sticks on purpose — nobody wants to re-arm it for each of
          three ramp sets — and the cost of that was a working set logged as a
          warm-up, silently excluded from every PR and chart. So the mode is
          made unmissable instead of removed: the label names it, and the
          button drops out of the solid hero tier, because logging a warm-up
          is not the thing this screen exists for. */}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className={`btn-base press mt-1 h-[62px] w-full text-[18px] disabled:opacity-45 ${
          setType === 'warmup' ? 'btn-primary' : 'btn-hero'
        }`}
      >
        {saving
          ? t('entry.saving')
          : setType === 'warmup'
            ? t('entry.log.warmup', { number: String(warmupCount + 1) })
            : t('entry.log.set', { number: String(workingCount + 1) })}
      </button>
    </section>
  )
}
