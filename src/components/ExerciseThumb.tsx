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

/** Stable per-group tone so the same muscle always looks the same. */
function toneFor(group: string): string {
  let h = 0
  for (let i = 0; i < group.length; i += 1) h = (h * 31 + group.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}

export function ExerciseThumb({
  exercise,
  size = 42,
}: {
  exercise: Exercise
  /** 44 in the set-entry header, 42 in list rows, 40 in cards, 38 compact. */
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const showImage = exercise.image_url !== null && !failed

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${toneFor(
        exercise.muscle_group,
      )}`}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-sm)',
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
        {exercise.name.charAt(0).toUpperCase()}
      </span>
      {showImage && (
        <img
          src={exercise.image_url ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  )
}
