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

/** A clock wound backwards: the History tab. */
export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12 7.5 12 12 15.2 13.8" />
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

/**
 * Dismiss. Symmetrical, so it needs no RTL flip.
 *
 * Drawn rather than typed: a `×` is a multiplication sign in a product whose
 * set rows are full of "100 × 5", and the two would sit four lines apart on
 * the same screen.
 */
export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
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

/**
 * A heart, for the like on a feed card.
 *
 * Design v2.1 names it explicitly, which reverses an earlier call: the first
 * Friends build used a plate, on the reasoning that this app's shape language
 * is plates and a heart is borrowed vocabulary. The handoff is the newer and
 * more specific instruction, and it is right for a reason the earlier note
 * missed — a plate outline at 20px reads as a "record" or a "weight", not as
 * approval, and a like that has to be explained is not one tap.
 */
export function IconHeart({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  )
}

/* ─── The plate glyphs — the design's marker set ──────────────────────────
   The prototype's iconography is one object at different states: a weight
   plate seen end-on. Drawn on the prototype's own 96 grid, fill rather
   than stroke, because a plate is a solid. `currentColor` carries the ring
   so the same glyph reads on any ground; the dot and check are always
   ember or paper by design. */

interface PlateProps {
  size?: number
  className?: string
}

/** Solid ring with the hole showing the ground through it. */
export function PlateRing({ size = 16, className }: PlateProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M48 4 a44 44 0 1 0 0 88 a44 44 0 1 0 0 -88 Z M48 33 a15 15 0 1 1 0 30 a15 15 0 1 1 0 -30 Z"
      />
    </svg>
  )
}

/** The coach mark: ring in the text colour, ember core. */
export function PlateDot({ size = 22, className }: PlateProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M48 4 a44 44 0 1 0 0 88 a44 44 0 1 0 0 -88 Z M48 33 a15 15 0 1 1 0 30 a15 15 0 1 1 0 -30 Z"
      />
      <circle cx="48" cy="48" r="9" fill="var(--color-accent)" />
    </svg>
  )
}

/** Upcoming: the hollow outline. */
export function PlateHollow({ size = 16, className }: PlateProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="48"
        cy="48"
        r="34"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        opacity="0.55"
      />
    </svg>
  )
}

/** Done: filled ember plate with a paper check. */
export function PlateCheck({ size = 16, className }: PlateProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <circle cx="48" cy="48" r="40" fill="var(--color-accent)" />
      <path
        d="M30 50 l12 12 24 -26"
        fill="none"
        stroke="var(--color-text)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The PR mark: the plate with side plates loaded, ember. */
export function PlateLoaded({ size = 44, className }: PlateProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path
        fill="var(--color-accent)"
        fillRule="evenodd"
        d="M48 4 a44 44 0 1 0 0 88 a44 44 0 1 0 0 -88 Z M48 33 a15 15 0 1 1 0 30 a15 15 0 1 1 0 -30 Z M17 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z M73 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z"
      />
    </svg>
  )
}

/**
 * The mark itself, at size, in the caller's colour.
 *
 * `PlateLoaded` is the same geometry welded to the accent, which is right for
 * a PR badge and wrong for an empty state — the design's empty screens draw
 * this plate in ink at 14% and it has to take the text colour to do that.
 */
export function PlateSilhouette({ size = 120, className }: PlateProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M48 4 a44 44 0 1 0 0 88 a44 44 0 1 0 0 -88 Z M48 33 a15 15 0 1 1 0 30 a15 15 0 1 1 0 -30 Z M17 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z M73 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z"
      />
    </svg>
  )
}

/** The bar seen from the end: shaft, ember plate, collar, ghost plate. */
export function BarEndOn({
  width = 110,
  className,
}: {
  width?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 120 52"
      width={width}
      height={Math.round((width * 44) / 110)}
      aria-hidden="true"
      className={className}
    >
      <line
        x1="4"
        y1="26"
        x2="116"
        y2="26"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="30" y="3" width="11" height="46" rx="3" fill="var(--color-accent)" />
      <rect x="45" y="16" width="7" height="20" rx="2.5" fill="currentColor" />
      <rect
        x="14"
        y="19"
        width="9"
        height="14"
        rx="2"
        fill="currentColor"
        opacity="0.25"
      />
    </svg>
  )
}
