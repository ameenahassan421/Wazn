import { formatRest, REST_STEP_SECONDS } from '../lib/use-rest-timer'
import type { RestTimer as Timer } from '../lib/use-rest-timer'
import { describeRest } from '../lib/rest'

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
export function RestTimerBar({
  timer,
  defaultSeconds,
  onSaveDefault,
}: {
  timer: Timer
  /** What this lift's rest is currently set to, for the keep-it affordance. */
  defaultSeconds?: number
  onSaveDefault?: (seconds: number) => void
}) {
  if (timer.remaining === null) return null

  const done = timer.remaining === 0
  // The moment a preference exists is the moment somebody presses ±. Offering
  // to keep it here costs nothing when unused, needs no settings screen, and
  // is the only place in the app where the user is already thinking about how
  // long they rest on this lift. It disappears again the instant it is taken,
  // because the two numbers then agree.
  const adjusted =
    onSaveDefault !== undefined &&
    defaultSeconds !== undefined &&
    timer.total !== null &&
    timer.total !== defaultSeconds
  const pct =
    timer.total && timer.total > 0
      ? Math.max(0, Math.min(100, (timer.remaining / timer.total) * 100))
      : 0

  return (
    <div
      className="relative overflow-hidden bg-surface"
      style={{
        borderRadius: 'var(--radius-md)',
        // The ring itself turns amber when the rest is up. Adding a border on
        // top of the hairline instead would inset the content by a pixel and
        // shuffle the whole row at the moment the timer lands.
        boxShadow: done
          ? '0 0 0 1px var(--color-accent), var(--top-light)'
          : 'var(--ring-hairline)',
      }}
    >
      {/* Progress drains right-to-left in LTR, start-to-end in RTL.
          `pct` is computed from whole seconds, so it changes once a second.
          The transition is a second long to match: at 300ms the bar lurched
          for a third of every second and then sat frozen, which reads as a
          stutter rather than as time passing. Linear, because a countdown
          that eases is lying about the rate. This is the motion system's one
          use of `linear` and its one duration off the four-token scale — it
          is a readout, not a response to a tap.

          `scaleX` on a full-width bar rather than an animated `width`: width
          is a layout property, and making the transition continuous means it
          would now recompute layout every frame for the whole 60-180s rest,
          on a budget Android, mid-workout. A transform is composited instead
          — no layout, no paint. The two are pixel-identical here because the
          bar is a childless solid rectangle whose corners are clipped by the
          parent, so there is nothing for the scale to distort.

          `transform-origin` is physical, with no logical keyword, so it flips
          for RTL the same way `layer-in` does. */}
      <div
        aria-hidden="true"
        className="timer-drain absolute inset-block-0 start-0 w-full bg-accent-900"
        style={{
          transform: `scaleX(${pct / 100})`,
          transition: `transform 1000ms var(--motion-linear)`,
        }}
      />
      <div className="relative flex min-h-[50px] items-center gap-2 px-3 py-1">
        <span className="kicker">{done ? 'Rest done' : 'Rest'}</span>
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

      {adjusted && (
        <div className="relative border-t border-line">
          <button
            type="button"
            onClick={() => onSaveDefault(timer.total as number)}
            className="btn-base btn-ghost h-12 w-full justify-start px-3 text-[13px]"
          >
            Keep {describeRest(timer.total as number)} as the rest for this lift
          </button>
        </div>
      )}
    </div>
  )
}
