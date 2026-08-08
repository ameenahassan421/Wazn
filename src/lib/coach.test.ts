import { describe, expect, it } from 'vitest'
import {
  briefChip,
  briefSkeleton,
  debriefChip,
  debriefSkeleton,
  ordinal,
} from './coach'
import type { BriefBlock, DebriefBlock } from './coach'

/**
 * The deterministic skeletons — B1's "if AI is dark, render the deterministic
 * skeleton or nothing".
 *
 * These functions ARE that promise. Everything they produce is composed from
 * SQL output with no model involved, so this file is where the promise is
 * actually testable: no network, no provider, no key. If these pass, both
 * surfaces work with the AI layer switched off entirely.
 *
 * The other half of the promise is "or nothing", and it gets as much attention
 * here as the happy path — a briefing that renders an apology on a brand-new
 * account is worse than one that renders nothing, because the screen it sits
 * on is the one the app opens on.
 */

const emptyBrief: BriefBlock = {
  unit: 'kg',
  days_since_last: null,
  sessions_last_7: 0,
  sessions_last_28: 0,
  total_sets_90d: 0,
  due_routine: null,
  target: null,
  low_bands: [],
}

const fullBrief: BriefBlock = {
  ...emptyBrief,
  days_since_last: 2,
  sessions_last_7: 1,
  sessions_last_28: 4,
  total_sets_90d: 19,
  due_routine: { name: 'Push A', exercises: 2, days_since_run: 9 },
  target: {
    exercise: 'Bench Press (Barbell)',
    last_weight_kg: 100,
    last_reps: 5,
    last_e1rm: 116.7,
    best_e1rm: 116.7,
    last_done_days_ago: 9,
    next_weight_kg: 102.5,
    next_e1rm: 119.6,
  },
  low_bands: [{ muscle: 'calves', sets: 0 }],
}

describe('the briefing skeleton', () => {
  it('leads with the routine that is due and the lift to beat', () => {
    expect(briefSkeleton(fullBrief, 'kg')).toBe(
      'Push A is up · Bench Press (Barbell) — 100 kg × 5 last time.',
    )
  })

  it('renders nothing at all for an account with no history', () => {
    // Not "no data yet", not a placeholder card. Nothing. This is the state
    // every new account is in, on the screen the app opens on, and a card
    // apologising for itself above the Start button is pure cost.
    expect(briefSkeleton(emptyBrief, 'kg')).toBeNull()
    expect(briefSkeleton(null, 'kg')).toBeNull()
    expect(briefChip(emptyBrief, 'kg')).toBeUndefined()
  })

  it('mentions a layoff only once it is worth mentioning', () => {
    // §4-A1 puts the threshold at five days. Below it, a "days since" line is
    // the app nagging someone who is on schedule.
    const onSchedule = { ...fullBrief, days_since_last: 5 }
    expect(briefSkeleton(onSchedule, 'kg')).not.toContain('days since')

    const layoff = { ...fullBrief, days_since_last: 9 }
    expect(briefSkeleton(layoff, 'kg')).toContain('9 days since your last session')
  })

  it('falls back to a band gap when there is no target', () => {
    const noTarget = { ...fullBrief, target: null }
    expect(briefSkeleton(noTarget, 'kg')).toBe(
      'Push A is up · calves is at 0 sets this week.',
    )
  })

  it('converts the target to pounds without changing what is stored', () => {
    // Weight is kg in the database, always. The skeleton is display, so it
    // converts — and the chip has to convert with it, or the card would state
    // a target in one unit and a comparison in another.
    //
    // 102.5 kg is 225.97 lb, shown as 226 because a LOAD snaps to the nearest
    // half pound. The e1RM beside it is 257.3 and does not snap, because it is
    // an estimate and nobody racks it — see `formatEstimate`.
    expect(briefChip(fullBrief, 'lbs')).toBe('226 lbs × 5 beats 257.3 e1RM')
    expect(briefSkeleton(fullBrief, 'lbs')).toContain('220.5 lbs × 5')
  })

  it('quotes the e1RM exactly as the block carries it', () => {
    // 116.7 and not 116.75. The chips exist so a reader can catch the coach
    // disagreeing with their own Progress screen, and a chip that rounds to a
    // plate step teaches them the chips are approximate — which is the habit
    // that makes a real fabrication invisible.
    expect(briefChip(fullBrief, 'kg')).toBe('102.5 kg × 5 beats 116.7 e1RM')
  })
})

const debrief: DebriefBlock = {
  unit: 'kg',
  found: true,
  sets: 3,
  exercises: 1,
  volume_kg: 1980,
  duration_min: 45,
  records: 1,
  anchor: {
    exercise: 'Lat Pulldown (Cable)',
    e1rm: 93.3,
    top_weight_kg: 70,
    top_reps: 10,
    previous_e1rm: 90,
    gain_since_last_e1rm: 3.3,
    progression_streak: 4,
    e1rm_28d: 93.3,
    e1rm_before_28d: 73.3,
  },
  low_band: { muscle: 'calves', sets: 0 },
}

describe('the debrief skeleton', () => {
  it('leads with a progression streak', () => {
    expect(debriefSkeleton(debrief, 'kg')).toBe(
      '4th straight Lat Pulldown (Cable) progression.',
    )
  })

  it('falls back through gain, month movement, records, then a band gap', () => {
    const anchor = debrief.anchor!
    const noStreak = { ...debrief, anchor: { ...anchor, progression_streak: 1 } }
    expect(debriefSkeleton(noStreak, 'kg')).toBe(
      'Lat Pulldown (Cable) estimate up 3.3 kg on last session.',
    )

    const flatSession = {
      ...debrief,
      anchor: { ...anchor, progression_streak: 0, gain_since_last_e1rm: 0 },
    }
    expect(debriefSkeleton(flatSession, 'kg')).toBe(
      'Lat Pulldown (Cable) estimate up 20 kg this month.',
    )

    const flatMonth = {
      ...debrief,
      anchor: {
        ...anchor,
        progression_streak: 0,
        gain_since_last_e1rm: 0,
        e1rm_28d: 73.3,
        e1rm_before_28d: 73.3,
      },
    }
    expect(debriefSkeleton(flatMonth, 'kg')).toBe('1 personal record logged.')

    const nothingBeaten = { ...flatMonth, records: 0 }
    expect(debriefSkeleton(nothingBeaten, 'kg')).toBe('calves is at 0 sets this week.')
  })

  it('says nothing rather than manufacturing significance', () => {
    const anchor = debrief.anchor!
    const quiet: DebriefBlock = {
      ...debrief,
      records: 0,
      low_band: null,
      anchor: {
        ...anchor,
        progression_streak: 0,
        gain_since_last_e1rm: -2.5,
        e1rm_28d: 73.3,
        e1rm_before_28d: 73.3,
      },
    }
    expect(debriefSkeleton(quiet, 'kg')).toBeNull()
  })

  it('renders nothing for a workout that is not the caller’s', () => {
    // `session_debrief` answers `found: false` for an id RLS will not show,
    // and the surface has to treat that as silence rather than as an error.
    const foreign: DebriefBlock = {
      ...debrief,
      found: false,
      sets: 0,
      anchor: null,
    }
    expect(debriefSkeleton(foreign, 'kg')).toBeNull()
    expect(debriefChip(foreign, 'kg')).toBeUndefined()
    expect(debriefSkeleton(null, 'kg')).toBeNull()
  })

  it('never repeats the numbers printed above it', () => {
    // Volume, sets and duration are on the same screen in 27px type. A line
    // restating them is the coach proving it can read.
    const line = debriefSkeleton(debrief, 'kg')!
    expect(line).not.toContain('1980')
    expect(line).not.toContain('45')
    expect(line).not.toContain('3 sets')
  })

  it('names the top set as one set', () => {
    expect(debriefChip(debrief, 'kg')).toBe('Lat Pulldown (Cable) 70 kg × 10')
  })
})

describe('a malformed block never takes the screen down', () => {
  /**
   * The regression this file exists to prevent from recurring.
   *
   * The e2e smoke suite caught it on the first CI run: an RPC that does not
   * exist yet answered `[]`, `[]` is truthy so it sailed past a `!data` check,
   * and `block.low_bands.length` on an array threw. The Log tab rendered the
   * error boundary and there was no Start button on the screen the app opens
   * on — the exact failure the two-stage draw exists to make impossible,
   * arriving through the shape of the answer rather than the presence of an
   * error.
   *
   * `fetchBriefBlock` now rejects anything that is not a plain object, and
   * these assert the second line of defence: the composers are total.
   */
  const junk = [
    [] as unknown,
    {} as unknown,
    { target: null } as unknown,
    { low_bands: null } as unknown,
    { due_routine: {} } as unknown,
    { days_since_last: 'soon' } as unknown,
    { anchor: undefined, found: true } as unknown,
  ]

  it.each(junk.map((b, i) => [i, b] as const))(
    'briefSkeleton survives shape %i',
    (_i, block) => {
      expect(() => briefSkeleton(block as BriefBlock, 'kg')).not.toThrow()
      expect(() => briefChip(block as BriefBlock, 'kg')).not.toThrow()
    },
  )

  it.each(junk.map((b, i) => [i, b] as const))(
    'debriefSkeleton survives shape %i',
    (_i, block) => {
      expect(() => debriefSkeleton(block as DebriefBlock, 'kg')).not.toThrow()
      expect(() => debriefChip(block as DebriefBlock, 'kg')).not.toThrow()
    },
  )
})

describe('ordinal', () => {
  it('handles the counts a streak can reach', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
    ])
  })
})
