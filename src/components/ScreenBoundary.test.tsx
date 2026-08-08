// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenBoundary } from './ScreenBoundary'
import { ExerciseThumb } from './ExerciseThumb'
import type { Exercise } from '../lib/types'

function Boom(): never {
  throw new Error('leaf exploded')
}

describe('ScreenBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself; the boundary logs a second time on
    // purpose. Neither is a test failure, and both would drown the output.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children when nothing throws', () => {
    render(
      <ScreenBoundary screen="Progress">
        <p>the chart</p>
      </ScreenBoundary>,
    )
    expect(screen.getByText('the chart')).toBeInTheDocument()
  })

  it('catches a leaf crash and names the screen instead of going blank', () => {
    render(
      <ScreenBoundary screen="Progress">
        <Boom />
      </ScreenBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('This screen failed to draw.')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('promises the Log screen lost nothing', () => {
    render(
      <ScreenBoundary screen="Log" reassurance="Every set you logged is already saved.">
        <Boom />
      </ScreenBoundary>,
    )
    expect(
      screen.getByText('Every set you logged is already saved.'),
    ).toBeInTheDocument()
  })

  it('offers a retry that re-renders the screen once the cause is gone', async () => {
    const user = userEvent.setup()
    // Retry re-renders the children; it does not repair them. So the fixture
    // models the honest case — a transient failure, like an RPC that returned
    // a short row once — rather than pretending the button fixes bad code.
    let failing = true

    function Flaky() {
      if (failing) throw new Error('first paint failed')
      return <p>recovered</p>
    }

    render(
      <ScreenBoundary screen="Progress">
        <Flaky />
      </ScreenBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ExerciseThumb, the leaf that took Progress down', () => {
  it('renders a row whose muscle_group never arrived', () => {
    // Exactly the shape that blanked the Progress tab: an RPC result cast
    // through `as Exercise` with a column the query did not select.
    const partial = { id: 'x', name: 'Bench Press', image_url: null } as Exercise

    expect(() =>
      render(
        <ScreenBoundary screen="Progress">
          <ExerciseThumb exercise={partial} />
        </ScreenBoundary>,
      ),
    ).not.toThrow()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('survives a row with no name either', () => {
    const empty = {} as Exercise
    render(<ExerciseThumb exercise={empty} />)
    expect(screen.getByText('·')).toBeInTheDocument()
  })
})
