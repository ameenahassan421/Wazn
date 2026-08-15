/**
 * Readiness — computed, never displayed as a gauge.
 *
 * Design v3.0 §New inputs: `check-in + sleep debt + HRV trend + days since
 * last session per group`, collapsed to three internal states. The spec is
 * explicit that it surfaces "only as changed behaviour with a chip": lighter
 * ghosts, longer rests, a Today brief that says why. Wazn is not Whoop — the
 * score is an input, not a product — so nothing in this module returns a
 * number for a dial to point at.
 *
 * ── THE DEGRADED PATH IS THE COMMON PATH ────────────────────────────────────
 * Nobody has granted a wearable. Almost nobody taps the check-in row on any
 * given day. So `normal` with every input missing is not an error branch, it
 * is Tuesday: `compute({})` returns `normal` and `chip()` returns null, and a
 * null chip is what stops the Today brief claiming a reason it does not have
 * (doctrine 1: no chip, no claim).
 */

export const CHECK_INS = ['fresh', 'normal', 'drained'] as const
export type CheckIn = (typeof CHECK_INS)[number]

/** Three internal states. Never rendered as a word to the user. */
export type Readiness = 'loaded' | 'normal' | 'light'

export interface ReadinessInputs {
  /** Today's one tap. Absent means Normal, silently — never a nag. */
  checkIn?: CheckIn | null
  /** Last night, in minutes. From the platform health API, when granted. */
  sleepMinutes?: number | null
  /** The lifter's own baseline, in minutes. Defaults to 7h if unknown. */
  sleepBaselineMinutes?: number | null
  /** HRV against the trailing baseline: below / steady / above. */
  hrv?: 'below' | 'steady' | 'above' | null
  /** Days since this session's primary muscle group was last trained. */
  daysRested?: number | null
}

export function asCheckIn(value: unknown): CheckIn | null {
  return typeof value === 'string' && (CHECK_INS as readonly string[]).includes(value)
    ? (value as CheckIn)
    : null
}

const DEFAULT_SLEEP_BASELINE = 7 * 60

/**
 * Half an hour is inside the noise of a phone guessing when you fell asleep;
 * an hour is not.
 *
 * These are calibrated against the design's own worked example rather than
 * picked: the Today brief's light-readiness state shows `sleep 5:40`, which is
 * 80 minutes short of a 7-hour baseline, and it has to be enough to reach
 * `light` on its own or the mock is showing a state the app cannot produce.
 */
const SLEEP_SHORT = 30
const SLEEP_VERY_SHORT = 60

/**
 * Sleep debt in minutes, positive when short. Null when there is no reading —
 * which is different from zero, and the difference decides whether a chip may
 * cite sleep at all.
 */
export function sleepDebtMinutes(inputs: ReadinessInputs): number | null {
  if (typeof inputs.sleepMinutes !== 'number' || inputs.sleepMinutes <= 0) return null
  const baseline =
    typeof inputs.sleepBaselineMinutes === 'number' && inputs.sleepBaselineMinutes > 0
      ? inputs.sleepBaselineMinutes
      : DEFAULT_SLEEP_BASELINE
  return Math.round(baseline - inputs.sleepMinutes)
}

/**
 * The three states, from whatever inputs exist.
 *
 * A signed score rather than a cascade of ifs, because the inputs genuinely
 * combine: a drained check-in after eight days off is a lifter who is bored,
 * not broken, and a fresh check-in on four hours' sleep is a lifter who has
 * not felt it yet. Each term is bounded so no single input can carry the
 * verdict on its own — except the check-in, which is the one the lifter
 * volunteered and therefore the one worth the most.
 *
 * The thresholds are deliberately asymmetric. Easing off costs a lifter two
 * sets; pushing on costs them a session, so `light` is reached at −2 and
 * `loaded` needs +3.
 */
export function computeReadiness(inputs: ReadinessInputs): Readiness {
  let score = 0

  if (inputs.checkIn === 'fresh') score += 2
  else if (inputs.checkIn === 'drained') score -= 2

  const debt = sleepDebtMinutes(inputs)
  if (debt !== null) {
    if (debt >= SLEEP_VERY_SHORT) score -= 2
    else if (debt >= SLEEP_SHORT) score -= 1
    else if (debt <= -SLEEP_VERY_SHORT) score += 1
  }

  if (inputs.hrv === 'below') score -= 1
  else if (inputs.hrv === 'above') score += 1

  // Rest is the one input the app always has, because it comes from the log.
  if (typeof inputs.daysRested === 'number') {
    if (inputs.daysRested >= 4) score += 1
    else if (inputs.daysRested <= 1) score -= 1
  }

  if (score <= -2) return 'light'
  if (score >= 3) return 'loaded'
  return 'normal'
}

/**
 * The chip that entitles a readiness claim, or null.
 *
 * Null means the app has no figure to show, and doctrine 1 forbids the
 * sentence without it — so the Today brief falls back to its ordinary line
 * rather than saying "sleep ran short" with nothing behind it. Only inputs
 * that were actually measured may appear: a check-in on its own is a feeling,
 * and "drained" is not a number, so it is named as the tap it was.
 */
export function readinessChip(
  inputs: ReadinessInputs,
  format: {
    /** `5:40` from 340 minutes. Locale-free: figures stay Latin (§RTL). */
    duration: (minutes: number) => string
    /** The translated fragments, so this module holds no English. */
    sleep: (value: string) => string
    checkIn: (state: CheckIn) => string
    rested: (days: number) => string
  },
): string | null {
  const parts: string[] = []

  // The same threshold the score uses. If sleep moved the verdict it has to be
  // allowed to appear in the chip, or the app changes behaviour and then
  // declines to say why.
  const debt = sleepDebtMinutes(inputs)
  if (debt !== null && debt >= SLEEP_SHORT && typeof inputs.sleepMinutes === 'number') {
    parts.push(format.sleep(format.duration(inputs.sleepMinutes)))
  }

  if (inputs.checkIn && inputs.checkIn !== 'normal') {
    parts.push(format.checkIn(inputs.checkIn))
  }

  if (typeof inputs.daysRested === 'number' && inputs.daysRested >= 2) {
    parts.push(format.rested(inputs.daysRested))
  }

  if (parts.length === 0) return null
  return parts.join(' · ')
}

/**
 * How many working sets a light day drops from the plan.
 *
 * One per exercise, capped at two per session, and never below one set: a
 * lighter day is data, not a lapse (doctrine 3), and a session trimmed to
 * nothing is a session the lifter skips instead. `loaded` adds nothing — the
 * AI proposes, and proposing MORE work unasked is the one direction that
 * turns a coach into a nag.
 */
export function setsToTrim(readiness: Readiness, planned: number): number {
  if (readiness !== 'light') return 0
  if (planned <= 2) return 0
  return Math.min(1, planned - 2)
}

/** The load multiplier a readiness state applies to a ghost's weight. */
export function loadFactor(readiness: Readiness): number {
  // Light days ease the bar by one notch, not by a percentage anybody would
  // notice as arbitrary: `plates.ts` rounds whatever comes out of this to
  // something loadable, so the intent is "a little less", not "exactly 95%".
  if (readiness === 'light') return 0.95
  return 1
}
