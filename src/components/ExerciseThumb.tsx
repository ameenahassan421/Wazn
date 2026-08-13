import { useState } from 'react'
import type { Exercise } from '../lib/types'

/**
 * A thumbnail that cannot fail. Three states, in order of preference:
 * the matched image, then an initial tile if there is no image, then the same
 * initial tile if the image 404s or the network is gone.
 *
 * Nothing here blocks the picker: the img is lazy and async, and the tile is
 * painted underneath, so a slow image never leaves a hole in the list.
 *
 * The plan calls for "muscle-group colored" tiles, but §2.4 allows exactly one
 * accent. Colour-coding eleven muscle groups needs eleven hues and would break
 * that rule the moment it shipped. Distinction comes from the letter plus a
 * fixed neutral step instead — see DECISIONS.md. The redesign proposed
 * flattening every tile to one neutral; the stepped tones are kept, rebased
 * onto the warm ramp, because telling adjacent rows apart is why they exist.
 */
const TONES = [
  'bg-surface',
  'bg-tile-1',
  'bg-tile-2',
  'bg-tile-3',
  'bg-tile-4',
] as const

/**
 * Stable per-group tone so the same muscle always looks the same.
 *
 * The parameter is typed `string`, and at runtime it is whatever the row
 * actually carried. Exercises reach this component through `as Exercise`
 * casts on RPC results, so a column the query forgot to select arrives as
 * `undefined` and `undefined.length` throws — which is exactly how the
 * Progress tab went black during the 2026-08-07 visual pass. A thumbnail is
 * decoration; it has no business taking a screen down with it.
 */
function toneFor(group: string | null | undefined): string {
  if (!group) return TONES[0]
  let h = 0
  for (let i = 0; i < group.length; i += 1) h = (h * 31 + group.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}

export function ExerciseThumb({
  exercise,
  size = 48,
  radius,
}: {
  exercise: Exercise
  /** 64 in the picker, 48 in list rows and cards, 44 on the exercise card. */
  size?: number
  /**
   * Overrides the size-derived radius. The exercise card wants the design's
   * 12px at 44px, which the derivation reads as a small tile and rounds to
   * 4px; every other caller keeps the derivation by omitting this.
   */
  radius?: string
}) {
  const [failed, setFailed] = useState(false)
  // Truthiness rather than `!== null` for the same reason `toneFor` guards:
  // an absent column is `undefined`, which is not `null`, and would otherwise
  // render an `<img src="">` that only recovers via its own error handler.
  const showImage = Boolean(exercise.image_url) && !failed
  const initial = exercise.name?.charAt(0).toUpperCase() ?? '·'

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${toneFor(
        exercise.muscle_group,
      )}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? (size >= 56 ? 'var(--radius-md)' : 'var(--radius-sm)'),
      }}
      aria-hidden="true"
    >
      <span
        className="font-medium"
        style={{
          fontSize: Math.round(size * 0.33),
          color: 'color-mix(in srgb, var(--color-text) 55%, transparent)',
        }}
      >
        {initial}
      </span>
      {showImage && (
        <img
          src={exercise.image_url ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="thumb-photo absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  )
}
