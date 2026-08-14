/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CoachProvider, useCoach } from './coach-context'

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
    return <CoachProvider userId={userId}>{children}</CoachProvider>
  }
}

beforeEach(() => {
  localStorage.clear()
  rpcResult = { data: null, error: null }
  rpcCalls.length = 0
})

describe('defaults', () => {
  it('is Strength at Full volume for somebody who never opened the selector', () => {
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper(null) })
    expect(result.current.mode).toBe('strength')
    expect(result.current.volume).toBe('full')
    expect(result.current.meetDate).toBeNull()
    expect(result.current.weeklyTarget).toBe(3)
  })
})

describe('localStorage is the optimistic cache', () => {
  it('reads a stored dial back on mount', () => {
    localStorage.setItem('workout.coach.mode', 'hypertrophy')
    localStorage.setItem('workout.coach.volume', 'off')
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper(null) })
    expect(result.current.mode).toBe('hypertrophy')
    expect(result.current.volume).toBe('off')
  })

  it('refuses a stored value this build has never heard of', () => {
    // localStorage survives a downgrade; a bad value must land on the default
    // rather than render a selector with no active card on it.
    localStorage.setItem('workout.coach.mode', 'powerlifting')
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper(null) })
    expect(result.current.mode).toBe('strength')
  })

  it('writes through on a change', () => {
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper(null) })
    act(() => result.current.setVolume('quiet'))
    expect(result.current.volume).toBe('quiet')
    expect(localStorage.getItem('workout.coach.volume')).toBe('quiet')
  })
})

describe('the server row is the cross-device memory', () => {
  it('adopts the server’s dials when they arrive', async () => {
    rpcResult = {
      data: {
        coach_mode: 'meetprep',
        coach_volume: 'quiet',
        meet_date: '2026-11-14',
        weekly_target: 4,
        protein_target_g: 160,
      },
      error: null,
    }
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper('u1') })
    await waitFor(() => expect(result.current.mode).toBe('meetprep'))
    expect(result.current.volume).toBe('quiet')
    expect(result.current.meetDate).toBe('2026-11-14')
    expect(result.current.weeklyTarget).toBe(4)
    expect(result.current.proteinTargetG).toBe(160)
  })

  it('leaves localStorage authoritative when 0027 is not applied yet', async () => {
    localStorage.setItem('workout.coach.mode', 'hypertrophy')
    // A row with no coach columns on it — exactly what a pre-0027 database
    // returns, and the reason the v3 UI can ship before its DDL.
    rpcResult = { data: { weight_unit: 'kg', theme: 'paper' }, error: null }
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper('u1') })
    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(0))
    expect(result.current.mode).toBe('hypertrophy')
    expect(result.current.volume).toBe('full')
  })

  it('survives an RPC that errors outright', async () => {
    rpcResult = { data: null, error: { message: 'nope' } }
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper('u1') })
    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(0))
    expect(result.current.mode).toBe('strength')
  })
})

describe('writes reach the single-preference RPC', () => {
  it('sends the mode', () => {
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper('u1') })
    act(() => result.current.setMode('hypertrophy'))
    expect(rpcCalls).toContainEqual({
      fn: 'upsert_user_preference',
      args: { p_column: 'coach_mode', p_value: 'hypertrophy' },
    })
  })

  it('clears the meet date with the empty string rather than a second RPC', () => {
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper('u1') })
    act(() => result.current.setMeetDate(null))
    expect(rpcCalls).toContainEqual({
      fn: 'upsert_user_preference',
      args: { p_column: 'meet_date', p_value: '' },
    })
    expect(result.current.meetDate).toBeNull()
  })

  it('clamps a weekly target to what the column will accept', () => {
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper('u1') })
    act(() => result.current.setWeeklyTarget(99))
    expect(result.current.weeklyTarget).toBe(14)
    act(() => result.current.setWeeklyTarget(0))
    expect(result.current.weeklyTarget).toBe(1)
  })

  it('sends nothing for a signed-out reader', () => {
    const { result } = renderHook(() => useCoach(), { wrapper: wrapper(null) })
    act(() => result.current.setMode('meetprep'))
    expect(rpcCalls).toHaveLength(0)
    expect(result.current.mode).toBe('meetprep')
  })
})
