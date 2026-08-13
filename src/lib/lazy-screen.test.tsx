// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'
import { lazyScreen } from './lazy-screen'

/**
 * The behaviour under test is a recovery, so every case here is a failure
 * case. The one that matters most is the third: a reload that can happen twice
 * is a phone stuck in a loop, which is worse than the tab it was fixing.
 *
 * The browser reproduction lives outside vitest — jsdom has no service worker
 * and no second deploy — but the decision this file makes (reload, once, then
 * give up) is the half that can be checked cheaply.
 */

const RELOAD_KEY = 'wazn:chunk-reload'

let reloads = 0

// A caught render error is still re-thrown into the environment by React's dev
// build. Suppressing the window event and console.error keeps a passing run
// readable — the same reason ErrorBoundary.test.tsx does it.
const swallow = (event: Event) => event.preventDefault()

beforeEach(() => {
  reloads = 0
  window.sessionStorage.clear()
  window.addEventListener('error', swallow)
  // `location.reload` is not configurable in jsdom; replacing the whole
  // object is the supported way to observe a call to it.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: () => (reloads += 1) },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  window.removeEventListener('error', swallow)
  vi.restoreAllMocks()
})

class Catch extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>caught</p> : this.props.children
  }
}

function Screen(): React.ReactElement {
  return <p>screen</p>
}

function mount(load: () => Promise<{ default: typeof Screen }>) {
  const Lazy = lazyScreen(load)
  return render(
    <Catch>
      <Suspense fallback={<p>loading</p>}>
        <Lazy />
      </Suspense>
    </Catch>,
  )
}

describe('lazyScreen', () => {
  it('renders the screen and leaves no reload mark behind', async () => {
    mount(() => Promise.resolve({ default: Screen }))

    expect(await screen.findByText('screen')).toBeInTheDocument()
    expect(reloads).toBe(0)
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })

  it('clears a stale mark on success, so the next deploy gets its own reload', async () => {
    window.sessionStorage.setItem(RELOAD_KEY, '1')
    mount(() => Promise.resolve({ default: Screen }))

    expect(await screen.findByText('screen')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })

  it('reloads once when the chunk is gone, and shows no error while it does', async () => {
    mount(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    )

    // The promise never settles on this path on purpose: the navigation is
    // already underway, and Suspense holding its fallback beats flashing an
    // error card that is about to be discarded.
    await vi.waitFor(() => expect(reloads).toBe(1))
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(screen.queryByText('caught')).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBe('1')
  })

  it('gives the error to the boundary rather than reloading twice', async () => {
    window.sessionStorage.setItem(RELOAD_KEY, '1')
    mount(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    )

    expect(await screen.findByText('caught')).toBeInTheDocument()
    expect(reloads).toBe(0)
  })

  it('does not reload at all when sessionStorage is unavailable', async () => {
    // Not `Storage.prototype`: newer Node ships its own `Storage` and
    // `sessionStorage` globals, and vitest's jsdom environment replaces
    // `Storage` with jsdom's while leaving Node's `sessionStorage` in place.
    // The two can belong to different classes, so a spy on the bare class
    // misses the object the code actually reads.
    const storageProto = Object.getPrototypeOf(window.sessionStorage) as Storage
    const getItem = vi.spyOn(storageProto, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    mount(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    )

    expect(await screen.findByText('caught')).toBeInTheDocument()
    expect(reloads).toBe(0)
    getItem.mockRestore()
  })
})
