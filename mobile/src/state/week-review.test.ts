import { describe, expect, it } from 'vitest'

import { QUOTA_VISIBLE_AT } from '@wazn/domain'

import {
  IDLE,
  reduce,
  regenerateSpent,
  showQuota,
  type ReviewRequest,
} from './week-review'

/**
 * The rules `WeekReview` could not previously assert, because importing the
 * component pulls `react-native` into a node test run.
 */
const failed: ReviewRequest = {
  phase: 'failed',
  force: false,
  attempt: 0,
  message: 'The review took too long.',
}

describe('week review request', () => {
  it('starts loading, unforced', () => {
    expect(IDLE).toEqual({ phase: 'loading', force: false, attempt: 0, message: null })
  })

  it('regenerate forces the next request and counts as a new attempt', () => {
    const next = reduce(IDLE, { type: 'regenerate' })
    expect(next.force).toBe(true)
    expect(next.phase).toBe('loading')
    expect(next.attempt).toBe(1)
  })

  /**
   * THE test. Delete `force: false` from the `retry` branch and only this
   * fails: no type error, no render change, no failed build. The cost is a
   * model call per retry against a flaky network.
   */
  it('retry CLEARS a force left over from regenerate', () => {
    const regenerated = reduce(IDLE, { type: 'regenerate' })
    const thenFailed = reduce(regenerated, { type: 'rejected', message: 'boom' })
    expect(thenFailed.force).toBe(true)

    const retried = reduce(thenFailed, { type: 'retry' })
    expect(retried.force).toBe(false)
  })

  it('three retries after one regenerate spend one model call, not four', () => {
    let s = reduce(IDLE, { type: 'regenerate' })
    let spent = s.force ? 1 : 0
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'rejected', message: 'boom' })
      s = reduce(s, { type: 'retry' })
      if (s.force) spent += 1
    }
    expect(spent).toBe(1)
    // Each retry is still a distinct request, or the effect would not re-run.
    expect(s.attempt).toBe(4)
  })

  it('retry clears the stale error message', () => {
    expect(reduce(failed, { type: 'retry' }).message).toBeNull()
  })

  it('resolving clears the error but leaves force alone', () => {
    const forced = reduce(IDLE, { type: 'regenerate' })
    const done = reduce(forced, { type: 'resolved' })
    expect(done.phase).toBe('ready')
    expect(done.message).toBeNull()
    // Not reset here on purpose: nothing re-fires on `resolved`, and clearing
    // it would be a state change with no request behind it.
    expect(done.force).toBe(true)
  })

  it('rejecting keeps the attempt number, so no request is re-issued', () => {
    const next = reduce(IDLE, { type: 'rejected', message: 'boom' })
    expect(next.attempt).toBe(IDLE.attempt)
    expect(next.message).toBe('boom')
  })
})

describe('quota gates', () => {
  it('disables regenerate only at zero', () => {
    expect(regenerateSpent(1)).toBe(false)
    expect(regenerateSpent(0)).toBe(true)
  })

  /** A missing quota is not a spent one. Treating it as zero would take the
   *  button away whenever the payload shape changed. */
  it('treats a null quota as available, not spent', () => {
    expect(regenerateSpent(null)).toBe(false)
    expect(showQuota(null)).toBe(false)
  })

  it('shows the count only once it is low enough to be information', () => {
    expect(showQuota(QUOTA_VISIBLE_AT)).toBe(true)
    expect(showQuota(QUOTA_VISIBLE_AT + 1)).toBe(false)
    expect(showQuota(500)).toBe(false)
  })
})
