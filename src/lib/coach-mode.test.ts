import { describe, expect, it } from 'vitest'
import {
  COACH_MODES,
  MODE_BEHAVIOUR,
  asMode,
  asVolume,
  isCoachOff,
  isModeReady,
  showsCoachSurfaces,
  usesGhostIntelligence,
  weeksOut,
} from './coach-mode'

describe('parsing an untrusted mode', () => {
  it('accepts the three modes and refuses everything else', () => {
    for (const mode of COACH_MODES) expect(asMode(mode)).toBe(mode)
    expect(asMode('powerlifting')).toBeNull()
    expect(asMode(null)).toBeNull()
    expect(asMode(3)).toBeNull()
  })

  it('refuses an unknown volume rather than widening it', () => {
    expect(asVolume('quiet')).toBe('quiet')
    expect(asVolume('silent')).toBeNull()
  })
})

describe('volume is two questions, not one', () => {
  // The distinction the whole degraded-render acceptance item rests on:
  // quiet stops the coach TALKING, off stops it THINKING.
  it('full speaks and thinks', () => {
    expect(showsCoachSurfaces('full')).toBe(true)
    expect(usesGhostIntelligence('full')).toBe(true)
    expect(isCoachOff('full')).toBe(false)
  })

  it('quiet keeps ghost intelligence and silences every surface', () => {
    expect(showsCoachSurfaces('quiet')).toBe(false)
    expect(usesGhostIntelligence('quiet')).toBe(true)
    expect(isCoachOff('quiet')).toBe(false)
  })

  it('off is v2.2 verbatim: no surfaces and no adaptive ghosts', () => {
    expect(showsCoachSurfaces('off')).toBe(false)
    expect(usesGhostIntelligence('off')).toBe(false)
    expect(isCoachOff('off')).toBe(true)
  })
})

describe('meet prep needs a platform to count back from', () => {
  it('is not ready without a date, and ready with one', () => {
    expect(isModeReady('meetprep', null)).toBe(false)
    expect(isModeReady('meetprep', '')).toBe(false)
    expect(isModeReady('meetprep', '2026-11-14')).toBe(true)
  })

  it('never blocks the other two', () => {
    expect(isModeReady('strength', null)).toBe(true)
    expect(isModeReady('hypertrophy', null)).toBe(true)
  })
})

describe('weeksOut', () => {
  const now = new Date('2026-08-14T12:00:00')

  it('counts whole weeks to the platform', () => {
    expect(weeksOut('2026-09-11', now)).toBe(3)
  })

  it('floors at zero — a meet that has happened is history', () => {
    expect(weeksOut('2026-07-01', now)).toBe(0)
  })

  it('answers null with no date and with a bad one', () => {
    expect(weeksOut(null, now)).toBeNull()
    expect(weeksOut('not-a-date', now)).toBeNull()
  })
})

describe('the behaviour table', () => {
  it('gives every mode a rest band inside the timer’s own limits', () => {
    for (const mode of COACH_MODES) {
      const band = MODE_BEHAVIOUR[mode].rest
      expect(band.min).toBeGreaterThan(0)
      expect(band.max).toBeGreaterThan(band.min)
      expect(band.max).toBeLessThanOrEqual(600)
    }
  })

  it('only hypertrophy ladders reps — the other two move the bar', () => {
    expect(MODE_BEHAVIOUR.hypertrophy.repBand).toEqual([8, 15])
    expect(MODE_BEHAVIOUR.strength.repBand).toBeNull()
    expect(MODE_BEHAVIOUR.meetprep.repBand).toBeNull()
  })
})
