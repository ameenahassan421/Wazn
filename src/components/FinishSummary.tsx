import { useEffect, useRef, useState } from 'react'
import type { WorkoutSummary } from '../lib/summary'
import type { Exercise, Workout, WorkoutSet } from '../lib/types'
import { isRecord } from '../lib/types'
import type { Unit } from '../lib/units'
import { formatEstimate, formatWeight } from '../lib/units'
import { formatCount, formatVolume } from '../lib/format'
import { estimatedOneRepMax } from '../lib/epley'
import { drawShareCard, shareCard } from '../lib/share-card'
import {
  debriefChip,
  debriefSkeleton,
  fetchCoachLine,
  fetchDebriefBlock,
  recordCoachView,
} from '../lib/coach'
import { PlateDot, PlateLoaded } from './icons'
import { WorkoutNotes } from './WorkoutNotes'
import { useLocale } from '../lib/locale-context'

/** Seconds → "48 min" / "1h 12m". `formatDuration` in lib/format takes ISO
 *  strings; the summary already holds a duration, so it formats that.
 *
 *  Not the design's M:SS. A duration in minutes is what a session is
 *  remembered in; seconds are precision nobody asked for once the bar is
 *  racked, and "1h 12m" survives a session the mock's "48:12" does not. */
function fromSeconds(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** The set behind a record: the heaviest by estimated 1RM, as the design picks it. */
function bestSetFor(sets: WorkoutSet[], exerciseId: string): WorkoutSet | null {
  let best: WorkoutSet | null = null
  let bestE1rm = -1
  for (const set of sets) {
    if (set.exercise_id !== exerciseId) continue
    if (set.set_type === 'warmup' || set.weight_kg === null || set.reps === null) {
      continue
    }
    const e1rm = estimatedOneRepMax(set.weight_kg, set.reps, set.set_type) ?? 0
    if (e1rm > bestE1rm) {
      bestE1rm = e1rm
      best = set
    }
  }
  return best
}

/**
 * Shown after Finish, never during. §2.1 keeps the logging flow clear of
 * celebration screens, so this is strictly post-workout — and it is dismissible
 * with one tap, because the next thing a person does after a workout is leave.
 */
export function FinishSummary({
  summary,
  unit,
  dateLabel,
  onDone,
  exercisesById,
  workout,
  skipped = [],
  routineUpdate,
  sets = [],
  order = [],
  ordinal = null,
}: {
  summary: WorkoutSummary
  unit: Unit
  dateLabel: string
  onDone: () => void
  /** Only used to put a face on each PR row; optional so tests and any
   *  caller without the catalogue still render. */
  exercisesById?: Map<string, Exercise>
  /** The workout just finished. Omit to hide the name and note fields. */
  workout?: Workout | null
  /**
   * Names of exercises that were on the board and had nothing logged.
   *
   * This is the ONLY place in the app where "skipped" exists. Mid-workout
   * there is no such thing — there is only not-yet-done, and implying
   * otherwise is the app scolding a lifter who is still lifting. Here the
   * session is over, so routine adherence can be visible without becoming a
   * lecture: named, never scored, never counted against anything.
   */
  skipped?: string[]
  /**
   * Offered only when today's work no longer matches the routine it came from.
   * A quiet line, not a hero button: keeping the template current is worth one
   * tap and worth nothing more than that.
   */
  routineUpdate?: { name: string; saving: boolean; onUpdate: () => void }
  /**
   * The finished session's sets, snapshotted by the caller — the workout's own
   * state is cleared in the same pass that builds the summary. Optional, and
   * the breakdown and the records' best-set lines simply do not draw without
   * them.
   */
  sets?: WorkoutSet[]
  /** Board order for the breakdown. Falls back to the order the sets arrived. */
  order?: string[]
  /** Which session this was, counting from the first. Null while it loads. */
  ordinal?: number | null
}) {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (canvasRef.current) drawShareCard(canvasRef.current, summary, unit, dateLabel)
  }, [summary, unit, dateLabel])

  async function onShare() {
    if (!canvasRef.current) return
    setSharing(true)
    const outcome = await shareCard(canvasRef.current, 'wazn-workout.png')
    setSharing(false)
    setStatus(
      outcome === 'shared'
        ? null
        : outcome === 'downloaded'
          ? t('finish.share.saved')
          : t('finish.share.error'),
    )
  }

  // The debrief — B1, offense plan §4-A2. Under the receipt and above the
  // records, because it is a sentence *about* the three numbers directly
  // above it, and it must not push the PR card off the first screenful.
  //
  // Same two-stage draw as the briefing: `debriefSkeleton` renders from SQL
  // and a phrased line replaces it if one arrives. Everything below is
  // unaffected either way — the summary was complete before the coach existed
  // and stays complete if it says nothing.
  const stats: [string, string][] = [
    [
      summary.durationSeconds === null ? '—' : fromSeconds(summary.durationSeconds),
      t('finish.duration'),
    ],
    [formatVolume(summary.totalVolumeKg, unit), t('finish.volume')],
    [
      formatCount(summary.setCount),
      t(summary.setCount === 1 ? 'finish.set.one' : 'finish.set.other'),
    ],
  ]

  // The session, exercise by exercise, in the order the board carried them.
  // Built here rather than in the JSX because the working-set counter is a
  // running index that skips warm-ups, and that does not survive a `.map`.
  const breakdown = (
    order.length > 0 ? order : [...new Set(sets.map((s) => s.exercise_id))]
  )
    .map((exerciseId) => {
      let workingNumber = 0
      const rows = sets
        .filter((s) => s.exercise_id === exerciseId)
        .map((set) => {
          if (set.set_type !== 'warmup') workingNumber += 1
          return { set, workingNumber }
        })
      return {
        name: exercisesById?.get(exerciseId)?.name ?? t('log.exercise_fallback'),
        rows,
      }
    })
    .filter((block) => block.rows.length > 0)

  return (
    <section className="flex flex-col gap-3 pb-6">
      <div>
        <p className="text-[13px] text-muted">
          {dateLabel}
          {ordinal !== null && (
            <>
              {' · '}
              {t('finish.ordinal', { n: String(ordinal) })}
            </>
          )}
        </p>
        <h2 className="font-display mt-2 text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em]">
          {t('finish.title')}
        </h2>
      </div>

      {/* Three panels, not one split card. The receipt this replaced centred
          its figures and ruled between them; the design sets them as three
          objects reading from the inline start, which is how the eye takes
          three numbers in one pass. */}
      <div className="flex gap-2.5">
        {stats.map(([value, label]) => (
          <div key={label} className="surface-panel min-w-0 flex-1 px-4 py-3.5">
            <p
              dir="ltr"
              className="tnum font-display truncate text-[22px] font-bold tracking-[-0.02em]"
            >
              {value}
            </p>
            <p className="mt-[3px] truncate text-[11.5px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* One card per record, on the ember tint — the loudest surface in the
          app, and the only place it is spent. The kicker is accent-300, not
          the accent itself: ember-500 on the tint is under AA at 12px, and
          the small-accent-text rule is not suspended for a celebration. */}
      {summary.prs.map((pr) => {
        const best = bestSetFor(sets, pr.exerciseId)
        const e1rm = best
          ? estimatedOneRepMax(best.weight_kg, best.reps, best.set_type)
          : null
        return (
          <div
            key={`${pr.exerciseId}-${pr.kind}`}
            className="flex items-center gap-3.5 p-[18px]"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
              borderRadius: 'var(--radius-xl)',
            }}
          >
            <PlateLoaded size={44} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="kicker text-accent-300">{t('finish.new_pr')}</p>
              {/* `dir="auto"` on the WHOLE line, not just the figure.
                  Isolating only the figure left the line's own direction to
                  the Arabic paragraph around it, and a Latin exercise name
                  plus an em dash plus a figure came out reordered — the
                  figure printed first. Taken from the name's own first
                  strong character, the line reads correctly whichever
                  language the exercise is named in. */}
              <p
                dir="auto"
                className="font-display mt-1 text-[17px] font-bold tracking-[-0.02em]"
              >
                {pr.exerciseName}
                {best && (
                  <>
                    {' — '}
                    <span dir="ltr" className="tnum whitespace-nowrap">
                      {formatWeight(best.weight_kg, unit)} {unit} × {best.reps}
                    </span>
                  </>
                )}
              </p>
              <p className="meta-mono mt-1 text-xs text-muted">
                {t('finish.e1rm', {
                  value: formatEstimate(e1rm ?? pr.value, unit),
                  unit,
                })}
              </p>
            </div>
          </div>
        )
      })}

      <CoachDebrief workoutId={workout?.id ?? null} unit={unit} />

      {/* Every set, as it happened. Warm-ups muted and unnumbered — they did
          not consume a working-set number when they were logged and they do
          not get one back here. */}
      {breakdown.length > 0 && (
        <div className="surface-card flex flex-col gap-1 px-[18px] py-3.5">
          {breakdown.map(({ name, rows }) => (
            <div key={name}>
              <p className="kicker mt-1.5 mb-0.5">{name}</p>
              {rows.map(({ set, workingNumber }) => (
                <div
                  key={set.id}
                  className="meta-mono flex min-h-[22px] items-center justify-between text-[13px]"
                >
                  <span
                    className={set.set_type === 'warmup' ? 'text-muted' : 'text-text'}
                  >
                    {set.set_type === 'warmup'
                      ? t('finish.warmup')
                      : t('finish.set_n', { n: String(workingNumber) })}
                    {isRecord(set) && (
                      <span className="tag-pr ms-1.5 h-[18px]">PR</span>
                    )}
                  </span>
                  <span dir="ltr" className="tnum whitespace-nowrap text-muted">
                    {formatWeight(set.weight_kg, unit)} × {set.reps ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {skipped.length > 0 && (
        <div
          className="ring-edge bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="kicker">{t('finish.not_done')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {skipped.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                  {name}
                </span>
                <span className="tag-neutral h-[22px] shrink-0 px-1.5 font-mono tracking-[0.08em]">
                  SKIPPED
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The only moment in the app where writing a sentence costs nothing:
          the set is racked, the session is over, and §2.1's protection of the
          logging flow no longer applies. Optional in every sense — nothing
          below waits on it. */}
      {workout && (
        <WorkoutNotes
          workoutId={workout.id}
          initialName={workout.name}
          initialNote={workout.notes ?? null}
        />
      )}

      {/* Rendered off-screen: the card is 1080x1350 (4:5) and only ever leaves
          as a file. Kept in the DOM so toBlob has something to read. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <div className="flex flex-col gap-2">
        {/* Share and Done as paired pills. Neither is the hero: the session
            is over, and the two things left to do — keep it, leave it — are
            worth the same. Done takes the flip ground, which is the design's
            way of saying "this one closes the screen". */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => void onShare()}
            disabled={sharing}
            className="btn-base press h-14 flex-1 text-[15px] font-bold disabled:opacity-45"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-panel)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            {sharing ? t('finish.preparing') : t('finish.share')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="btn-base press h-14 flex-1 text-[15px] font-bold"
            style={{
              background: 'var(--flip-bg)',
              color: 'var(--flip-text)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            {t('finish.done')}
          </button>
        </div>
        {routineUpdate && (
          <button
            type="button"
            onClick={routineUpdate.onUpdate}
            disabled={routineUpdate.saving}
            className="btn-base btn-ghost h-12 w-full text-[13px] disabled:opacity-45"
          >
            {t('finish.routine_update', { name: routineUpdate.name })}
          </button>
        )}
      </div>

      {status && <p className="text-xs text-muted">{status}</p>}
    </section>
  )
}

/**
 * One line about what the session meant — B1's second surface.
 *
 * §4-A2 calls this "the highest-emotion moment in the app … where the coach
 * earns its keep". It is also the moment with the least patience: the bar is
 * racked and the next thing a person does is leave. So it is one line, no
 * heading, no control — and it renders nothing at all rather than anything
 * apologetic when there is nothing to say.
 *
 * It IS a card now, which reverses what this comment used to argue. The old
 * reasoning was that a bordered box would make four boxes down the screen;
 * the design's finish is a column of cards, so a bare sentence in the middle
 * of it read as an orphan rather than as a remark. The plate mark carries the
 * voice, exactly as it does on the home surface.
 */
function CoachDebrief({ workoutId, unit }: { workoutId: string | null; unit: Unit }) {
  const [line, setLine] = useState<string | null>(null)
  const [chip, setChip] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!workoutId) return
    let active = true
    void (async () => {
      const block = await fetchDebriefBlock(workoutId)
      if (!active) return

      const skeleton = debriefSkeleton(block, unit)
      if (!skeleton) return
      setLine(skeleton)
      setChip(debriefChip(block, unit))
      void recordCoachView('debrief', 'view')

      const phrased = await fetchCoachLine('debrief', unit, workoutId)
      if (!active || !phrased.line) return
      setLine(phrased.line)
      setChip(phrased.chip)
    })()
    return () => {
      active = false
    }
    // Same as the briefing: a unit change re-renders, it does not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  if (!line) return null

  return (
    <div className="surface-card flex items-start gap-3 px-[18px] py-4">
      <PlateDot size={26} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p key={line} className="coach-in text-[14px] leading-[1.6]">
          {line}
        </p>
        {chip && (
          <span dir="ltr" className="chip-data mt-2 inline-flex">
            {chip}
          </span>
        )}
      </div>
    </div>
  )
}
