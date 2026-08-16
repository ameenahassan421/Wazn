/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ThemeProvider, useTheme } from './theme-context'

const STORAGE_KEY = 'workout.theme'

// Minimal Supabase mock — enough for the two RPCs theme-context calls.
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} })
      return Promise.resolve(rpcResult)
    },
  },
}))

function wrapper(userId?: string | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ThemeProvider userId={userId}>{children}</ThemeProvider>
  }
}

beforeEach(() => {
  localStorage.clear()
  rpcResult = { data: null, error: null }
  rpcCalls.length = 0
  document.documentElement.removeAttribute('data-theme')
  document.head
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((el) => el.remove())
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', '#f7f3ec')
  document.head.appendChild(meta)
})

describe('theme-context', () => {
  // The polarity is the opposite of what this file asserted before v5: iron is
  // the product default and paper is the choice. Pinned as a test rather than
  // left to the component, because it is a product decision that has now been
  // reversed twice and the next reversal should have to edit an assertion.
  it('defaults to dark, the designed look, not a system preference', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper() })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('reads a stored paper preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'paper')
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper() })
    expect(result.current.theme).toBe('paper')
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper')
  })

  // A row written before v5 still says `paper` and still means it: the column
  // was never dropped, so reinstating the toggle resurrects real preferences
  // rather than resetting everyone.
  it('ignores a nonsense stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'neon')
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper() })
    expect(result.current.theme).toBe('dark')
  })

  it('flips the root attribute, storage and browser chrome on change', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper() })
    act(() => result.current.setTheme('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(
      document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      // v5's ground, not v2's #0c0b0a — the palette moved in PR 1 and the
      // browser chrome has to move with it.
    ).toBe('#0f0d0a')
  })

  it('writes the preference through the RPC when signed in', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: wrapper('user-1'),
    })
    act(() => result.current.setTheme('dark'))
    const upsert = rpcCalls.find((c) => c.fn === 'upsert_user_preference')
    expect(upsert).toBeDefined()
    expect(upsert!.args).toEqual({ p_column: 'theme', p_value: 'dark' })
  })

  it('adopts the server preference on auth and caches it', async () => {
    localStorage.setItem(STORAGE_KEY, 'paper')
    rpcResult = { data: { theme: 'dark', locale: 'en' }, error: null }
    const { result } = renderHook(() => useTheme(), {
      wrapper: wrapper('user-1'),
    })
    await waitFor(() => expect(result.current.theme).toBe('dark'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('keeps localStorage authoritative when the theme column does not exist yet', async () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    rpcResult = { data: { locale: 'en' }, error: null }
    const { result } = renderHook(() => useTheme(), {
      wrapper: wrapper('user-1'),
    })
    await waitFor(() =>
      expect(rpcCalls.some((c) => c.fn === 'get_user_preferences')).toBe(true),
    )
    expect(result.current.theme).toBe('dark')
  })
})
