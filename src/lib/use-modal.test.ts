// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { createRef } from 'react'
import { useModalLayer } from './use-modal'

function layer(html: string) {
  const opener = document.createElement('button')
  opener.textContent = 'open'
  document.body.append(opener)
  opener.focus()

  const node = document.createElement('div')
  node.tabIndex = -1
  node.innerHTML = html
  document.body.append(node)

  const ref = createRef<HTMLElement>()
  ;(ref as { current: HTMLElement | null }).current = node
  return { opener, node, ref }
}

describe('useModalLayer', () => {
  it('moves focus into the layer, onto its first control', () => {
    const { node, ref } = layer('<button id="close">close</button>')
    renderHook(() => useModalLayer(ref, () => {}))
    expect(document.activeElement).toBe(node.querySelector('#close'))
  })

  it('falls back to the container when the layer has no controls', () => {
    const { node, ref } = layer('<p>nothing to press</p>')
    renderHook(() => useModalLayer(ref, () => {}))
    expect(document.activeElement).toBe(node)
  })

  it('closes on Escape — the keyboard equivalent of the back gesture', () => {
    const onClose = vi.fn()
    const { ref } = layer('<button>close</button>')
    renderHook(() => useModalLayer(ref, onClose))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    const { ref } = layer('<button>close</button>')
    renderHook(() => useModalLayer(ref, onClose))
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('returns focus to whatever opened it', () => {
    const { opener, ref } = layer('<button>close</button>')
    const { unmount } = renderHook(() => useModalLayer(ref, () => {}))
    unmount()
    expect(document.activeElement).toBe(opener)
  })

  it('stops listening once closed, so a stale layer cannot fire', () => {
    const onClose = vi.fn()
    const { ref } = layer('<button>close</button>')
    const { unmount } = renderHook(() => useModalLayer(ref, onClose))
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  /*
   * `aria-modal` is a claim, not a mechanism. Without this the keyboard walked
   * straight out of the dialog into the page behind it — announced as hidden,
   * still focusable.
   */
  it('takes the background out of the tab order while open, and puts it back', () => {
    const { opener, ref } = layer('<button>close</button>')
    const { unmount } = renderHook(() => useModalLayer(ref, () => {}))
    // The attribute, because that is what the hook sets and what the browser
    // reads; jsdom does not reflect it onto the `inert` property.
    expect(opener.hasAttribute('inert')).toBe(true)
    unmount()
    expect(opener.hasAttribute('inert')).toBe(false)
  })
})
