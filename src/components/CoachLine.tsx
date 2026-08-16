import type { ReactNode } from 'react'

/**
 * The app-wide grammar for "why the model said this" — design v3.0, doctrine 1.
 *
 * One sentence (13/400, muted) and one chip carrying the figures it came from.
 * **No chip, no claim**: `CoachLine` returns null when it has no chip, and that
 * is the entire enforcement mechanism for the acceptance item "no AI text
 * renders without its chip". A caller cannot forget, because forgetting
 * renders nothing.
 *
 * It is also the cheapest honesty check the AI layer has. A chip that
 * disagrees with the charts is a claim the reader can catch without trusting
 * anything — which is why the figures go in the chip and never in the prose
 * (§Voice rules), and why every producer of a line in `lib/` returns numbers
 * rather than sentences.
 */

export function DataChip({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  // `dir="ltr"` on every chip. Its contents are figures and units, and §RTL
  // keeps figures Latin and tabular in both locales — an Arabic layout that
  // mirrors `▲ 2.5 kg / 4 wk` renders it backwards, which is the exact defect
  // the ghost rows shipped with in 2026-08.
  return (
    <span dir="ltr" className={`chip-data tnum ${className}`}>
      {children}
    </span>
  )
}

/**
 * One coach utterance: the sentence, then its chip, then silence.
 *
 * `tone` exists because the same grammar appears on both grounds — paper cards
 * and the flip ground of the Today brief — and the muted step differs. It is
 * not a second colour: both are the theme's own text at reduced emphasis.
 */
export function CoachLine({
  line,
  chip,
  tone = 'paper',
  className = '',
}: {
  line: string | null | undefined
  /** The figures. Absent means the line does not render at all. */
  chip: string | null | undefined
  tone?: 'paper' | 'flip'
  className?: string
}) {
  if (!line || !chip) return null

  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <p
        className="text-body leading-[1.55]"
        style={
          tone === 'flip'
            ? { color: 'color-mix(in srgb, var(--flip-text) 66%, transparent)' }
            : { color: 'var(--color-muted)' }
        }
      >
        {line}
      </p>
      <span
        dir="ltr"
        className="chip-data tnum"
        style={
          tone === 'flip'
            ? {
                // On the flip ground the chip needs the dark-theme treatment
                // whatever the app theme is: the card IS the opposite ground.
                backgroundColor: 'rgba(232, 73, 29, 0.14)',
                color: 'var(--color-accent-700)',
              }
            : undefined
        }
      >
        {chip}
      </span>
    </div>
  )
}
