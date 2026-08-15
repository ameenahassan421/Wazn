import { describe, expect, it } from 'vitest'
import {
  checkGrounded,
  collectAllowedNumbers,
  extractNumbers,
  isGrounded,
  partitionGrounded,
  ungroundedNames,
} from '../../supabase/functions/_shared/grounding'

/**
 * The zero-fabricated-numbers policy, as assertions.
 *
 * These are the cases that decide whether a note reaches a user. Two failure
 * directions matter and they cost differently: letting an invented figure
 * through is the one §12 says pauses the feature, and dropping a true note is
 * how the feature stops being worth opening. The tolerances below are where
 * those two meet, and the limits this cannot see are written down in the
 * module rather than left to be discovered.
 */

// A realistic slice of what `coach_stats()` returns.
const BLOCK = {
  unit: 'kg',
  window_days: 90,
  sessions_last_7: 4,
  sessions_last_28: 15,
  weekly_sets_by_muscle: { chest: 22, back: 9, quads: 6 },
  weekly_sets_by_muscle_4w_ago: { chest: 18, back: 14 },
  lifts: [
    {
      name: 'Bench Press (Barbell)',
      muscle_group: 'chest',
      best_e1rm: 102.4,
      best_e1rm_28d: 102.4,
      best_e1rm_before: 99.1,
      sets: 46,
      records: 3,
    },
    { name: '21s Bicep Curl', muscle_group: 'biceps', best_e1rm: 31.5, sets: 8 },
  ],
  records_last_28: 2,
  total_sets_90d: 511,
}

describe('extractNumbers', () => {
  it('reads plain integers and decimals', () => {
    expect(extractNumbers('chest 22 sets · e1RM 102.4')).toEqual([22, 102.4])
  })

  it('does not read the digit out of e1RM', () => {
    // This app's central term contains a digit. The first draft harvested a
    // phantom 1 from every note that used the word.
    expect(extractNumbers('e1RM held at 102.4')).toEqual([102.4])
    expect(extractNumbers('best e1rm_28d')).toEqual([28])
  })

  it('does not read 1RM as the figure one', () => {
    expect(extractNumbers('a 1RM attempt')).toEqual([])
    expect(extractNumbers('your 5RM is 102.4')).toEqual([102.4])
  })

  it('reads a thousands-grouped figure as one number', () => {
    // "1,240 kg" is one volume, not 1 and 240. Getting this wrong would make
    // every grouped number in the app read as two fabrications.
    expect(extractNumbers('volume 1,240 kg')).toEqual([1240])
  })

  it('reads both ends of a range', () => {
    expect(extractNumbers('target 10-20 sets')).toEqual([10, 20])
  })

  it('finds nothing in prose with no figures', () => {
    expect(extractNumbers('your bench is moving well')).toEqual([])
  })
})

describe('collectAllowedNumbers', () => {
  const allowed = collectAllowedNumbers(BLOCK)

  it('collects values at every depth', () => {
    expect(allowed.has(22)).toBe(true) // nested object
    expect(allowed.has(102.4)).toBe(true) // inside an array of objects
    expect(allowed.has(511)).toBe(true) // top level
  })

  it('collects numbers out of key names', () => {
    // This is how a chip legitimately says "last 4 wk" or "in 28 days" —
    // 28 and 4 exist only in `best_e1rm_28d` and `..._4w_ago`.
    expect(allowed.has(28)).toBe(true)
    expect(allowed.has(4)).toBe(true)
    expect(allowed.has(7)).toBe(true)
  })

  it('collects numbers out of exercise names', () => {
    // Otherwise "21s Bicep Curl" would make its own name a fabrication.
    expect(allowed.has(21)).toBe(true)
  })

  it('always allows the productive-set band the prompt states as a rule', () => {
    // 10 and 20 are in the system prompt, not the block; a note that says
    // "under the 10 to 20 range" is quoting an instruction it was given.
    const empty = collectAllowedNumbers({})
    expect(empty.has(10)).toBe(true)
    expect(empty.has(20)).toBe(true)
  })
})

describe('isGrounded', () => {
  const allowed = new Set([102.4, 99.1, 22])

  it('accepts an exact match', () => {
    expect(isGrounded(102.4, allowed)).toBe(true)
  })

  it("accepts the model's own rounding", () => {
    // The block rounds to one decimal; a note saying "102 kg" is quoting it.
    expect(isGrounded(102, allowed)).toBe(true)
    expect(isGrounded(99, allowed)).toBe(true)
  })

  it('rejects a number that is merely close', () => {
    // 103 is not 102.4 rounded. This is the boundary the whole guard turns on.
    expect(isGrounded(103, allowed)).toBe(false)
    expect(isGrounded(101, allowed)).toBe(false)
  })

  it('rejects a figure that appears nowhere', () => {
    expect(isGrounded(140, allowed)).toBe(false)
  })

  it('accepts a share written as a percentage', () => {
    expect(isGrounded(42, new Set([0.42]))).toBe(true)
  })
})

describe('checkGrounded', () => {
  const allowed = collectAllowedNumbers(BLOCK)

  it('passes a note that quotes the block', () => {
    const result = checkGrounded(
      'Back volume is low. Back has 9 sets this week, under the 10 to 20 range. back 9 · target 10-20',
      allowed,
    )
    expect(result).toEqual({ grounded: true, ungrounded: [] })
  })

  it('catches an invented figure and names it', () => {
    const result = checkGrounded('Your bench e1RM reached 140 kg this month.', allowed)
    expect(result.grounded).toBe(false)
    expect(result.ungrounded).toEqual([140])
  })

  it('catches a plausible near-miss', () => {
    // The dangerous kind: 105 looks like it could be 102.4 and is not.
    expect(checkGrounded('e1RM 105 kg', allowed).grounded).toBe(false)
  })

  it('reports each invented figure once', () => {
    const result = checkGrounded('140 kg, and again 140 kg, plus 175', allowed)
    expect(result.ungrounded).toEqual([140, 175])
  })

  it('passes prose with no numbers at all', () => {
    expect(checkGrounded('Keep the bench where it is.', allowed).grounded).toBe(true)
  })
})

describe('partitionGrounded', () => {
  it('drops the bad observation and keeps the good ones', () => {
    // The rule the audit asks for: one bad figure costs that note, not the
    // four beside it. A model that hallucinates once still did useful work.
    const { kept, dropped } = partitionGrounded(
      [
        {
          title: 'Back is light',
          body: 'Back has 9 sets.',
          chip: 'back 9 · target 10-20',
        },
        { title: 'Bench moving', body: 'e1RM 175 kg is a record.', chip: 'e1RM 175' },
        { title: 'Chest is high', body: 'Chest has 22 sets.', chip: 'chest 22' },
      ],
      BLOCK,
    )
    expect(kept.map((i) => i.title)).toEqual(['Back is light', 'Chest is high'])
    expect(dropped).toHaveLength(1)
    expect(dropped[0].ungrounded).toEqual([175])
  })

  it('checks the chip as well as the prose', () => {
    // The chip is the part a reader trusts most, being bare figures.
    const { dropped } = partitionGrounded(
      [{ title: 'Fine', body: 'Nothing numeric here.', chip: 'chest 77 sets' }],
      BLOCK,
    )
    expect(dropped[0].ungrounded).toEqual([77])
  })

  it('keeps everything when the model behaved', () => {
    const { kept, dropped } = partitionGrounded(
      [
        {
          title: 'Four sessions',
          body: 'You trained 4 times in 7 days.',
          chip: '4 · 7 d',
        },
      ],
      BLOCK,
    )
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })

  it('handles a missing chip without treating it as a violation', () => {
    const { kept } = partitionGrounded(
      [{ title: 'Chest 22', body: 'Chest has 22 sets.' }],
      BLOCK,
    )
    expect(kept).toHaveLength(1)
  })
})

/**
 * The invented-lift check, which had no test and cost five days for it.
 *
 * From 2026-08-10 to 2026-08-14 the weekly review failed 22 times in a row with
 * `unknown-exercise`, and the Coach tab said "the review came back unreadable"
 * the whole time. Nothing was wrong with the model: the block's single win was
 * "Iso-Lateral Chest Press (Machine)", the catalog also holds a "Chest Press
 * (Machine)", and the shorter name is a whole-word substring of the longer one.
 * The model quoted the block correctly and was refused for the one true
 * sentence in the review — twice per request, which is a refused review.
 *
 * The first case below is that exact block. The rest are why the fix cannot be
 * "stop checking", and they are written the way they are because the FIRST fix
 * for this was wrong in the opposite direction.
 *
 * That fix masked the block's lift names out of the text before scanning. It
 * passed every test above and shipped, and it had turned the guard off for a
 * whole class: deleting a block's "bench press" out of an invented "Incline
 * Bench Press" leaves "incline", so the scan finds nothing. Any block holding
 * Bench Press, Squat or Deadlift — most weeks — silently stopped flagging
 * every variation of them. A false negative here is a fabricated lift on
 * screen, which §12 treats as grounds for pausing the feature; the bug it
 * replaced only refused good reviews.
 *
 * So the fixture below deliberately holds a **single-word** plateau
 * (`Deadlift`) and the catalog holds variations that CONTAIN block names. The
 * old masking fix passes the two original cases and fails these.
 */
describe('ungroundedNames', () => {
  const WIN_BLOCK = {
    unit: 'kg',
    wins: [
      { exercise: 'Iso-Lateral Chest Press (Machine)', gain: 23.9, e1rm_28d: 72.6 },
    ],
    plateaus: [
      { exercise: 'Bench Press (Barbell)', sessions: 8, last_e1rm: 70.8 },
      { exercise: 'Deadlift (Barbell)', sessions: 6, last_e1rm: 140.2 },
    ],
  }
  const CATALOG = [
    'Iso-Lateral Chest Press (Machine)',
    'Chest Press (Machine)',
    'Bench Press (Barbell)',
    'Incline Bench Press (Dumbbell)',
    'Deadlift (Barbell)',
    'Romanian Deadlift (Barbell)',
    'Lateral Raise (Dumbbell)',
    'Seated Lateral Raise (Dumbbell)',
    'Squat',
  ]

  it('does not report a lift the block named as an invention', () => {
    expect(
      ungroundedNames(
        'Iso-Lateral Chest Press is up 23.9 kg to 72.6.',
        WIN_BLOCK,
        CATALOG,
      ),
    ).toEqual([])
  })

  it('still catches a lift the model reached for rather than read', () => {
    // The failure the check exists for, and the module's own example: every
    // figure grounded, the lift invented. Note the block plateaus on
    // "Deadlift" — a single word, contained in this recommendation — which is
    // exactly the shape that made the masking fix fail open.
    expect(
      ungroundedNames('Add Romanian Deadlift on Thursday.', WIN_BLOCK, CATALOG),
    ).toEqual(['romanian deadlift'])
  })

  it('catches a variation of a lift the block DOES contain', () => {
    // The mirror of the original bug, and the more dangerous direction. The
    // block plateaus on Bench Press; a model asked for one change is most
    // likely to reach for a variation of the lift it was just told about.
    // "Incline Bench Press" contains "bench press", and the user has never
    // performed it.
    expect(
      ungroundedNames('Add Incline Bench Press on Friday.', WIN_BLOCK, CATALOG),
    ).toEqual(['incline bench press'])
  })

  it('catches a variation built on a single-word block lift', () => {
    // "Seated Lateral Raise" is not in the block. Nothing in the block is
    // called "Lateral Raise" either — but if a future block held one, the
    // seated version would still be a different lift.
    expect(
      ungroundedNames(
        'Your deadlift has not moved in 6 sessions. Try Seated Lateral Raise.',
        WIN_BLOCK,
        CATALOG,
      ),
    ).toEqual(['seated lateral raise'])
  })

  it('reads both directions in one sentence', () => {
    // The long-inside-short and short-inside-long cases together: the win is
    // quoted correctly and must pass, the invented variation must not.
    expect(
      ungroundedNames(
        'Iso-Lateral Chest Press is up 23.9 kg. Add Incline Bench Press on Friday.',
        WIN_BLOCK,
        CATALOG,
      ),
    ).toEqual(['incline bench press'])
  })

  it('catches a short lift recommended beside the long one it hides inside', () => {
    // The mask takes out the block's own mention, not the word forever. A
    // second, standalone "Chest Press" is still a recommendation for a lift
    // the block never measured.
    expect(
      ungroundedNames(
        'Iso-Lateral Chest Press is up. Add a Chest Press on Friday.',
        WIN_BLOCK,
        CATALOG,
      ),
    ).toEqual(['chest press'])
  })

  it('ignores punctuation and case on both sides of the comparison', () => {
    // `baseName` keeps the hyphen; prose may not. Whichever way the model
    // writes it, this is the block's own lift.
    expect(
      ungroundedNames('ISO LATERAL CHEST PRESS held at 72.6.', WIN_BLOCK, CATALOG),
    ).toEqual([])
  })

  it('never flags a single-word lift', () => {
    // A documented limit, not an oversight: "Squat" is an exercise and an
    // ordinary English word, and a check that flags the sentence "your squat
    // is behind" gets turned off inside a day.
    expect(ungroundedNames('Your squat is behind.', WIN_BLOCK, CATALOG)).toEqual([])
  })

  it('is disabled by an empty catalog rather than flagging everything', () => {
    expect(
      ungroundedNames('Add Romanian Deadlift on Thursday.', WIN_BLOCK, []),
    ).toEqual([])
  })
})
