// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * The boundary is the thing that stops one leaf crash blanking a whole tab,
 * so the cases that matter are the recovery paths, not the happy one.
 *
 * `reportError` is mocked rather than exercised: it reaches Supabase, and this
 * suite runs with no network by design.
 */
const reported: { boundary: string; message: string }[] = []
vi.mock('../lib/report-error', () => ({
  reportError: ({ error, boundary }: { error: unknown; boundary: string }) => {
    reported.push({ boundary, message: (error as Error).message })
    return Promise.resolve()
  },
}))

function Boom({ throws }: { throws: boolean }): React.ReactElement {
  if (throws) throw new Error('kaboom')
  return <p>content</p>
}

// A caught render error is still re-thrown into the environment by React's
// dev build, so both jsdom's window `error` event and console.error fire even
// though the boundary handled it. Suppressing both keeps a passing run
// readable — 200 lines of expected stack trace is how a real failure gets
// scrolled past.
const swallow = (event: Event) => event.preventDefault()
let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  reported.length = 0
  window.addEventListener('error', swallow)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  window.removeEventListener('error', swallow)
  consoleError.mockRestore()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary boundary="log">
        <Boom throws={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(reported).toHaveLength(0)
  })

  it('catches a render error instead of unmounting the tree', () => {
    render(
      <ErrorBoundary boundary="progress">
        <Boom throws={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Something broke/i)).toBeInTheDocument()
  })

  it('tells the user their logged sets are safe before anything else', () => {
    // The one question that matters mid-workout. Every set is written to
    // workout_sets on commit before local state changes, so this is a fact.
    render(
      <ErrorBoundary boundary="log">
        <Boom throws={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/already saved/i)).toBeInTheDocument()
  })

  it('reports the failure with the boundary that caught it', () => {
    render(
      <ErrorBoundary boundary="friends">
        <Boom throws={true} />
      </ErrorBoundary>,
    )
    expect(reported).toEqual([{ boundary: 'friends', message: 'kaboom' }])
  })

  it('recovers when Try again is pressed and the cause is gone', async () => {
    function Harness() {
      const [throws, setThrows] = useState(true)
      return (
        <>
          <button onClick={() => setThrows(false)}>fix it</button>
          <ErrorBoundary boundary="log">
            <Boom throws={throws} />
          </ErrorBoundary>
        </>
      )
    }
    render(<Harness />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByText('fix it'))
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears itself when resetKey changes', async () => {
    // This is what makes "switch tabs and come back" work in App.tsx without
    // a reload — the tab is the reset key.
    function Harness() {
      const [tab, setTab] = useState('log')
      return (
        <>
          <button onClick={() => setTab('history')}>switch</button>
          <ErrorBoundary boundary={tab} resetKey={tab}>
            <Boom throws={tab === 'log'} />
          </ErrorBoundary>
        </>
      )
    }
    render(<Harness />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByText('switch'))
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('gives the recovery control a hot-path touch target', () => {
    // §2.4: hot-path controls are 58-66px. A crash screen is exactly where a
    // 32px button gets missed by a shaking hand.
    render(
      <ErrorBoundary boundary="log">
        <Boom throws={true} />
      </ErrorBoundary>,
    )
    const button = screen.getByRole('button', { name: /try again/i })
    expect(button.className).toMatch(/h-\[58px\]/)
  })
})
