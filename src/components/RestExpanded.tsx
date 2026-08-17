import { useEffect, useRef } from 'react'
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
 * Ink-grounded on the app's own tokens. This used to hardcode `#16130e` on
 * `#f7f3ec` so it stayed dark under the paper theme; v5 leaves one ground, so
 * the hardcoding says nothing the tokens do not, and it survived the palette
 * inversion as a paper-coloured layer over an iron app.
 *
 * The engine is untouched: the same deadline-based timer the chip reads.
 */
const RING = 257.6

export function RestExpanded({
  timer,
  onCollapse,
  nextLabel,
  card,
  takeover = false,
}: {
  timer: RestTimer
  onCollapse: () => void
  /** "Bench Press — set 4", already composed and localized by the caller. */
  nextLabel: string | null
  /** The rest-canvas fact, when one is showing; the coach voice up here. */
  card: RestCard | null
  /**
   * TRUE when the canvas appeared on its own after a commit (v5 screen 08),
   * FALSE when the lifter tapped the chip to open it.
   *
   * The two are different surfaces wearing the same pixels, and conflating
   * them is what made the takeover unshippable in P0 #5:
   *
   *  - A layer a user opened is a dialog. Focus moves into it, Escape closes
   *    it, the background goes `inert`. That is correct: they asked for it.
   *  - A layer that appears unbidden is NOT a dialog. v5 calls screen 08
   *    "passive, silent, no inputs", and do-not-regress #3 says the repeat-set
   *    commit stays one tap. Both fail the moment this thing takes focus and
   *    marks the page `inert`, because `inert` kills pointer events too, so
   *    the BANK IT bar behind it stops being tappable no matter what paints
   *    on top.
   *
   * So the takeover claims none of the dialog contract AND takes no pointer
   * events at all — see the effect below, which is the load-bearing half. The
   * back gesture still dismisses it, because that costs the page nothing.
   */
  takeover?: boolean
}) {
  const { t } = useLocale()
  useBackLayer(true, onCollapse)
  const layerRef = useRef<HTMLDivElement>(null)
  useModalLayer(layerRef, onCollapse, !takeover)

  /**
   * ── THE TAKEOVER DOES NOT INTERCEPT ────────────────────────────────────────
   *
   * v5 screen 08: "Passive, silent, no inputs; vanishes on interaction." The
   * first implementation read "tap anywhere dismisses" as "the layer eats the
   * tap", and that is what made the takeover unshippable: with the canvas
   * swallowing pointers, every control on the board cost dismiss-then-act.
   * GATE U2 could be rescued with a z-index, and "Back to workout" could not,
   * so two GATE 4 airplane-mode tests timed out reaching it.
   *
   * The layer is `pointer-events: none` instead. The browser hit-tests
   * straight through to whatever is underneath, so the first tap lands where
   * the lifter aimed it AND this listener clears the canvas on the way past.
   * One tap, everywhere, not just on BANK IT. Nothing is rescued by exception.
   *
   * That also settles the four controls this surface used to carry: with no
   * pointer events they cannot work, and screen 08 says it has no inputs. The
   * ±30s and skip live on the rest bar, which is where a lifter who wants to
   * change the timer is already looking.
   *
   * `pointerdown` and not `click`: a click fires after the press completes, so
   * a drag or a long press would leave the canvas up under a moving finger.
   */
  useEffect(() => {
    if (!takeover) return
    const dismiss = () => onCollapse()
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [takeover, onCollapse])

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
      role={takeover ? 'status' : 'dialog'}
      aria-modal={takeover ? undefined : true}
      aria-live={takeover ? 'polite' : undefined}
      tabIndex={-1}
      aria-label={t('rest.title')}
      onClick={takeover ? undefined : onCollapse}
      // z-29 under the commit cluster's z-31 so BANK IT reads as being ON the
      // canvas rather than behind it. Paint order only: the takeover takes no
      // pointer events at all, so nothing depends on this number for reach.
      // z-40 over everything when the lifter opened it deliberately.
      className={`fixed inset-0 flex flex-col ${takeover ? 'z-[29]' : 'z-40'}`}
      style={{
        background: 'var(--color-ink)',
        color: 'var(--color-text)',
        pointerEvents: takeover ? 'none' : undefined,
      }}
    >
      {/* Chrome, not content. Screen 08 has no inputs, and under `takeover`
          these could not take a press anyway. Omitted rather than rendered
          dead: a button a screen reader announces and nothing can activate is
          worse than no button. The spacer keeps the ring where it was. */}
      {takeover ? (
        <div
          style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', height: 48 }}
        />
      ) : (
        <div
          className="flex items-center gap-3 px-[18px]"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onCollapse}
            aria-label={t('rest.collapse')}
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'rgba(236, 231, 220, 0.08)' }}
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
            className="h-12 px-2 text-label font-semibold"
            style={{ color: 'var(--color-muted)' }}
          >
            {t('rest.skip_long')}
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-[22px]">
        {/* v5 screen 08's opening line. `soft` because it is the coach's
            voice, not a section label. */}
        <p className="kicker" style={{ color: 'var(--color-accent-300)' }}>
          {t('rest.thinking')}
        </p>
        <div className="relative flex h-[250px] w-[250px] items-center justify-center">
          <svg
            viewBox="0 0 96 96"
            width={250}
            height={250}
            className="absolute inset-0"
          >
            <circle
              cx="48"
              cy="48"
              r="41"
              fill="none"
              stroke="rgba(236, 231, 220, 0.12)"
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
              className="tnum font-display text-mega font-extrabold tracking-[-0.03em]"
            >
              {formatRest(timer.remaining)}
            </p>
            {/* The `kicker` utility, not the recipe by hand: it carries the
                RTL reset that keeps Arabic letters joined. */}
            <p className="kicker mt-1" style={{ color: 'var(--color-muted)' }}>
              {t('rest.of', { t: formatRest(timer.total) })}
            </p>
          </div>
        </div>

        {/* The layer dismisses on any tap, so the controls inside it have to
            stop the event or "+30s" would add thirty seconds and then close
            the surface that shows them. */}
        {!takeover && (
          <div className="flex gap-2.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => timer.adjust(-2 * REST_STEP_SECONDS)}
              className="min-h-12 px-6 text-body font-semibold"
              style={{
                background: 'rgba(236, 231, 220, 0.1)',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              <span dir="ltr">− 30s</span>
            </button>
            <button
              type="button"
              onClick={() => timer.adjust(2 * REST_STEP_SECONDS)}
              className="min-h-12 px-6 text-body font-semibold"
              style={{
                background: 'rgba(236, 231, 220, 0.1)',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              <span dir="ltr">+ 30s</span>
            </button>
          </div>
        )}

        {card && (
          <div
            className="flex max-w-[320px] items-start gap-3 px-[18px] py-4"
            style={{
              background: 'rgba(236, 231, 220, 0.06)',
              borderRadius: 'var(--radius-panel)',
            }}
          >
            <PlateDot size={24} />
            <p
              className="text-body leading-relaxed"
              style={{ color: 'var(--color-text)' }}
            >
              {card.kicker} · <span dir="ltr">{card.value}</span>
              {card.note ? ` — ${card.note}` : ''}
            </p>
          </div>
        )}
      </div>

      <div
        className="flex flex-col gap-3 px-[22px]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 30px)' }}
      >
        <p className="kicker text-center" style={{ color: 'var(--color-faint)' }}>
          {t('rest.tap_early')}
        </p>
        {/* A row, not a control, under `takeover`. It says what is next; the
            tap that acts on it is the one that lands on the board underneath.
            Rendering a <button> here would put a second announced control on
            a surface screen 08 says has none. */}
        {nextLabel && (
          <NextRow
            takeover={takeover}
            onCollapse={onCollapse}
            className="flex min-h-12 w-full items-center justify-between px-[18px] py-3.5"
            style={{
              background: 'rgba(236, 231, 220, 0.06)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <span
              className="meta-mono text-meta"
              style={{ color: 'var(--color-muted)' }}
            >
              {t('rest.next')}&nbsp;&nbsp;
              <span style={{ color: 'var(--color-text)' }}>{nextLabel}</span>
            </span>
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="icon-start"
            >
              <path d="M10 5l7 7-7 7" />
            </svg>
          </NextRow>
        )}
      </div>
    </div>
  )
}

/**
 * The next-up row: a button when the lifter opened this surface, an inert
 * `<div>` when it opened itself. Same pixels either way.
 */
function NextRow({
  takeover,
  onCollapse,
  className,
  style,
  children,
}: {
  takeover: boolean
  onCollapse: () => void
  className: string
  style: React.CSSProperties
  children: React.ReactNode
}) {
  if (takeover) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }
  return (
    <button type="button" onClick={onCollapse} className={className} style={style}>
      {children}
    </button>
  )
}
