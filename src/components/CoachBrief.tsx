import { useEffect, useRef, useState } from 'react'
import { useUnit } from '../lib/unit-context'
import type { Unit } from '../lib/units'
import {
  briefChip,
  briefSkeleton,
  fetchBriefBlock,
  fetchCoachLine,
  recordCoachView,
} from '../lib/coach'
import type { BriefBlock } from '../lib/coach'
import { IconClose, PlateDot } from './icons'
import { useLocale } from '../lib/locale-context'

/**
 * The pre-workout briefing — B1, offense plan §4-A1.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 * The two lines above the Start button that say what is due and what to beat.
 * It renders from SQL first and is *upgraded* by a sentence when one arrives,
 * so it has no loading state, no spinner, and no failure state — the three
 * things the screen the app opens on cannot afford.
 *
 * ── WHY IT DOES NOT COMPETE WITH START ──────────────────────────────────────
 * §4-A1: "One amber kicker, no hero button competition, dismissible, never
 * blocks Start." So: a quiet surface card, no accent border, no button of its
 * own, and the only amber on it is the kicker and the chip's figures. Start
 * keeps the screen's single hero treatment, and this card sitting above it
 * pushes it *down* the screen — further into the thumb zone, not out of it.
 *
 * ── AND NOT DURING A WORKOUT ────────────────────────────────────────────────
 * "The moment a workout starts, the coach disappears until Finish." That is
 * enforced by where this is mounted: the idle branch of LogScreen, which does
 * not render at all while a workout is open. Nothing here needs to check.
 */
export function CoachBrief() {
  const { t, locale } = useLocale()
  const { unit } = useUnit()
  const [block, setBlock] = useState<BriefBlock | null>(null)
  /**
   * The model's sentence, carrying the unit it was written in.
   *
   * The unit rides along rather than being cleared by an effect when the
   * toggle moves — CLAUDE.md's state rule, and the reason for it is visible
   * here: without it, flipping to lbs would leave a kilogram sentence on
   * screen until the refetch landed, which is the exact defect the whole
   * conversion exists to remove. Carrying the owner makes the stale value
   * inert instead, and the skeleton (which converts locally) covers the gap.
   */
  const [phrased, setPhrased] = useState<{
    unit: Unit
    line: string
    chip?: string
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  /** One view event per mount, not one per render. */
  const logged = useRef(false)

  useEffect(() => {
    let active = true
    void (async () => {
      const facts = await fetchBriefBlock()
      if (!active) return
      setBlock(facts)

      // The sentence is asked for only when there is a card to improve. A
      // model call whose output has nowhere to go is a model call not worth
      // making — and on a brand-new account, that is every call.
      if (!facts || !briefSkeleton(facts, unit, locale)) return

      const result = await fetchCoachLine('briefing', unit)
      if (!active || !result.line) return
      setPhrased({ unit, line: result.line, chip: result.chip })
    })()
    return () => {
      active = false
    }
    // `unit` IS a dependency: the sentence is written by a model that was
    // handed one unit, so a toggle needs a different sentence. The function
    // caches per unit, so coming back to a unit already seen costs nothing.
  }, [unit, locale])

  const current = phrased?.unit === unit ? phrased : null
  const skeleton = briefSkeleton(block, unit, locale)
  const line = current?.line ?? skeleton
  const chip = current?.chip ?? briefChip(block, unit, locale)

  // The card only exists when it has something to say. An empty briefing is
  // not an empty state — it is one fewer thing between a lifter and Start.
  useEffect(() => {
    if (!line || dismissed || logged.current) return
    logged.current = true
    void recordCoachView('briefing', 'view')
  }, [line, dismissed])

  if (!line || dismissed) return null

  return (
    <section className="surface-card ps-[18px] pe-1 py-4" aria-label={t('brief.label')}>
      {/* The design's coach card: the plate mark, the kicker, the sentence.
          The mark is what makes this read as the coach speaking rather than
          as one more panel — it is the only glyph on the home surface. */}
      <div className="flex items-start gap-3">
        <PlateDot size={30} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 pe-1">
          <h2 className="kicker">{t('brief.title')}</h2>
          {/* Keyed on the text so the sentence arriving is an authored moment
              — it settles in rather than swapping under the eye. The skeleton
              is already correct, so this is the only motion the card has. */}
          <p key={line} className="coach-in mt-1.5 text-[14.5px] leading-[1.55]">
            {line}
          </p>
          {chip && (
            <span dir="ltr" className="chip-data mt-2 inline-flex">
              {chip}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true)
            void recordCoachView('briefing', 'dismiss')
          }}
          // 48px of target on a 22px glyph. The card is quiet, so the control
          // that removes it should be quieter still — but never smaller.
          className="press -mt-1 grid h-12 w-12 shrink-0 place-items-center text-muted"
          aria-label={t('brief.hide')}
        >
          <IconClose size={18} />
        </button>
      </div>
    </section>
  )
}
