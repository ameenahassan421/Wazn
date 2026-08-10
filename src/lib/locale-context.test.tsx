/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { LocaleProvider, useLocale } from './locale-context'

const STORAGE_KEY = 'workout.locale'

// Minimal Supabase mock — enough for the two RPCs locale-context calls.
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
    return <LocaleProvider userId={userId}>{children}</LocaleProvider>
  }
}

beforeEach(() => {
  localStorage.clear()
  rpcResult = { data: null, error: null }
  rpcCalls.length = 0
  document.documentElement.removeAttribute('dir')
  document.documentElement.removeAttribute('lang')
})

describe('locale-context', () => {
  it('defaults to en when localStorage is empty and navigator is English', () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })
    expect(result.current.locale).toBe('en')
  })

  it('reads a stored ar preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'ar')
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })
    expect(result.current.locale).toBe('ar')
  })

  it('persists locale to localStorage on change', () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })
    act(() => result.current.setLocale('ar'))
    expect(result.current.locale).toBe('ar')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ar')
  })

  it('fetches server preference on auth and adopts it', async () => {
    localStorage.setItem(STORAGE_KEY, 'en')
    rpcResult = { data: { locale: 'ar', weight_unit: 'kg' }, error: null }

    const { result } = renderHook(() => useLocale(), { wrapper: wrapper('u1') })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.locale).toBe('ar')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ar')
  })

  it('calls upsert_user_preference with p_column "locale" on change', async () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper('u1') })

    act(() => result.current.setLocale('ar'))

    expect(result.current.locale).toBe('ar')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const upsert = rpcCalls.find((c) => c.fn === 'upsert_user_preference')
    expect(upsert).toBeDefined()
    expect(upsert!.args).toEqual({ p_column: 'locale', p_value: 'ar' })
  })

  it('does not call RPC when unauthenticated', async () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper(null) })

    act(() => result.current.setLocale('ar'))

    expect(result.current.locale).toBe('ar')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(rpcCalls).toHaveLength(0)
  })

  it('ignores a server error and stays on localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, 'ar')
    rpcResult = { data: null, error: { message: 'not found' } }

    const { result } = renderHook(() => useLocale(), { wrapper: wrapper('u1') })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Should stay on the localStorage value, not reset to en.
    expect(result.current.locale).toBe('ar')
  })

  it('sets dir="rtl" and lang="ar" on documentElement when locale is ar', () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })

    act(() => result.current.setLocale('ar'))

    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
  })

  it('sets dir="ltr" and lang="en" when switching back to en', () => {
    localStorage.setItem(STORAGE_KEY, 'ar')
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })

    // Provider starts at ar from localStorage; flip back.
    act(() => result.current.setLocale('en'))

    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  })

  it('t() is bound to the current locale', () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })

    expect(result.current.t('toggle.locale.label')).toBe('EN')

    act(() => result.current.setLocale('ar'))

    expect(result.current.t('toggle.locale.label')).toBe('AR')
  })

  it('t() falls back to the key for missing messages', () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() })
    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key')
  })
})
