import { describeBarMath, platesFor } from '../lib/plates'
import type { Unit } from '../lib/units'
import { useLocale } from '../lib/locale-context'
import { BarEndOn, IconChevronDown } from './icons'

/**
 * The plate card: what is on the bar, per side, written as an addition.
 *
 * The design puts this in the commit cluster rather than behind a tap,
 * because "what do I put on the bar" is the question standing between the
 * number on screen and the set actually happening. Promoting it reverses
 * the flow-protection argument LoadHelper was built on — logged as a
 * deviation in DECISIONS.md — and the bar picker and the warm-up ramp stay
 * one tap deeper, which is what this card's press opens.
 *
 * The card is inert in the prototype. Here it is the disclosure's control,
 * so it keeps a chevron: a surface that opens something and says so with
 * nothing at all is the one place this screen should not match pixel for
 * pixel.
 */
export function PlateCard({
  weight,
  unit,
  bar,
  expanded,
  detailsId,
  onToggle,
}: {
  /** The weight typed into the stepper, in display units. */
  weight: number
  unit: Unit
  /** The selected bar, in display units. The picker lives in the details. */
  bar: number
  expanded: boolean
  detailsId: string
  onToggle: () => void
}) {
  const { t } = useLocale()

  const result = platesFor(weight, unit, bar)
  // platesFor returns null below the bar, and an empty `perSide` at exactly
  // bar weight. Both are the same sentence to a lifter: nothing to load.
  const empty = result === null || result.perSide.length === 0
  const math = result === null ? `= ${bar}` : describeBarMath(result)

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={detailsId}
      className="surface-panel press flex w-full items-center gap-4 px-4 py-3 text-start"
    >
      <span className="min-w-0 flex-1">
        {/* The `kicker` utility, not the recipe by hand: it carries the RTL
            reset, and tracking out a connected script breaks its joins. */}
        <span className="kicker block">{t('load.on_bar')}</span>
        <span className="tnum font-display mt-[3px] block text-[15px] font-bold tracking-[-0.01em]">
          {empty && `${t('load.empty_bar')} `}
          {/* The figure is the one latin run in an otherwise translated
              line: isolated so bidi cannot reorder "20 + 1.25 = 62.5"
              against the Arabic word that follows it. */}
          <span dir="ltr">{math}</span> {t('load.total')}
        </span>
      </span>
      <BarEndOn width={88} className="shrink-0 text-text" />
      <IconChevronDown
        className={`shrink-0 text-muted ${expanded ? 'rotate-180' : ''}`}
        size={16}
      />
      {/* The visible content is the accessible name — it is the answer, and
          a screen reader should hear the maths. This says what pressing it
          does, which the maths alone does not. */}
      <span className="sr-only">{t('load.title')}</span>
    </button>
  )
}
