import { describe, expect, it } from 'vitest'
import { estimatedOneRepMax } from './epley'

describe('estimatedOneRepMax', () => {
  it('applies the Epley formula', () => {
    // 58.97 kg x 6 reps -> 58.97 * 1.2
    expect(estimatedOneRepMax(58.97, 6, 'normal')).toBeCloseTo(70.764, 3)
  })

  it('returns the weight itself for a single rep', () => {
    expect(estimatedOneRepMax(100, 1, 'normal')).toBeCloseTo(103.333, 3)
  })

  it('excludes warmup sets', () => {
    expect(estimatedOneRepMax(58.97, 6, 'warmup')).toBeNull()
  })

  it('counts sets taken to failure', () => {
    expect(estimatedOneRepMax(50, 10, 'failure')).toBeCloseTo(66.667, 3)
  })

  it('excludes sets missing weight or reps', () => {
    expect(estimatedOneRepMax(null, 9, 'normal')).toBeNull()
    expect(estimatedOneRepMax(60, null, 'normal')).toBeNull()
    expect(estimatedOneRepMax(null, null, 'normal')).toBeNull()
  })
})
