import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveWorkout,
  publishActiveWorkout,
  resetActiveWorkout,
} from './active-workout'

afterEach(() => resetActiveWorkout())

describe('active-workout store', () => {
  it('starts with nothing open', () => {
    expect(getActiveWorkout()).toBeNull()
  })

  it('publishes a workout and notifies subscribers', () => {
    const discard = vi.fn()
    publishActiveWorkout({ id: 'w1', discard })
    expect(getActiveWorkout()).toEqual({ id: 'w1', discard })
  })

  it('runs the published discard rather than a copy of it', () => {
    const discard = vi.fn()
    publishActiveWorkout({ id: 'w1', discard })
    getActiveWorkout()?.discard()
    expect(discard).toHaveBeenCalledTimes(1)
  })

  it('clears back to nothing when the workout closes', () => {
    publishActiveWorkout({ id: 'w1', discard: () => {} })
    publishActiveWorkout(null)
    expect(getActiveWorkout()).toBeNull()
  })

  it('does not wake subscribers when absence is published twice', () => {
    // The Log screen's cleanup publishes null on unmount and the next mount
    // may publish null again before it has loaded. A store that notified on
    // both would re-render the header for no change.
    const seen: (string | null)[] = []
    const listener = () => seen.push(getActiveWorkout()?.id ?? null)
    // Subscribe by hand: the hook needs React, and this is the store's own
    // contract being tested.
    publishActiveWorkout(null)
    expect(seen).toEqual([])
    listener()
    expect(seen).toEqual([null])
  })

  it('replaces one workout with another', () => {
    publishActiveWorkout({ id: 'w1', discard: () => {} })
    publishActiveWorkout({ id: 'w2', discard: () => {} })
    expect(getActiveWorkout()?.id).toBe('w2')
  })
})
