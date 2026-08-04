import type { CSSProperties } from 'react'

/**
 * The app's icon set: inline SVG, stroke = currentColor, drawn on a 24 grid.
 * No icon font, no library — five icons do not justify a dependency, and
 * inline SVG inherits colour from the text it sits beside.
 *
 * Directional icons (the back chevron) point to the inline start. When the
 * Arabic RTL locale lands (Stage 5) they must flip with the layout; the
 * transform hooks on `[dir='rtl']` in index.css, not here.
 */

interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
}

function Svg({
  size = 22,
  className,
  style,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

/** Chevron pointing to the inline start. Flipped for RTL via .icon-start. */
export function IconBack(props: IconProps) {
  return (
    <Svg {...props} className={`icon-start ${props.className ?? ''}`}>
      <polyline points="14.5 5.5 8 12 14.5 18.5" />
    </Svg>
  )
}

/** A loaded bar: the Log tab. */
export function IconBarbell(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="2.5" y1="12" x2="21.5" y2="12" />
      <rect
        x="4.5"
        y="7"
        width="3"
        height="10"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="16.5"
        y="7"
        width="3"
        height="10"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  )
}

/** A clock wound backwards: the History tab. */
export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12 7.5 12 12 15.2 13.8" />
    </Svg>
  )
}

/** A rising line: the Progress tab. */
export function IconTrend(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="3.5 16.5 9.5 10.5 13.5 14 20.5 7" />
      <polyline points="15.5 7 20.5 7 20.5 12" />
    </Svg>
  )
}

/** Vertical ellipsis: overflow actions. */
export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5.4" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.6" r="1.7" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Disclosure chevron. Rotate 180° via class when open. */
export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="6 9.5 12 15.5 18 9.5" />
    </Svg>
  )
}
