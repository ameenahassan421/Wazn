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
