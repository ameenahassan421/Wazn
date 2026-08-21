import { describe, expect, it } from 'vitest'

import { sparkGeometry } from './spark'

const BOX = { width: 100, height: 50, pad: 5 }

describe('sparkGeometry', () => {
  it('is null for an empty series, so a caller cannot draw an axis alone', () => {
    expect(sparkGeometry([], BOX)).toBeNull()
    // Non-finite readings are dropped, not plotted at NaN.
    expect(sparkGeometry([NaN, Infinity], BOX)).toBeNull()
  })

  it('spreads a series edge to edge inside the padding', () => {
    const g = sparkGeometry([1, 2, 3], BOX)
    expect(g?.points.map((p) => p.x)).toEqual([5, 50, 95])
  })

  it('puts the highest value at the top and the lowest at the bottom', () => {
    const g = sparkGeometry([1, 3], BOX)
    // SVG y grows downwards, so the larger value has the SMALLER y.
    expect(g?.points[0].y).toBe(45)
    expect(g?.points[1].y).toBe(5)
    expect(g?.min).toBe(1)
    expect(g?.max).toBe(3)
  })

  it('normalises to min..max rather than 0..max', () => {
    // The whole reason this is not the web's bar scaling: from zero, these
    // three readings are a flat line four pixels from the top.
    const g = sparkGeometry([80.4, 81.2, 82.9], BOX)
    expect(g?.points[0].y).toBe(45)
    expect(g?.points[2].y).toBe(5)
  })

  it('draws a flat series through the MIDDLE, not the bottom', () => {
    // The v5 reference writes `(mx - mn) || 1`, which does not divide by zero
    // and does pin every point to the bottom edge. A lifter whose weight has
    // not moved should see a line through the middle of the box.
    const g = sparkGeometry([82, 82, 82], BOX)
    expect(g?.points.every((p) => p.y === 25)).toBe(true)
    expect(g?.flat).toBe(true)
  })

  it('centres a single reading instead of starting a line that is missing', () => {
    const g = sparkGeometry([82], BOX)
    expect(g?.points).toEqual([{ x: 50, y: 25 }])
    expect(g?.flat).toBe(true)
  })

  it('keeps every point inside the box', () => {
    const g = sparkGeometry([5, 100, 0, 42], BOX)
    for (const p of g?.points ?? []) {
      expect(p.x).toBeGreaterThanOrEqual(5)
      expect(p.x).toBeLessThanOrEqual(95)
      expect(p.y).toBeGreaterThanOrEqual(5)
      expect(p.y).toBeLessThanOrEqual(45)
    }
  })
})
