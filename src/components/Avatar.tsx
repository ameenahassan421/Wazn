import { PlateRing } from './icons'

/**
 * The ink disc with a bone initial that the design puts in the home's status
 * row and at the top of Settings.
 *
 * No photograph, and not as a placeholder for one: nothing in the app stores
 * an avatar, there is no upload path and no bucket, and drawing a camera
 * button for a feature that does not exist is a promise. A monogram is the
 * whole feature.
 *
 * With no username yet — a fresh account, before anyone claims one — it falls
 * back to the plate rather than to a letter. "?" or a blank disc reads as
 * something failing to load; the mark reads as the app.
 */
export function Avatar({
  name,
  size = 38,
  className,
}: {
  name: string | null
  size?: number
  className?: string
}) {
  // `Intl.Segmenter` rather than `name[0]`: a name starting with an emoji or
  // an astral-plane character would otherwise be cut in half and render as a
  // replacement box. Falls back to the code unit where it is unavailable.
  const initial = name?.trim() ? firstGrapheme(name.trim()).toUpperCase() : null

  return (
    // Surface plus a hairline ring, NOT the inverted flip pair.
    //
    // The flip pair solved a real problem: under the old paper default,
    // `bg-ink` was bone and the disc vanished bone-on-bone. It solved it by
    // inverting, which on the iron ground produces a solid cream puck with a
    // dark letter — loud, and the P0 gate caught it as the one element on
    // Home that reads brighter than the hero CTA.
    //
    // v5 draws it as a dark disc, a light initial and a hairline edge, and
    // `surface` + `ring-edge` is that in both themes without inverting
    // anything: surface is a raised card on either ground, so the disc reads
    // as chrome sitting on the page rather than as a light source on it.
    <span
      aria-hidden="true"
      className={`ring-edge flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
      }}
    >
      {initial ? (
        <span
          dir="auto"
          className="font-display leading-none font-bold"
          style={{ fontSize: Math.round(size * 0.37) }}
        >
          {initial}
        </span>
      ) : (
        <PlateRing size={Math.round(size * 0.46)} />
      )}
    </span>
  )
}

function firstGrapheme(s: string): string {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return seg.segment(s)[Symbol.iterator]().next().value?.segment ?? s[0]
  } catch {
    return [...s][0] ?? s[0]
  }
}
