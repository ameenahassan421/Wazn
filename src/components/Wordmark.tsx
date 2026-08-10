import type { CSSProperties } from 'react'
import {
  DOT_D,
  LETTERS_D,
  LETTER_STROKE,
  MARK_H,
  MARK_W,
  SHAFT,
} from './wordmark-paths'
import { useLocale } from '../lib/locale-context'

/** The Wazn mark: وزن composed as a barbell — "Loaded Ink".
 *
 * The letters are outlines, not live text — Aref Ruqaa is not shipped with
 * the app, and a wordmark that depends on a webfont renders as a fallback
 * serif on first paint. Regenerate with scripts/build_logo.py if the mark
 * changes; the geometry lives in the generated wordmark-paths.ts.
 *
 * Letters take currentColor (chalk); the shaft and the ز plate face are
 * always accent (iron). و and ن are the two weights, the ligature stroke at
 * their base is the bar, running past both like sleeve ends.
 */
export function Wordmark({
  height = 34,
  className,
  style,
}: {
  height?: number
  className?: string
  style?: CSSProperties
}) {
  const { t } = useLocale()
  return (
    <svg
      viewBox={`0 0 ${MARK_W} ${MARK_H}`}
      height={height}
      className={className}
      style={{ width: 'auto', display: 'block', ...style }}
      role="img"
      aria-label={t('wordmark.label')}
    >
      <line
        x1={SHAFT.x0}
        y1={SHAFT.y}
        x2={SHAFT.x1}
        y2={SHAFT.y}
        stroke="var(--color-accent)"
        strokeWidth={SHAFT.t}
        strokeLinecap="round"
      />
      <path
        d={LETTERS_D}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={LETTER_STROKE}
        strokeLinejoin="round"
      />
      <path d={DOT_D} fill="var(--color-accent)" fillRule="evenodd" />
    </svg>
  )
}
