import { formatRest, REST_STEP_SECONDS } from '../lib/use-rest-timer'
import type { RestTimer as Timer } from '../lib/use-rest-timer'
import { describeRest } from '../lib/rest'
import { useLocale } from '../lib/locale-context'

/**
 * The rest chip — the design's compact presentation of the same deadline
 * timer the bar carried since the U-series. Still inside the logging flow,
 * never over it: §2.1 says nothing interrupts logging, and a rest timer
 * that covers the weight input is exactly the interruption that makes
 * people go back to the other app.
 *
 * The chip flips its ground (ink chip on paper, paper chip on ink) so the
 * countdown reads at arm's length without shouting. Tapping the body
 * expands to the full rest view (RestExpanded); +30s and skip act without
 * expanding. Two worlds, deliberately: the design's chip and expanded
 * screen, the app's engine, keep-default affordance, and 48px targets.
 *
 * The ring updates once a second with a one-second linear transition, for
 * the same reason the old drain did: a countdown that eases is lying
 * about the rate.
 */
const CHIP_RING = 62.8

export function RestChip({
  timer,
  onExpand,
  defaultSeconds,
  onSaveDefault,
}: {
  timer: Timer
  /** Opens the full rest view. Optional: the chip works standalone. */
  onExpand?: () => void
  /** What this lift's rest is currently set to, for the keep-it affordance. */
  defaultSeconds?: number
  onSaveDefault?: (seconds: number) => void
}) {
  const { t } = useLocale()
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
  const fraction =
    timer.total && timer.total > 0
      ? Math.max(0, Math.min(1, timer.remaining / timer.total))
      : 0

  return (
    <div
      className="overflow-hidden"
      style={{
        background: 'var(--color-text)',
        color: 'var(--color-ink)',
        borderRadius: '16px',
      }}
    >
      <div className="flex items-center gap-2 py-1.5 ps-3.5 pe-1.5">
        <button
          type="button"
          onClick={onExpand}
          aria-label={t('rest.expand')}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 text-start"
        >
          <svg
            viewBox="0 0 24 24"
            width={28}
            height={28}
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            {/* The ring FILLS as the rest elapses — see RestExpanded for the
                argument. Filling also retires a contradiction this chip
                carried: it drained to nothing and then special-cased `done`
                back to a full ring. */}
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CHIP_RING}
              strokeDashoffset={CHIP_RING * fraction}
              transform="rotate(-90 12 12)"
              style={{
                transition: 'stroke-dashoffset 1000ms var(--motion-linear)',
              }}
            />
          </svg>
          <span
            dir="ltr"
            role="timer"
            aria-live="off"
            className="tnum font-display min-w-[52px] text-[17px] font-bold"
          >
            {formatRest(timer.remaining)}
          </span>
          <span className="truncate text-[12px] opacity-70">
            {done ? t('rest.done') : t('rest.title')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => timer.adjust(2 * REST_STEP_SECONDS)}
          aria-label={`Add ${2 * REST_STEP_SECONDS} seconds`}
          className="min-h-12 shrink-0 px-3 text-[13px] font-semibold"
          style={{
            background: 'color-mix(in srgb, currentColor 14%, transparent)',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          <span dir="ltr">+30s</span>
        </button>
        <button
          type="button"
          onClick={timer.stop}
          className="min-h-12 shrink-0 px-3 text-[13px] font-semibold"
          style={{
            background: 'color-mix(in srgb, currentColor 14%, transparent)',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          {t('rest.skip')}
        </button>
      </div>

      {adjusted && (
        <div
          className="relative"
          style={{
            borderTop: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
          }}
        >
          <button
            type="button"
            onClick={() => onSaveDefault(timer.total as number)}
            className="flex h-12 w-full items-center px-3.5 text-start text-[13px] opacity-80"
          >
            {t('rest.keep_default', {
              duration: describeRest(timer.total as number),
            })}
          </button>
        </div>
      )}
    </div>
  )
}
