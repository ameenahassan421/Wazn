// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useIdle } from './use-idle'

/**
 * The gate the rest canvas is built on, tested on its own rather than only
 * through the surface — because the property that matters is not "it hides
 * quickly", it is **the asymmetry**: leaving idle is synchronous with the
 * event, entering it is polled. Getting the first one late puts a surface
 * under a thumb already travelling toward a check button, which is the one
 * thing §2.1 cannot tolerate. A test that only drove the component would pass
 * with the two directions swapped.
 */
const MS = 2000

function Probe({ active }: { active: boolean }) {
  const idle = useIdle(active, MS)
  return <span data-testid="state">{idle ? 'idle' : 'busy'}</span>
}

function state(container: HTMLElement) {
  return container.querySelector('[data-testid="state"]')?.textContent
}

/** Past the threshold and past at least one 250ms poll. */
function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function fire(type: string) {
  act(() => {
    document.dispatchEvent(new Event(type, { bubbles: true }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useIdle', () => {
  it('starts busy and only goes idle once the threshold has passed', () => {
    const { container } = render(<Probe active />)
    expect(state(container)).toBe('busy')
    wait(1500)
    expect(state(container)).toBe('busy')
    wait(900)
    expect(state(container)).toBe('idle')
  })

  /**
   * Synchronous with the event, not on the next poll. If this needed a timer
   * to advance, the canvas would still be on screen for up to 250ms after the
   * hand arrived — which is exactly when a tap lands.
   */
  it.each(['pointerdown', 'pointermove', 'wheel', 'scroll', 'keydown', 'touchstart'])(
    'leaves idle immediately on %s, with no timer advanced',
    (event) => {
      const { container } = render(<Probe active />)
      wait(2400)
      expect(state(container)).toBe('idle')
      fire(event)
      expect(state(container)).toBe('busy')
    },
  )

  it('needs the full quiet period again after being touched', () => {
    const { container } = render(<Probe active />)
    wait(2400)
    fire('pointerdown')
    wait(1500)
    expect(state(container)).toBe('busy')
    wait(900)
    expect(state(container)).toBe('idle')
  })

  it('is never idle while inactive', () => {
    const { container } = render(<Probe active={false} />)
    wait(5000)
    expect(state(container)).toBe('busy')
  })

  /**
   * The bug this shape exists to prevent. A rest ending and another starting
   * would otherwise inherit the previous rest's `idle`, and the canvas would
   * be up from the instant a check was pressed — with a thumb on the glass.
   */
  it('does not carry idleness across a disarm and re-arm', () => {
    const { container, rerender } = render(<Probe active />)
    wait(2400)
    expect(state(container)).toBe('idle')
    rerender(<Probe active={false} />)
    rerender(<Probe active />)
    expect(state(container)).toBe('busy')
  })

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Probe active />)
    unmount()
    expect(remove).toHaveBeenCalled()
    // A stray event after unmount must not reach a dead setState.
    expect(() => fire('pointerdown')).not.toThrow()
    remove.mockRestore()
  })
})
