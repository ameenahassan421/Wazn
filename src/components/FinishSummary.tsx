import { useEffect, useRef, useState } from 'react'
import type { WorkoutSummary } from '../lib/summary'
import type { Unit } from '../lib/units'
import { formatWeight } from '../lib/units'
import { drawShareCard, shareCard } from '../lib/share-card'

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
}: {
  summary: WorkoutSummary
  unit: Unit
  dateLabel: string
  onDone: () => void
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
      <h2 className="text-2xl font-semibold tracking-tight">Workout complete</h2>

      <ul className="grid grid-cols-2 gap-3">
        {stats.map(([value, label]) => (
          <li
            key={label}
            className="rounded-lg border border-line bg-surface px-3 py-3"
          >
            <p className="tnum text-3xl font-bold">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </li>
        ))}
      </ul>

      {summary.prs.length > 0 && (
        <div className="rounded-lg border border-accent bg-surface px-3 py-3">
          <p className="text-sm font-semibold text-accent">
            {summary.prs.length === 1
              ? '1 personal record'
              : `${summary.prs.length} personal records`}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {summary.prs.map((pr) => (
              <li key={`${pr.exerciseId}-${pr.kind}`} className="text-sm">
                <span className="font-semibold">{pr.exerciseName}</span>{' '}
                <span className="tnum">
                  {formatWeight(pr.value, unit)} {unit}
                </span>{' '}
                <span className="text-muted">
                  {pr.kind === 'e1rm' ? 'est. 1RM' : 'top set'}
                  {pr.previousBest !== null &&
                    ` · was ${formatWeight(pr.previousBest, unit)}`}
                </span>
              </li>
            ))}
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
          className="h-12 w-full rounded-lg border border-line text-base font-semibold disabled:opacity-60"
        >
          {sharing ? 'Preparing…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-12 w-full rounded-lg bg-accent text-base font-bold text-accent-ink"
        >
          Done
        </button>
      </div>

      {status && <p className="text-xs text-muted">{status}</p>}
    </section>
  )
}
