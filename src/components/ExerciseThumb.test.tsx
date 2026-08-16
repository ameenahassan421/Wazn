// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExerciseThumb } from './ExerciseThumb'
import type { Exercise } from '@wazn/core/types'

/**
 * The leaf that took the Progress tab down.
 *
 * `ErrorBoundary` is the safety net for this class of crash, but a net is not
 * a reason to keep falling: a thumbnail is decoration, and decoration has no
 * business failing a screen at all. Exercises reach this component through
 * `as Exercise` casts on RPC results, so a column the query forgot to select
 * arrives as `undefined` at runtime whatever the type says — which is exactly
 * how `toneFor` read `.length` of nothing during the 2026-08-07 visual pass.
 */
describe('ExerciseThumb, given a row the query did not fully select', () => {
  it('renders when muscle_group never arrived', () => {
    const partial = { id: 'x', name: 'Bench Press', image_url: null } as Exercise

    expect(() => render(<ExerciseThumb exercise={partial} />)).not.toThrow()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders when the name is missing too', () => {
    render(<ExerciseThumb exercise={{} as Exercise} />)
    expect(screen.getByText('·')).toBeInTheDocument()
  })

  it('gives the same group the same tone every time', () => {
    // The tile's whole job is telling adjacent rows apart, so the tone has to
    // be a function of the group and not of render order.
    const one = { id: 'a', name: 'Squat', muscle_group: 'quads', image_url: null }
    const two = { id: 'b', name: 'Leg Press', muscle_group: 'quads', image_url: null }
    const { container: first } = render(<ExerciseThumb exercise={one as Exercise} />)
    const { container: second } = render(<ExerciseThumb exercise={two as Exercise} />)

    const tone = (c: HTMLElement) =>
      [...c.firstElementChild!.classList].find((n) => n.startsWith('bg-'))
    expect(tone(first)).toBe(tone(second))
  })
})
