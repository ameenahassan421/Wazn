import { useEffect, useState } from 'react'
import { browserStorage } from '../lib/checkpoint'
import { useIdle } from '../lib/use-idle'
import { restCanvasEnabled, setRestCanvasEnabled } from '@wazn/core/rest-canvas'
import type { RestCard } from '@wazn/core/rest-canvas'
import { IconClose } from './icons'
import { useLocale } from '../lib/locale-context'

/**
 * The rest canvas — E1, offense plan §8-E1.
 *
 * ── THE RULES ARE THE FEATURE ───────────────────────────────────────────────
 * This is the one surface in the app that deliberately touches the flow §2.1
 * calls sacred, so every rule §8-E1 sets is load-bearing here rather than
 * aspirational:
 *
 *  - **Passive.** No input, no question, no prompt. The only two controls are
 *    the dismissal the spec mandates and the undo that makes a permanent
 *    dismissal safe to press by accident.
 *  - **Silent.** Nothing here makes a sound; the timer's optional haptic is
 *    untouched.
 *  - **Glanceable at three feet.** One kicker, one 26px tabular payload, one
 *    chip. That is the whole card.
 *  - **Dismissible permanently in one tap.**
 *  - **It vanishes the moment the user reaches for the next set** — see below.
 *  - **The log control never moves.** Nothing in this file touches the board or
 *    the timer row; the canvas mounts ABOVE both, inside the sticky wrapper
 *    that already exists, so the check buttons and the countdown keep the
 *    coordinates they have today. That is the claim the PR proves with a
 *    tap-count and a `measureCoreLoop` run either side.
 *
 * ── HOW "VANISHES WHEN YOU REACH" IS ACTUALLY ENFORCED ──────────────────────
 * Three gates, all of which must be open:
 *
 *  1. `useIdle` — nothing has been touched, scrolled or typed for two seconds.
 *     This is what makes the surface safe rather than merely well-behaved: it
 *     can only ever appear while the hand is off the phone, so it can never
 *     grow under a thumb already travelling toward a check. The first pointer
 *     event closes it in the capture phase, before any button sees the tap.
 *  2. `remaining > REACH_SECONDS` — the last stretch of a rest belongs to the
 *     set that is about to happen, not to a card about it.
 *  3. Not dismissed, and there is a card worth showing.
 *
 * The entrance is animated and the exit is not, which is not an oversight. An
 * animated retract would keep the canvas on screen for another 160ms after the
 * decision to leave, and those are exactly the 160ms in which a thumb lands.
 */

/** Quiet for this long before the canvas is allowed to appear. */
const IDLE_MS = 2000

/**
 * The last seconds of a rest, which belong to the bar. Long enough that a
 * lifter watching the countdown down to zero never sees the card jump away
 * under their eyes, short enough that a two-minute rest still spends most of
 * itself on the canvas.
 */
const REACH_SECONDS = 8

/** How long the undo stays after a dismissal, in ms. */
const UNDO_MS = 8000

export function RestCanvas({
  card,
  remaining,
  onView,
  onDismiss,
}: {
  /** The fact to show, or null for the plain timer exactly as today. */
  card: RestCard | null
  /** Seconds left on the rest. Null when no rest is running. */
  remaining: number | null
  /**
   * Fired whenever a card goes on screen. The caller decides how much of that
   * to record — the Log screen keeps it to once per workout, because "the
   * canvas was up during this session" is what the gate asks and twenty rows a
   * workout is not a better answer to it.
   */
  onView?: (kind: RestCard['kind']) => void
  /** Fired on the permanent dismissal. Not on the undo. */
  onDismiss?: () => void
}) {
  const { t } = useLocale()
  const [enabled, setEnabled] = useState(() => restCanvasEnabled(browserStorage()))
  const [undo, setUndo] = useState(false)

  const armed =
    enabled && card !== null && remaining !== null && remaining > REACH_SECONDS
  const idle = useIdle(armed, IDLE_MS)
  const showing = armed && idle

  // The undo retires on its own. It is an apology for a tap, not a control the
  // rest surface keeps.
  useEffect(() => {
    if (!undo) return
    const id = setTimeout(() => setUndo(false), UNDO_MS)
    return () => clearTimeout(id)
  }, [undo])

  /**
   * Reported by kind rather than by content, which is the same posture
   * `coach_views` takes for the briefing: what the gate needs to know is
   * whether the surface was on screen, and nothing in the app can observe
   * whether it was read.
   */
  const kind = showing ? (card?.kind ?? null) : null
  useEffect(() => {
    if (kind) onView?.(kind)
  }, [kind, onView])

  if (undo) {
    return (
      <button
        type="button"
        onClick={() => {
          setRestCanvasEnabled(browserStorage(), true)
          setEnabled(true)
          setUndo(false)
        }}
        className="btn-base btn-quiet h-12 w-full justify-start px-3 text-label"
      >
        {t('canvas.undo')}
      </button>
    )
  }

  if (!showing || !card) return null

  return (
    <section
      // The briefing's exact treatment, and deliberately so: the coach speaks
      // on three surfaces now, and one recognisable object beats three that
      // each look like a different feature.
      className="ring-edge bg-surface coach-in ps-3 pe-1 py-2.5"
      style={{ borderRadius: 'var(--radius-md)' }}
      aria-label={t('canvas.label')}
      // Never announced. It appears and leaves repeatedly across a two-minute
      // rest, and a screen reader narrating each transition would be the
      // interruption the whole surface is built to avoid. It is readable on
      // demand, like everything else on the board.
      aria-live="off"
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pe-1">
          <h2 className="kicker">{card.kicker}</h2>
          {/* The lift, in sentence case at a readable size rather than tracked
              out as part of the kicker. The first screenshot of this card had
              it in the kicker and it truncated mid-word, which is the one
              failure a surface built to be read at three feet cannot have. */}
          {card.subject && (
            <p className="mt-0.5 truncate text-label leading-tight text-muted">
              {card.subject}
            </p>
          )}
          {/* Baseline-aligned so the chip sits on the number's line, wrapping
              under it only when the two genuinely do not fit. */}
          {/* `auto` on the payload, because it is not always a figure: the
              target card says "127 lbs × 6" and the crew card says "3 trained
              today", which is a translated sentence. Unisolated, the figure
              printed "lbs × 6 127"; forced to ltr, the sentence printed
              backwards. The note flows with the page either way — it is
              always prose. */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
            <span
              dir="auto"
              className="tnum font-display text-fig font-medium leading-none"
            >
              {card.value}
            </span>
            {card.note && <span className="chip-data">{card.note}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setRestCanvasEnabled(browserStorage(), false)
            setEnabled(false)
            setUndo(true)
            onDismiss?.()
          }}
          // Top-inline-end, while Skip and the ± controls are bottom-inline-end
          // on the bar below. Fifty pixels apart, so the tap that turns the
          // canvas off and the tap that ends the rest are never neighbours.
          className="press -mt-1 grid h-12 w-12 shrink-0 place-items-center text-muted"
          aria-label={t('canvas.off')}
        >
          <IconClose size={18} />
        </button>
      </div>
    </section>
  )
}
