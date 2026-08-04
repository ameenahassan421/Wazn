// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useBackLayer } from './use-back'

/** jsdom implements pushState/back and fires popstate asynchronously. */
async function goBack() {
  window.history.back()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('useBackLayer', () => {
  it('pushes one history entry when the layer opens', () => {
    const { unmount } = renderHook(() => useBackLayer(true, vi.fn()))
    expect(
      (window.history.state as { waznDepth?: number } | null)?.waznDepth,
    ).toBeGreaterThan(0)
    unmount()
  })

  it('closes the layer on system back instead of leaving', async () => {
    const close = vi.fn()
    renderHook(() => useBackLayer(true, close))

    await goBack()

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  it('consumes its entry when closed in-app', async () => {
    const { rerender } = renderHook(({ open }) => useBackLayer(open, vi.fn()), {
      initialProps: { open: true },
    })
    const depth = (window.history.state as { waznDepth?: number }).waznDepth

    rerender({ open: false })

    await waitFor(() => {
      const now =
        (window.history.state as { waznDepth?: number } | null)?.waznDepth ?? 0
      expect(now).toBeLessThan(depth ?? 1)
    })
  })

  it('closes only the topmost layer per back press', async () => {
    const closeOuter = vi.fn()
    const closeInner = vi.fn()
    renderHook(() => useBackLayer(true, closeOuter))
    renderHook(() => useBackLayer(true, closeInner))

    await goBack()

    await waitFor(() => expect(closeInner).toHaveBeenCalledTimes(1))
    expect(closeOuter).not.toHaveBeenCalled()
  })
})
