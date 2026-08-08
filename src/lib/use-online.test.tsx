/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { isOnline, useOnline } from './use-online'

/**
 * `navigator.onLine` is read-only, so the tests define over it and restore it.
 * Worth doing rather than mocking the module: what is being asserted is that
 * the hook actually subscribes, and a mocked hook would assert the mock.
 */
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => setOnLine(true))

function Probe() {
  return <span>{useOnline() ? 'online' : 'offline'}</span>
}

describe('isOnline', () => {
  it('follows the browser', () => {
    setOnLine(false)
    expect(isOnline()).toBe(false)
    setOnLine(true)
    expect(isOnline()).toBe(true)
  })

  /**
   * Only an explicit `false` counts. Anything else — a platform without the
   * property, a WebView that never sets it — is treated as connected, because
   * the cost of guessing wrong in that direction is one failed request, and
   * the cost of guessing wrong the other way is an app that refuses to try.
   */
  it('assumes a connection when the browser has no opinion', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      value: undefined,
      configurable: true,
    })
    expect(isOnline()).toBe(true)
  })
})

describe('useOnline', () => {
  it('starts from what the browser says', () => {
    setOnLine(false)
    render(<Probe />)
    expect(screen.getByText('offline')).toBeInTheDocument()
  })

  it('follows the radio going away and coming back', () => {
    setOnLine(true)
    render(<Probe />)
    expect(screen.getByText('online')).toBeInTheDocument()

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('offline')).toBeInTheDocument()

    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByText('online')).toBeInTheDocument()
  })

  /**
   * iOS does not fire `online` in a backgrounded tab, so a phone that changed
   * networks in a pocket needs the visibility change to notice.
   */
  it('re-checks when the tab comes back into view', () => {
    setOnLine(true)
    render(<Probe />)
    act(() => {
      setOnLine(false)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByText('offline')).toBeInTheDocument()
  })
})
