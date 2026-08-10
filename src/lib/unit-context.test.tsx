/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { UnitProvider, useUnit } from './unit-context'

const STORAGE_KEY = 'workout.unit'

// Minimal Supabase mock — enough for the two RPCs unit-context calls.
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
    return <UnitProvider userId={userId}>{children}</UnitProvider>
  }
}

beforeEach(() => {
  localStorage.clear()
  rpcResult = { data: null, error: null }
  rpcCalls.length = 0
})

describe('unit-context', () => {
  it('defaults to lbs when localStorage is empty', () => {
    const { result } = renderHook(() => useUnit(), { wrapper: wrapper() })
    expect(result.current.unit).toBe('lbs')
  })

  it('reads a stored kg preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'kg')
    const { result } = renderHook(() => useUnit(), { wrapper: wrapper() })
    expect(result.current.unit).toBe('kg')
  })

  it('persists toggle to localStorage', () => {
    const { result } = renderHook(() => useUnit(), { wrapper: wrapper() })
    act(() => result.current.toggleUnit())
    expect(result.current.unit).toBe('kg')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('kg')
  })

  it('fetches server preference on auth and overrides localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, 'lbs')
    rpcResult = { data: { weight_unit: 'kg', rpe_mode: 'none' }, error: null }

    const { result } = renderHook(() => useUnit(), { wrapper: wrapper('u1') })

    // The RPC call fires; wait for the state update.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.unit).toBe('kg')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('kg')
  })

  it('calls upsert_user_preference on toggle when authenticated', async () => {
    const { result } = renderHook(() => useUnit(), { wrapper: wrapper('u1') })

    act(() => result.current.toggleUnit())

    expect(result.current.unit).toBe('kg')
    // The RPC call is fire-and-forget; give the microtask queue a tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const upsert = rpcCalls.find((c) => c.fn === 'upsert_user_preference')
    expect(upsert).toBeDefined()
    expect(upsert!.args).toEqual({ p_column: 'weight_unit', p_value: 'kg' })
  })

  it('does not call RPC when unauthenticated', async () => {
    const { result } = renderHook(() => useUnit(), { wrapper: wrapper(null) })

    act(() => result.current.toggleUnit())

    expect(result.current.unit).toBe('kg')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(rpcCalls).toHaveLength(0)
  })

  it('ignores a server error and stays on localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, 'kg')
    rpcResult = { data: null, error: { message: 'not found' } }

    const { result } = renderHook(() => useUnit(), { wrapper: wrapper('u1') })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Should stay on the localStorage value, not reset to lbs.
    expect(result.current.unit).toBe('kg')
  })
})
