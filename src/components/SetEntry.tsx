import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Exercise,
  PreviousSessionRow,
  SetType,
  WorkoutSet,
} from '@wazn/core/types'
import {
  SET_TYPE_CYCLE,
  SET_TYPE_LABEL,
  SET_TYPE_NAME,
  isRecord,
} from '@wazn/core/types'
import { formatRelativeDay } from '@wazn/core/format'
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '@wazn/core/units'
import type { Unit } from '@wazn/core/units'
import type { RestTimer } from '../lib/use-rest-timer'
import { RestChip } from './RestTimer'
import { LoadHelper } from './LoadHelper'
import { ExerciseThumb } from './ExerciseThumb'
import { PlateRing } from './icons'
import { equipmentLabel, muscleLabel } from '@wazn/core/i18n'
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

/**
 * One live zone: a full-bleed row of minus / figure / plus.
 *
 * The two side columns are 82px and carry no fill — they are regions, not
 * buttons, which is the point. A thumb aiming at "the left edge of the phone"
 * hits a target the width of a thumb; a thumb aiming at a 48px pill has to
 * find it first. The hairlines are the only thing drawn.
 */
function Zone({
  id,
  label,
  value,
  onChange,
  onDown,
  onUp,
  downLabel,
  upLabel,
  placeholder,
  inputMode,
  step,
  size,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onDown: () => void
  onUp: () => void
  downLabel: string
  upLabel: string
  placeholder: string
  inputMode: 'decimal' | 'numeric'
  step: string
  /** A ramp step, never a literal — `text-mega` or `text-hero`. */
  size: string
}) {
  return (
    <div
      className="flex items-stretch"
      style={{ borderBlockStart: '1px solid var(--color-line)' }}
    >
      <button
        type="button"
        onClick={onDown}
        aria-label={downLabel}
        className="press text-fig w-[82px] shrink-0 text-muted"
        style={{ borderInlineEnd: '1px solid var(--color-line)' }}
      >
        −
      </button>
      <div className="min-w-0 flex-1 px-1 pt-1.5 pb-2 text-center">
        <label htmlFor={id} className="kicker block">
          {label}
        </label>
        <input
          id={id}
          type="number"
          inputMode={inputMode}
          step={step}
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir="ltr"
          className={`tnum font-display w-full bg-transparent text-center ${size} outline-none placeholder:text-muted`}
        />
      </div>
      <button
        type="button"
        onClick={onUp}
        aria-label={upLabel}
        className="press text-fig w-[82px] shrink-0 text-muted"
        style={{ borderInlineStart: '1px solid var(--color-line)' }}
      >
        +
      </button>
    </div>
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
  timer,
  restSeconds,
  restEffort,
  onSaveRest,
  onExpandRest,
  supersetGroup,
  onSuperset,
  onUngroup,
  plannedSets,
  nextExerciseName,
  onNextExercise,
  sessionQueue,
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
  /** Optional so existing tests and any non-workout use keep working. */
  timer?: RestTimer
  /** This lift's resolved rest length, for the timer's keep-it affordance. */
  restSeconds?: number
  /** v3 §04: what the running rest was earned by, for the bar's reason. */
  restEffort?: number | null
  onSaveRest?: (seconds: number) => void
  onExpandRest?: () => void
  supersetGroup?: number | null
  onSuperset?: () => void
  /** Clears this exercise's group for the whole workout. Omit to hide. */
  onUngroup?: () => void
  /**
   * Working sets planned for this lift — the M in "set 3 of 4", and what
   * tells the CTA the lift is done. Optional: undefined means the caller has
   * no plan for it, and the surface says nothing rather than guessing.
   */
  plannedSets?: number
  /** The lift after this one on the board, for the finished-lift CTA. */
  nextExerciseName?: string | null
  onNextExercise?: () => void
  /**
   * The session queue, rendered by the screen that owns the board and
   * slotted in above the commit cluster where the design puts it. A slot
   * rather than props: this component knows one lift, and should keep
   * knowing one lift.
   */
  sessionQueue?: ReactNode
}) {
  const { t, locale } = useLocale()
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
  const typedReps = Number.parseInt(draft.reps, 10)

  // Both of these arrive as `as Exercise` casts off an RPC and are sometimes
  // genuinely absent at runtime, whatever the type says.
  const equipment = equipmentLabel(locale, exercise.equipment ?? '')
  const muscle = exercise.muscle_group ? muscleLabel(locale, exercise.muscle_group) : ''

  // A finished lift is one the board planned and you have met. Without a
  // plan there is no such thing, which is exactly today's behaviour.
  const exerciseComplete =
    plannedSets !== undefined && plannedSets > 0 && workingCount >= plannedSets

  // "set 3 of 4" while the plan is running, "4 of 4 done" once it is met, and
  // the muscle group when the board has no plan to report against.
  //
  // The design switches its CTA to "Next" at this point, so its label can
  // clamp to "set 4 of 4" and stay true. This app keeps logging as the
  // primary action — `planned` is derived, not declared, so a freestyle lift
  // reads "complete" the moment it matches last session, and demoting the log
  // button on that basis would break the one job this screen has. A clamped
  // "set 4 of 4" over a CTA reading "Log set 5" is the contradiction that
  // falls out of that, so the finished state gets its own sentence instead.
  const setLabel = !plannedSets
    ? muscle
    : exerciseComplete
      ? t('entry.set_done', { total: String(plannedSets) })
      : t('entry.set_of', {
          n: String(workingCount + 1),
          total: String(plannedSets),
        })

  // "62.5 × 5" — the commit, spelled out on the button that commits it. No
  // unit: the stepper label two rows up already reads WEIGHT · KG, and a
  // literal "kg" would be an untranslated latin token in the Arabic build.
  // Suppressed until there is something to say, so a first-ever lift reads
  // "Log set 1" rather than "Log set 1 — — × —".
  const figure =
    Number.isFinite(typedReps) && typedReps > 0
      ? `${
          Number.isFinite(typedWeight)
            ? Number(typedWeight.toFixed(2)).toString()
            : 'BW'
        } × ${typedReps}`
      : null

  return (
    <section className="flex flex-col gap-3 pb-4">
      {/* The exercise card: who you are lifting, where you are in it, what
          you did last time, and what has landed today — one object, the way
          the design draws it. */}
      <div className="surface-card px-[18px] py-3.5">
        <div className="flex items-center gap-3">
          <ExerciseThumb exercise={exercise} size={44} radius="var(--radius-thumb)" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-title font-bold tracking-[-0.02em]">
              {exercise.name}
            </h2>
            <p className="meta-mono mt-[3px] truncate text-meta text-muted">
              {setLabel}
              {equipment && ` · ${equipment}`}
            </p>
          </div>
        </div>

        {/* The ghost line: when, then what. One mono line, not a card — the
            design demotes it the moment the steppers carry the figure you
            are about to commit. */}
        <p className="meta-mono mt-3 truncate text-meta text-muted">
          {previousLoading ? (
            t('entry.previous.loading')
          ) : previousSession.length > 0 ? (
            <>
              {formatRelativeDay(previousSession[0].started_at, locale)}
              &nbsp;&nbsp;
              <span dir="ltr">{previousSummary}</span>
            </>
          ) : (
            t('entry.previous.none')
          )}
        </p>

        {setsThisWorkout.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {setsThisWorkout.map((set, i) => (
              <li key={set.id}>
                {/* A record flashes once, on the set that just landed, and
                    then keeps the 7% tint for as long as the row exists.
                    Older records in the same session are already tinted and
                    must not re-flash every time a new set is logged — §2.1
                    forbids anything that pulls attention mid-workout, and a
                    list that lights up on every render is exactly that. */}
                {/* The newest non-record row gets the 90ms commit arrival —
                    the motion system's answer to "did that save?". A record
                    row does not also get it: the two utilities both set
                    `animation` and would fight, and the flash already answers
                    the question louder. Keyed by set.id, so the animation
                    runs when the row mounts and never again on re-render. */}
                <div
                  className={`meta-mono flex min-h-7 items-center gap-2.5 rounded-md text-meta ${
                    i === setsThisWorkout.length - 1
                      ? isRecord(set)
                        ? 'record-flash'
                        : 'set-commit'
                      : isRecord(set)
                        ? 'record-row'
                        : ''
                  }`}
                >
                  <PlateRing size={16} className="shrink-0 text-accent" />
                  <span className="tnum w-4 shrink-0 text-muted">{set.set_number}</span>
                  {/* Mono 14, down from the 24px this row carried since v2.
                      That raise was made when this row was the only figure on
                      the screen; the Sora 29 stepper below it now holds the
                      arm's-length job, and the design reads these back as the
                      ledger. Logged in DECISIONS.md. */}
                  <span className="tnum min-w-0 flex-1 truncate" dir="ltr">
                    {set.weight_kg === null
                      ? 'BW'
                      : `${formatWeight(set.weight_kg, unit)} ${unit}`}{' '}
                    × {set.reps ?? '—'}
                  </span>
                  {isRecord(set) && (
                    <span className="tag-pr h-[22px] shrink-0" title={t('entry.pr')}>
                      PR
                    </span>
                  )}
                  {set.set_type !== 'normal' && (
                    <span
                      title={SET_TYPE_NAME[set.set_type]}
                      className="tag-neutral h-6 w-6 shrink-0"
                    >
                      {SET_TYPE_LABEL[set.set_type]}
                    </span>
                  )}
                  {set.rpe !== null && (
                    <span className="tnum shrink-0 text-meta text-muted">
                      @{set.rpe}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The live zones — v5 screen 07. Two full-bleed rows, each a 82px minus
          zone, the figure, and a 82px plus zone.

          This layout was tried once before and rejected, and the reason it
          works now is worth stating so it is not re-rejected. The rejected
          version put BOTH zones in ONE row, so a stepper pair and a figure
          shared half the screen: measured at the shipped size, `102.5` needs
          83.1px and had 62px, `12` needs 38.8px and had 21px, and both fields
          clipped their own value on the one screen whose whole job is logging
          a set. v5 gives each zone its own full-width row instead, so at 390px
          the figure gets 390 − 82 − 82 = 226px — more than the 166px the
          stacked panels bought, with the touch targets going from 48px to 82px
          rather than down to the design's 44px.

          `-mx-[18px]` escapes the app's gutter, the same way the two sticky
          clusters on this screen already do. A tap anywhere in an 82px column
          steps: at arm's length, with one thumb, the target is the side of the
          screen rather than a button you have to find. */}
      <div className="-mx-[18px]">
        <Zone
          id="weight"
          label={t('entry.weight.panel', { unit })}
          value={draft.weight}
          onChange={(v) => setDraft((d) => ({ ...d, weight: v }))}
          onDown={() => stepWeight(-1)}
          onUp={() => stepWeight(1)}
          downLabel={t('entry.weight.decrease')}
          upLabel={t('entry.weight.increase')}
          placeholder="BW"
          inputMode="decimal"
          step="any"
          /* The weight is the number the lifter is deciding, so it takes the
             larger step — but NOT v5's `mega` 84. v5's live screen carries a
             volume bar, a meta row, the exercise name and the two zones, and
             nothing else. This one also carries the plate rail, the set-type
             row and the session board, and at 84/56 the weight scrolled off
             the top while the commit bar was still on screen: the figure you
             are deciding, invisible, above the button that commits it.
             `hero`/`fig` keeps v5's hierarchy and its full-bleed structure at
             a scale this screen can actually hold. */
          size="text-hero"
        />
        <Zone
          id="reps"
          label={t('entry.reps.panel')}
          value={draft.reps}
          onChange={(v) => setDraft((d) => ({ ...d, reps: v }))}
          onDown={() => stepReps(-1)}
          onUp={() => stepReps(1)}
          downLabel={t('entry.reps.decrease')}
          upLabel={t('entry.reps.increase')}
          placeholder="0"
          inputMode="numeric"
          step="1"
          /* A bodyweight set has no weight to read, so reps become the number
             the screen is about and take the top step. v5 does the same. */
          size={draft.weight.trim() === '' ? 'text-hero' : 'text-fig'}
        />
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
          className={`btn-base h-12 min-w-14 px-3 text-body ${
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
          className={`btn-base tnum h-12 min-w-14 px-3 text-body ${
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
            className={`btn-base h-12 px-3 text-body ${
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
            className={`btn-base h-12 px-2.5 text-label ${
              confirmUngroup ? 'btn-primary' : 'btn-quiet'
            }`}
          >
            {confirmUngroup ? t('entry.ungroup.confirm') : t('entry.ungroup')}
          </button>
        )}

        {supersetGroup == null && (
          <span className="ms-auto truncate text-label text-muted">
            {SET_TYPE_NAME[setType]}
          </span>
        )}
      </div>

      {sessionQueue}

      {/* The commit cluster, pinned — the design's fixed footer under a
          scrolling column, and the reason the plate card and the queue can be
          added to this screen at all. Without it, every surface R5 promoted
          pushed the button that ends a set further below the fold, which is
          the one thing §2.1 does not allow. Consequences ledger row 5 claimed
          this pinning existed; it did not, and now it does.

          Same recipe as the overview's rest bar: opaque, and sitting at the
          safe-area inset. It used to be lifted a further 60px to clear a tab
          bar, which no longer exists. */}
      <div
        className="sticky z-10 -mx-[18px] flex flex-col gap-2 bg-ink px-[18px] pt-2"
        style={{
          // Flush to the top of the tab bar, which owns the safe-area inset
          // now — so this cluster's own padding is just the 10px of breathing
          // room. See `--tab-space` in index.css for the whole rule.
          bottom: 'var(--tab-space)',
          paddingBottom: '10px',
          // A pinned element stops being pinned when the space beneath it
          // runs out, and left alone this cluster rode 66px up its own pinned
          // line over the last stretch of the scroll.
          //
          // `bottom` − trailing space. Trailing space is this section's pb-4
          // (16px), the workout wrapper's py-3 (12px) and main's padding
          // (`--tab-space` + 10px). The `--tab-space` terms cancel and the
          // correction is a constant: −(16 + 12 + 10).
          marginBottom: '-38px',
          // The same hairline the tab bar and the overview's rest bar carry,
          // for the same reason: it marks where content stops and chrome
          // starts, so a chip passing behind reads as scrolling under a bar
          // rather than as being cut in half.
          borderTop: '1px solid var(--divider-solid)',
        }}
      >
        {error && (
          <p role="alert" className="text-body text-accent-300">
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
        {timer && (
          <RestChip
            timer={timer}
            onExpand={onExpandRest}
            defaultSeconds={restSeconds}
            onSaveDefault={onSaveRest}
            effort={restEffort}
          />
        )}

        {/* The design's CTA: a pill, a plate glyph, and the commit spelled
            out — "Log set 3 — 62.5 × 5". The lead phrase stays first and the
            em dash keeps a space on each side, because the figure is an
            addition to the label rather than a replacement for it.

            Ink on ember, not the design's white: white-on-ember is 3.7:1 and
            fails AA. Consequences ledger row 2, where exact yields. */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className={`btn-base press -mx-[18px] flex h-[70px] items-center justify-center gap-2.5 text-num font-bold uppercase disabled:opacity-45 ${
            setType === 'warmup' ? 'btn-primary' : 'btn-hero'
          }`}
          style={{
            // Square and full-bleed, like v5's bar and like the two zones
            // above it. A pill under two edge-to-edge zones reads as a
            // different screen's control.
            borderRadius: 0,
            boxShadow: setType === 'warmup' ? undefined : 'var(--shadow-cta)',
          }}
        >
          <PlateRing size={20} className="shrink-0" />
          <span>
            {saving
              ? t('entry.saving')
              : setType === 'warmup'
                ? t('entry.log.warmup', { number: String(warmupCount + 1) })
                : t('entry.log.set', { number: String(workingCount + 1) })}
            {!saving && figure !== null && (
              <>
                {' · '}
                <span dir="ltr" className="tnum">
                  {figure}
                </span>
              </>
            )}
          </span>
        </button>

        {/* A finished lift gets a way forward that is not another set. Not a
            one-tap finish, though: the workout's Finish is a two-tap confirm
            in the header because ending a session cannot be undone, and the
            hot path is the last place to put an irreversible single tap. On
            the last lift of the board this simply does not appear. */}
        {exerciseComplete && nextExerciseName && onNextExercise && (
          <button
            type="button"
            onClick={onNextExercise}
            className="btn-base btn-secondary press h-12 w-full text-body"
            style={{ borderRadius: 'var(--radius-pill)' }}
          >
            {t('entry.log.next', { name: nextExerciseName })}
          </button>
        )}
      </div>
    </section>
  )
}
