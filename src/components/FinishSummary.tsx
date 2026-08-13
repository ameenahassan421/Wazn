import { Fragment, useEffect, useRef, useState } from 'react'
import type { WorkoutSummary } from '../lib/summary'
import type { Exercise, Workout } from '../lib/types'
import type { Unit } from '../lib/units'
import { formatWeight } from '../lib/units'
import { formatCount, formatVolume } from '../lib/format'
import { drawShareCard, shareCard } from '../lib/share-card'
import {
  debriefChip,
  debriefSkeleton,
  fetchCoachLine,
  fetchDebriefBlock,
  recordCoachView,
} from '../lib/coach'
import { ExerciseThumb } from './ExerciseThumb'
import { WorkoutNotes } from './WorkoutNotes'
import { useLocale } from '../lib/locale-context'

/** Seconds → "48 min" / "1h 12m". `formatDuration` in lib/format takes ISO
 *  strings; the summary already holds a duration, so it formats that. */
function fromSeconds(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
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

  return (
    <section className="flex flex-col gap-4 pb-6">
      <div>
        <p className="kicker">{dateLabel}</p>
        <h2 className="mt-1 text-[30px] font-medium tracking-tight">
          {t('finish.title')}
        </h2>
      </div>

      {/* One receipt card with three rule-split figures, per design v2.1. The
          2x2 grid this replaced made four numbers of equal weight; the session
          has three that matter and a fourth that was filler. */}
      <div
        className="ring-edge bg-surface px-3 py-3.5"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <div className="flex items-stretch">
          {stats.map(([value, label], i) => (
            <Fragment key={label}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="w-px shrink-0 bg-[var(--divider)]"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
                <span className="tnum font-display truncate text-[27px] font-semibold leading-none">
                  {value}
                </span>
                <span className="text-[11px] text-muted">{label}</span>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <CoachDebrief workoutId={workout?.id ?? null} unit={unit} />

      {summary.prs.length > 0 && (
        <div
          className="border border-accent bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <div className="flex items-center gap-2">
            <span className="tag-pr h-[22px]">PR</span>
            <p className="text-sm font-medium text-accent-300">
              {summary.prs.length === 1
                ? '1 personal record'
                : `${summary.prs.length} personal records`}
            </p>
          </div>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {summary.prs.map((pr) => {
              const exercise = exercisesById?.get(pr.exerciseId)
              return (
                <li
                  key={`${pr.exerciseId}-${pr.kind}`}
                  className="record-flash flex items-center gap-3 rounded-[6px] px-2 py-1.5"
                >
                  {exercise && <ExerciseThumb exercise={exercise} size={38} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {pr.exerciseName}
                    </span>
                    <span className="tnum block text-xs text-muted">
                      {formatWeight(pr.value, unit)} {unit}{' '}
                      {pr.kind === 'e1rm' ? 'est. 1RM' : 'top set'}
                      {pr.previousBest !== null &&
                        ` · was ${formatWeight(pr.previousBest, unit)}`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
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
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={sharing}
          className="btn-base btn-hero h-[60px] w-full text-[17px] disabled:opacity-45"
        >
          {sharing ? t('finish.preparing') : t('finish.share')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="btn-base btn-secondary h-12 w-full text-sm"
        >
          {t('finish.done')}
        </button>
        {routineUpdate && (
          <button
            type="button"
            onClick={routineUpdate.onUpdate}
            disabled={routineUpdate.saving}
            className="btn-base btn-ghost h-12 w-full text-[13px] disabled:opacity-45"
          >
            Update {routineUpdate.name} with today’s changes?
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
 * card, no heading, no control — and it renders nothing at all rather than
 * anything apologetic when there is nothing to say.
 *
 * Not a card on purpose. A bordered box here would make four boxes down the
 * screen and turn a remark into a section; the rule above it is enough to
 * separate a sentence from the receipt.
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
    <div>
      <div className="rule-fade mb-3" />
      <p key={line} className="coach-in text-[15px] leading-snug">
        {line}
      </p>
      {chip && <span className="chip-data mt-2 inline-flex">{chip}</span>}
    </div>
  )
}
