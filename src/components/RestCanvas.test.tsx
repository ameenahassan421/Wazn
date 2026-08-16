// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { RestCanvas } from './RestCanvas'
import type { RestCard } from '@wazn/core/rest-canvas'

/**
 * The canvas is the one surface that deliberately sits inside the flow §2.1
 * calls sacred, so what is tested here is the RULES, not the pixels: it appears
 * only when the hand is off the phone, it leaves the instant the hand comes
 * back, it retires before the set does, and one tap turns it off for good.
 *
 * Fake timers throughout, because every rule in the list is about time.
 */
const CARD: RestCard = {
  kind: 'target',
  kicker: 'Next up · Bench Press (Barbell) · set 2',
  value: '100 kg × 8',
  note: '+5 kg on last session',
}

/** Past the 2s idle threshold and past one 250ms poll. */
function goQuiet(ms = 2400) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function touch() {
  act(() => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RestCanvas', () => {
  it('shows nothing until the phone has been quiet', () => {
    render(<RestCanvas card={CARD} remaining={90} />)
    expect(screen.queryByText('100 kg × 8')).toBeNull()
    goQuiet()
    expect(screen.getByText('100 kg × 8')).toBeTruthy()
  })

  /**
   * The rule the whole design turns on. A canvas that lingers for even one
   * animation frame after the reach is a canvas that can take a tap meant for
   * a check button.
   */
  it('vanishes the moment the user reaches for the next set', () => {
    render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    expect(screen.getByText('100 kg × 8')).toBeTruthy()
    touch()
    expect(screen.queryByText('100 kg × 8')).toBeNull()
  })

  it('comes back after the hand comes off again', () => {
    render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    touch()
    goQuiet()
    expect(screen.getByText('100 kg × 8')).toBeTruthy()
  })

  /** The last seconds belong to the set that is about to happen. */
  it('stays away in the closing seconds of the rest', () => {
    const { rerender } = render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    expect(screen.getByText('100 kg × 8')).toBeTruthy()
    rerender(<RestCanvas card={CARD} remaining={6} />)
    expect(screen.queryByText('100 kg × 8')).toBeNull()
  })

  it('shows nothing at all when the deterministic layer had nothing to say', () => {
    render(<RestCanvas card={null} remaining={90} />)
    goQuiet()
    expect(screen.queryByRole('button')).toBeNull()
  })

  /**
   * A fresh rest starts with a thumb on the screen by definition — the user
   * just pressed a check. The canvas must not inherit the previous rest's
   * idleness and be there to meet it.
   */
  it('does not carry idleness from one rest into the next', () => {
    const { rerender } = render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    expect(screen.getByText('100 kg × 8')).toBeTruthy()
    rerender(<RestCanvas card={CARD} remaining={null} />)
    rerender(<RestCanvas card={CARD} remaining={120} />)
    expect(screen.queryByText('100 kg × 8')).toBeNull()
  })

  it('turns off permanently in one tap, and offers one way back', () => {
    const dismissed = vi.fn()
    const { unmount } = render(
      <RestCanvas card={CARD} remaining={90} onDismiss={dismissed} />,
    )
    goQuiet()
    act(() => {
      screen.getByLabelText('Turn off the rest canvas').click()
    })
    expect(dismissed).toHaveBeenCalledOnce()
    expect(screen.queryByText('100 kg × 8')).toBeNull()

    const undo = screen.getByRole('button', { name: /bring it back/i })
    expect(undo).toBeTruthy()

    // Remounted without pressing undo, the canvas stays gone — that is what
    // "permanently" means, and localStorage is what carries it.
    unmount()
    render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    expect(screen.queryByText('100 kg × 8')).toBeNull()
  })

  it('brings the canvas back when the undo is taken', () => {
    render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    act(() => {
      screen.getByLabelText('Turn off the rest canvas').click()
    })
    act(() => {
      screen.getByRole('button', { name: /bring it back/i }).click()
    })
    goQuiet()
    expect(screen.getByText('100 kg × 8')).toBeTruthy()
  })

  it('retires the undo on its own rather than keeping a control on the bar', () => {
    render(<RestCanvas card={CARD} remaining={90} />)
    goQuiet()
    act(() => {
      screen.getByLabelText('Turn off the rest canvas').click()
    })
    act(() => {
      vi.advanceTimersByTime(9000)
    })
    expect(screen.queryByRole('button', { name: /bring it back/i })).toBeNull()
  })

  it('reports one view per appearance, by kind', () => {
    const viewed = vi.fn()
    render(<RestCanvas card={CARD} remaining={90} onView={viewed} />)
    goQuiet()
    expect(viewed).toHaveBeenCalledWith('target')
    expect(viewed).toHaveBeenCalledOnce()
  })
})
