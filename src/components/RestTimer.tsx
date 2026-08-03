import { formatRest, REST_STEP_SECONDS } from '../lib/use-rest-timer'
import type { RestTimer as Timer } from '../lib/use-rest-timer'

/**
 * The countdown, shown inside the logging flow rather than over it.
 *
 * Deliberately not a modal or an overlay: §2.1 says nothing interrupts
 * logging, and a rest timer that covers the weight input is exactly the
 * interruption that makes people go back to the other app. It sits in the
 * layout, and the inputs stay reachable the whole time.
 *
 * Remaining time is the filled part, draining from the inline start. The
 * fill is accent-900 — dark enough that the figures on top keep their
 * contrast, distinct enough to read at a glance from arm's length.
 */
export function RestTimerBar({ timer }: { timer: Timer }) {
  if (timer.remaining === null) return null

  const done = timer.remaining === 0
  const pct =
    timer.total && timer.total > 0
      ? Math.max(0, Math.min(100, (timer.remaining / timer.total) * 100))
      : 0

  return (
    <div
      className={`ring-edge relative overflow-hidden bg-surface ${
        done ? 'border border-accent' : ''
      }`}
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      {/* Progress drains right-to-left in LTR, start-to-end in RTL. */}
      <div
        aria-hidden="true"
        className="absolute inset-block-0 inset-inline-start-0 bg-accent-900 transition-[width] duration-300 ease-linear"
        style={{ width: `${pct}%` }}
      />
      <div className="relative flex min-h-[46px] items-center gap-2 px-3 py-1">
        <span className="text-[11px] text-muted">{done ? 'Rest done' : 'Rest'}</span>
        <span
          className={`tnum text-[23px] font-medium ${done ? 'text-accent' : 'text-text'}`}
          role="timer"
          aria-live="off"
        >
          {formatRest(timer.remaining)}
        </span>

        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => timer.adjust(-REST_STEP_SECONDS)}
            aria-label={`Subtract ${REST_STEP_SECONDS} seconds`}
            className="btn-base btn-secondary h-12 w-12 text-lg"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => timer.adjust(REST_STEP_SECONDS)}
            aria-label={`Add ${REST_STEP_SECONDS} seconds`}
            className="btn-base btn-secondary h-12 w-12 text-lg"
          >
            +
          </button>
          <button
            type="button"
            onClick={timer.stop}
            className="btn-base btn-quiet h-12 px-2 text-sm"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
