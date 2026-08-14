import { useRef } from 'react'
import { useLocale } from '../lib/locale-context'
import { useBackLayer } from '../lib/use-back'
import { useModalLayer } from '../lib/use-modal'
import { formatRest, REST_STEP_SECONDS } from '../lib/use-rest-timer'
import type { RestTimer } from '../lib/use-rest-timer'
import type { RestCard } from '../lib/rest-canvas'
import { PlateDot } from './icons'

/**
 * The expanded rest view — the design's full-screen rest, reached only by
 * tapping the chip and left by the chevron, the next row, the back gesture,
 * or the rest ending. It is a LAYER over the workout screen, never a route:
 * the board underneath does not unmount, so collapsing costs nothing.
 *
 * Deliberately ink-grounded in BOTH themes, like the design: rest is the
 * one moment the phone is at arm's length and the room is the point, so
 * the surface goes dark and quiet regardless of the paper default.
 *
 * The engine is untouched: the same deadline-based timer the chip reads.
 */
const RING = 257.6

export function RestExpanded({
  timer,
  onCollapse,
  nextLabel,
  card,
}: {
  timer: RestTimer
  onCollapse: () => void
  /** "Bench Press — set 4", already composed and localized by the caller. */
  nextLabel: string | null
  /** The rest-canvas fact, when one is showing; the coach voice up here. */
  card: RestCard | null
}) {
  const { t } = useLocale()
  useBackLayer(true, onCollapse)
  const layerRef = useRef<HTMLDivElement>(null)
  useModalLayer(layerRef, onCollapse)

  if (timer.remaining === null || timer.total === null) return null
  /**
   * The ring FILLS: empty at the start of the rest, whole at the end.
   *
   * R5b argued the opposite and was wrong. The handoff is not ambiguous about
   * this — the brand sheet states it as identity, "the rest timer *is* the
   * plate — it fills as you recover", and the behaviour spec gives the same
   * expression this line now uses. The objection R5b raised was real, but it
   * was an argument for moving BOTH rings, not for moving the design's: the
   * chip fills too now, and the plate you are loading while you recover is a
   * better idea than a bar draining away.
   */
  const offset = RING * (timer.remaining / timer.total)

  return (
    <div
      ref={layerRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={t('rest.title')}
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: '#16130e', color: '#f7f3ec' }}
    >
      <div
        className="flex items-center gap-3 px-[18px]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t('rest.collapse')}
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'rgba(247, 243, 236, 0.08)' }}
        >
          <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            timer.stop()
            onCollapse()
          }}
          className="h-12 px-2 text-[13px] font-semibold"
          style={{ color: '#9d968a' }}
        >
          {t('rest.skip_long')}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-[22px]">
        <div className="relative flex h-[240px] w-[240px] items-center justify-center">
          <svg
            viewBox="0 0 96 96"
            width={240}
            height={240}
            className="absolute inset-0"
          >
            <circle
              cx="48"
              cy="48"
              r="41"
              fill="none"
              stroke="rgba(247, 243, 236, 0.12)"
              strokeWidth="9"
            />
            <circle
              cx="48"
              cy="48"
              r="41"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={offset}
              transform="rotate(-90 48 48)"
              style={{ transition: 'stroke-dashoffset 1000ms var(--motion-linear)' }}
            />
          </svg>
          <div className="text-center">
            <p
              dir="ltr"
              role="timer"
              aria-live="off"
              className="tnum font-display text-[54px] font-extrabold tracking-[-0.03em]"
            >
              {formatRest(timer.remaining)}
            </p>
            {/* The `kicker` utility, not the recipe by hand: it carries the
                RTL reset that keeps Arabic letters joined. The colour is
                overridden because this layer is ink-grounded in both themes. */}
            <p className="kicker mt-1" style={{ color: '#9d968a' }}>
              {t('rest.of', { t: formatRest(timer.total) })}
            </p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => timer.adjust(-2 * REST_STEP_SECONDS)}
            className="min-h-12 px-6 text-sm font-semibold"
            style={{
              background: 'rgba(247, 243, 236, 0.1)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            <span dir="ltr">− 30s</span>
          </button>
          <button
            type="button"
            onClick={() => timer.adjust(2 * REST_STEP_SECONDS)}
            className="min-h-12 px-6 text-sm font-semibold"
            style={{
              background: 'rgba(247, 243, 236, 0.1)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            <span dir="ltr">+ 30s</span>
          </button>
        </div>

        {card && (
          <div
            className="flex max-w-[320px] items-start gap-3 px-[18px] py-4"
            style={{
              background: 'rgba(247, 243, 236, 0.06)',
              borderRadius: '18px',
            }}
          >
            <PlateDot size={24} />
            <p className="text-sm leading-relaxed" style={{ color: '#d6d1c6' }}>
              {card.kicker} · <span dir="ltr">{card.value}</span>
              {card.note ? ` — ${card.note}` : ''}
            </p>
          </div>
        )}
      </div>

      <div
        className="px-[22px]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 30px)' }}
      >
        {nextLabel && (
          <button
            type="button"
            onClick={onCollapse}
            className="flex min-h-12 w-full items-center justify-between px-[18px] py-3.5"
            style={{
              background: 'rgba(247, 243, 236, 0.06)',
              borderRadius: '16px',
            }}
          >
            <span className="meta-mono text-[13px]" style={{ color: '#9d968a' }}>
              {t('rest.next')}&nbsp;&nbsp;
              <span style={{ color: '#f7f3ec' }}>{nextLabel}</span>
            </span>
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="#9d968a"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="icon-start"
            >
              <path d="M10 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
