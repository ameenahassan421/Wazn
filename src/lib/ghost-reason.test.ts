import { describe, expect, it } from 'vitest'
import {
  causeOf,
  earnedProgression,
  ghostChip,
  type GhostContext,
  type GhostVerdict,
  trimmedPlan,
  verdictFor,
} from './ghost-reason'
import type { PlannedSet, RowPrevious } from './plan'

function ctx(over: Partial<GhostContext> = {}): GhostContext {
  return {
    mode: 'strength',
    readiness: 'normal',
    previous: [],
    plan: undefined,
    committed: [],
    incrementKg: 2.5,
    ...over,
  }
}

const prev = (weightKg: number, reps: number): RowPrevious => ({ weightKg, reps })
const planned = (reps: number): PlannedSet => ({ reps, setType: 'normal' })

describe('earnedProgression — double progression, reps before load', () => {
  it('is earned when every planned rep was finished', () => {
    expect(
      earnedProgression(
        [prev(100, 8), prev(100, 8), prev(100, 8)],
        [planned(8), planned(8), planned(8)],
      ),
    ).toBe(true)
  })

  it('is not earned when one set came up short', () => {
    expect(
      earnedProgression([prev(100, 8), prev(100, 6)], [planned(8), planned(8)]),
    ).toBe(false)
  })

  it('is not earned when the session stopped early', () => {
    // Two of three planned sets, both full. Nothing was proved about the load.
    expect(
      earnedProgression(
        [prev(100, 8), prev(100, 8)],
        [planned(8), planned(8), planned(8)],
      ),
    ).toBe(false)
  })

  it('falls back to the lifter’s own consistency without a routine', () => {
    expect(earnedProgression([prev(100, 8), prev(100, 8)], undefined)).toBe(true)
    expect(earnedProgression([prev(100, 8), prev(100, 5)], undefined)).toBe(false)
  })

  it('is never earned from nothing', () => {
    expect(earnedProgression([], undefined)).toBe(false)
  })
})

describe('the ghost has nothing to say', () => {
  it('is silent for a lift with no history and no plan — a blank, honest row', () => {
    const v = verdictFor(0, ctx())
    expect(v.kind).toBe('repeat')
    expect(v.cause).toBe('none')
    expect(v.weightKg).toBeNull()
  })

  it('is silent when last session did not finish the job', () => {
    const v = verdictFor(
      0,
      ctx({ previous: [prev(100, 8), prev(100, 5)], plan: [planned(8), planned(8)] }),
    )
    expect(v.kind).toBe('repeat')
  })
})

describe('the bar goes up', () => {
  it('adds one increment and carries the rep run for the chip', () => {
    const v = verdictFor(
      0,
      ctx({
        previous: [prev(100, 8), prev(100, 8), prev(100, 8)],
        plan: [planned(8), planned(8), planned(8)],
      }),
    )
    expect(v.kind).toBe('raise')
    expect(v.cause).toBe('progression')
    expect(v.weightKg).toBe(102.5)
    expect(v.reps).toBe(8)
    expect(v.facts.previousRepsRun).toEqual([8, 8, 8])
  })

  it('respects the lifter’s own increment rather than a percentage', () => {
    const v = verdictFor(
      0,
      ctx({
        incrementKg: 5,
        previous: [prev(140, 5), prev(140, 5)],
      }),
    )
    expect(v.weightKg).toBe(145)
  })

  it('stops proposing a raise once the session is under way', () => {
    // The first committed set has already answered the question.
    const v = verdictFor(
      1,
      ctx({
        previous: [prev(100, 8), prev(100, 8)],
        committed: [{ weightKg: 102.5, reps: 8, label: '1' }],
      }),
    )
    expect(v.kind).toBe('repeat')
  })
})

describe('hypertrophy ladders the reps', () => {
  it('climbs a rep inside the band instead of adding a plate', () => {
    const v = verdictFor(
      0,
      ctx({ mode: 'hypertrophy', previous: [prev(60, 10), prev(60, 10)] }),
    )
    expect(v.kind).toBe('raise')
    expect(v.cause).toBe('rep-band')
    expect(v.weightKg).toBe(60)
    expect(v.reps).toBe(11)
  })

  it('stops at the top of the band', () => {
    const v = verdictFor(
      0,
      ctx({ mode: 'hypertrophy', previous: [prev(60, 15), prev(60, 15)] }),
    )
    // 15 is the ceiling; a raise here would be the load's job, and the
    // progression branch already declined it.
    expect(v.reps).not.toBe(16)
  })
})

describe('a light day', () => {
  it('eases the bar and holds, rather than pushing', () => {
    const v = verdictFor(
      0,
      ctx({ readiness: 'light', previous: [prev(100, 8), prev(100, 8)] }),
    )
    expect(v.kind).toBe('hold')
    expect(v.cause).toBe('readiness')
    expect(v.weightKg).toBe(95)
  })

  it('outranks a progression that was otherwise earned', () => {
    const v = verdictFor(
      0,
      ctx({
        readiness: 'light',
        previous: [prev(100, 8), prev(100, 8), prev(100, 8)],
        plan: [planned(8), planned(8), planned(8)],
      }),
    )
    expect(v.kind).toBe('hold')
  })
})

describe('auto-regulation fires once, from a cause that cannot repeat', () => {
  const under = ctx({
    previous: [prev(100, 8), prev(100, 8), prev(100, 8), prev(100, 8)],
    plan: [planned(8), planned(8), planned(8), planned(8)],
    committed: [
      { weightKg: 100, reps: 8, label: '1' },
      { weightKg: 102.5, reps: 6, label: '2' },
    ],
  })

  it('names the first set that fell short, and only the first', () => {
    expect(causeOf(under)).toEqual({ label: '2', planned: 8, actual: 6 })
  })

  it('stays the same cause when a later set also falls short', () => {
    // A second short set is the same story. Re-easing every set is noise.
    const again = ctx({
      ...under,
      committed: [...under.committed, { weightKg: 100, reps: 5, label: '3' }],
    })
    expect(causeOf(again)).toEqual(causeOf(under))
  })

  it('has no cause when every committed set met its target', () => {
    expect(
      causeOf(
        ctx({
          plan: [planned(8), planned(8)],
          committed: [{ weightKg: 100, reps: 8, label: '1' }],
        }),
      ),
    ).toBeNull()
  })

  it('eases the remaining ghosts to what was actually managed', () => {
    const v = verdictFor(2, under)
    expect(v.kind).toBe('ease')
    expect(v.cause).toBe('under-plan')
    expect(v.weightKg).toBe(100)
    expect(v.reps).toBe(6)
    expect(v.facts.causeSetLabel).toBe('2')
    expect(v.facts.plannedReps).toBe(8)
    expect(v.facts.actualReps).toBe(6)
  })

  it('gives every remaining ghost the same values — one recalculation, not a drift', () => {
    expect(verdictFor(2, under).weightKg).toBe(verdictFor(3, under).weightKg)
    expect(verdictFor(2, under).reps).toBe(verdictFor(3, under).reps)
  })

  it('outranks readiness — today’s evidence beats this morning’s', () => {
    expect(verdictFor(2, { ...under, readiness: 'light' }).cause).toBe('under-plan')
  })
})

describe('trimmedPlan', () => {
  it('drops a set on a light day', () => {
    expect(trimmedPlan(4, 0, 'light')).toBe(3)
  })

  it('never retracts a set that has been done', () => {
    expect(trimmedPlan(4, 4, 'light')).toBe(4)
  })

  it('leaves normal and loaded days alone', () => {
    expect(trimmedPlan(4, 0, 'normal')).toBe(4)
    expect(trimmedPlan(4, 0, 'loaded')).toBe(4)
  })
})

/**
 * Which chip a cause wears.
 *
 * The ladder lived inside `WorkoutOverview`'s `ReasonChip` and the native
 * board was about to grow a second copy. A rule that exists twice drifts, and
 * the drift here would be silent: both apps would show A chip, just not the
 * same one for the same session.
 */
describe('ghostChip', () => {
  const verdict = (over: Partial<GhostVerdict>): GhostVerdict => ({
    kind: 'hold',
    cause: 'none',
    weightKg: 100,
    reps: 5,
    facts: {},
    ...over,
  })

  it('maps each cause to its own key', () => {
    expect(ghostChip(verdict({ cause: 'under-plan' })).key).toBe('reason.chip.eased')
    expect(ghostChip(verdict({ cause: 'progression' })).key).toBe('reason.chip.raised')
    expect(ghostChip(verdict({ cause: 'readiness' })).key).toBe('reason.chip.hold')
    // Everything unaccounted for falls to the rep chip rather than to nothing.
    expect(ghostChip(verdict({ cause: 'none' })).key).toBe('reason.chip.reps')
    expect(ghostChip(verdict({ cause: 'rep-band' })).key).toBe('reason.chip.reps')
  })

  it('returns KILOGRAMS, not a formatted string', () => {
    // The shared half must not know what unit is on screen. A formatted string
    // here would also make this untestable without a locale.
    expect(ghostChip(verdict({ weightKg: 102.5 })).weightKg).toBe(102.5)
  })

  it('is raised only when the bar actually went up', () => {
    expect(ghostChip(verdict({ kind: 'raise' })).raised).toBe(true)
    for (const kind of ['hold', 'ease', 'repeat'] as const) {
      expect(ghostChip(verdict({ kind })).raised).toBe(false)
    }
  })

  it('carries the figures the chips interpolate, and empties rather than undefined', () => {
    const full = ghostChip(
      verdict({ facts: { previousRepsRun: [8, 8, 7], causeSetLabel: '2' } }),
    )
    expect(full.run).toEqual([8, 8, 7])
    expect(full.label).toBe('2')
    // A missing fact must not reach a template as the string "undefined".
    const bare = ghostChip(verdict({}))
    expect(bare.run).toEqual([])
    expect(bare.label).toBe('')
  })
})
