import { useEffect, useRef, useState } from 'react'
import type { WorkoutSummary } from '../lib/summary'
import type { Exercise } from '../lib/types'
import type { Unit } from '../lib/units'
import { formatWeight } from '../lib/units'
import { drawShareCard, shareCard } from '../lib/share-card'
import { ExerciseThumb } from './ExerciseThumb'

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
}: {
  summary: WorkoutSummary
  unit: Unit
  dateLabel: string
  onDone: () => void
  /** Only used to put a face on each PR row; optional so tests and any
   *  caller without the catalogue still render. */
  exercisesById?: Map<string, Exercise>
}) {
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
          ? 'Saved the image — this browser has no share sheet.'
          : 'Could not build the image.',
    )
  }

  const stats: [string, string][] = [
    [formatWeight(summary.totalVolumeKg, unit), `volume (${unit})`],
    [
      summary.durationSeconds === null ? '—' : fromSeconds(summary.durationSeconds),
      'duration',
    ],
    [String(summary.setCount), summary.setCount === 1 ? 'set' : 'sets'],
    [String(summary.exerciseCount), 'exercises'],
  ]

  return (
    <section className="flex flex-col gap-4 pb-6">
      <div>
        <p className="kicker">{dateLabel}</p>
        <h2 className="mt-1 text-[30px] font-medium tracking-tight">
          Workout complete
        </h2>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {stats.map(([value, label]) => (
          <li
            key={label}
            className="ring-edge bg-surface px-3 py-3"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <p className="tnum text-[27px] font-medium">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted">{label}</p>
          </li>
        ))}
      </ul>

      {summary.prs.length > 0 && (
        <div
          className="border border-accent bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <div className="flex items-center gap-2">
            <span className="tag-pr h-[22px]">PR</span>
            <p className="text-sm font-medium text-accent">
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
                  className="record-row flex items-center gap-3 rounded-[6px] px-2 py-1.5"
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

      {/* Rendered off-screen: the card is 1080x1080 and only ever leaves as a
          file. Kept in the DOM so toBlob has something to read. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={sharing}
          className="btn-base btn-secondary h-[52px] w-full text-base disabled:opacity-45"
        >
          {sharing ? 'Preparing…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="btn-base btn-primary h-[52px] w-full text-base"
        >
          Done
        </button>
      </div>

      {status && <p className="text-xs text-muted">{status}</p>}
    </section>
  )
}
