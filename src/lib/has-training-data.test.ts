import { describe, expect, it } from 'vitest'
import { hasTrainingData } from '../../supabase/functions/_shared/has-training-data'

/**
 * The guard that decides whether a Coach's Notes request costs a model call
 * and the caller's one regenerate for the week.
 *
 * Two real users burned that regenerate on 2026-08-05 by opening Coach before
 * logging anything, which locked them out for seven days — including after
 * they started training. These are the cases that stop it happening again,
 * and the ones that stop the guard misfiring on someone who does have data.
 */
describe('hasTrainingData', () => {
  it('is false for a brand-new account', () => {
    expect(hasTrainingData({ total_sets_90d: 0, sessions_last_7: 0 })).toBe(false)
  })

  it('is true once a single working set exists', () => {
    expect(hasTrainingData({ total_sets_90d: 1 })).toBe(true)
  })

  it('reads a bigint returned as a string', () => {
    // count(*) is bigint; a driver may hand it back either way.
    expect(hasTrainingData({ total_sets_90d: '0' })).toBe(false)
    expect(hasTrainingData({ total_sets_90d: '3201' })).toBe(true)
  })

  describe('fails open, so a shape change cannot silently disable the feature', () => {
    it('is true when the key is missing', () => {
      expect(hasTrainingData({ sessions_last_7: 0 })).toBe(true)
    })

    it('is true when the value is not a number', () => {
      expect(hasTrainingData({ total_sets_90d: null })).toBe(true)
      expect(hasTrainingData({ total_sets_90d: 'lots' })).toBe(true)
    })

    it('is true for a null or non-object block', () => {
      expect(hasTrainingData(null)).toBe(true)
      expect(hasTrainingData(undefined)).toBe(true)
      expect(hasTrainingData('{}')).toBe(true)
    })
  })
})
