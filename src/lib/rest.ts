import { DEFAULT_REST_SECONDS } from './use-rest-timer'

/**
 * How long to rest after a set of one exercise, and where that number comes
 * from.
 *
 * Three sources, most specific first: what this user set for this lift
 * (`exercise_rest`, migration 0015), what the catalogue says about the
 * movement (`exercises.default_rest_seconds`, 0004), then the app default.
 * The middle one has no writer today and is kept because an importer is the
 * right thing to fill it — a heavy squat and a lateral raise do not want the
 * same two minutes, and the catalogue knows which is which before the user
 * has logged anything.
 */

/** Zero is "no timer for this lift", not "unset" — see 0015. */
export const REST_MIN_SECONDS = 0

/** Ten minutes. Past that a rest timer is a nap and the number stops helping. */
export const REST_MAX_SECONDS = 600

export function clampRest(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_REST_SECONDS
  return Math.min(REST_MAX_SECONDS, Math.max(REST_MIN_SECONDS, Math.round(seconds)))
}

/** Steps in whole increments of `step`, so 95 + 15 lands on 105, not 110. */
export function stepRest(seconds: number, delta: number, step: number): number {
  const base = Number.isFinite(seconds) ? seconds : DEFAULT_REST_SECONDS
  const next =
    delta > 0
      ? Math.floor(base / step) * step + step
      : Math.ceil(base / step) * step - step
  return clampRest(next)
}

export function resolveRest(
  catalogueDefault: number | null | undefined,
  override: number | null | undefined,
): number {
  if (override !== null && override !== undefined) return clampRest(override)
  if (catalogueDefault !== null && catalogueDefault !== undefined) {
    return clampRest(catalogueDefault)
  }
  return DEFAULT_REST_SECONDS
}

/** "off" / "1:30". Zero has to read as a decision, not as a broken clock. */
export function describeRest(seconds: number): string {
  if (seconds <= 0) return 'off'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ── The earned rest — design v3.0 §04 ─────────────────────────────────────
   "RestChip duration becomes mode- and effort-aware: heavy single at 95% e1RM
   earns 4 min where a warm-up earns 90 s." Two rules govern everything below:

     MANUAL OVERRIDE ALWAYS WINS, and is remembered per exercise. `resolveRest`
     above already implements that, and `earnedRest` is only ever consulted
     when there is no override — which is why it takes the resolved value as
     its floor rather than replacing it.

     THE REASON IS A NUMBER, not a sentence. The bar shows `top set at 88%`,
     and this returns 88 — the component says the words. */

/**
 * Effort as a percentage of the lift's best estimate, or null.
 *
 * Null when either side is missing, and null is what stops the rest bar
 * claiming a reason: doctrine 1 applies to the chip on the rest bar exactly as
 * it applies to a coach's sentence.
 */
export function effortPercent(
  weightKg: number | null,
  bestE1rmKg: number | null | undefined,
): number | null {
  if (weightKg === null || weightKg <= 0) return null
  if (bestE1rmKg === null || bestE1rmKg === undefined || bestE1rmKg <= 0) return null
  return Math.round((weightKg / bestE1rmKg) * 100)
}

/**
 * How long this set earned, given the mode's band and what it cost.
 *
 * The scale is linear across the mode's own min–max, anchored at two points a
 * lifter would recognise: 60% of an estimated max is easy work and gets the
 * band's floor; 95% is a top single and gets its ceiling. Warm-ups are
 * exempted outright — a ramp set that earns four minutes turns a ten-minute
 * warm-up into half an hour.
 *
 * Returns null when effort is unknown, and the caller keeps the resolved
 * per-exercise value. Guessing a duration from no evidence is how a rest timer
 * stops being believed.
 */
export function earnedRest(
  effort: number | null,
  band: { min: number; max: number },
  setType: string,
): number | null {
  if (setType === 'warmup') return clampRest(Math.min(90, band.min))
  if (effort === null) return null
  const t = Math.min(1, Math.max(0, (effort - 60) / 35))
  const seconds = band.min + (band.max - band.min) * t
  // To the nearest fifteen seconds. A rest timer that says 2:47 is reporting a
  // calculation rather than a decision.
  return clampRest(Math.round(seconds / 15) * 15)
}
