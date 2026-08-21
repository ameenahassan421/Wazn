import { supabase } from './supabase'
import type { Measurement, ProteinDay, WeighIn } from './body'
import { asCheckIn, localDay, type CheckIn } from './readiness'

/**
 * Reads and writes for the second dataset — migration 0027's tables.
 *
 * ── EVERY READ ANSWERS "NOTHING" RATHER THAN THROWING ───────────────────────
 * The same rule `coach.ts` follows and for the same reason: 0027 may not be
 * applied yet, and a Body tab that throws behind an error boundary because a
 * table does not exist is worse than one that renders "Log a weigh-in to start
 * the second chart." The empty answer and the not-yet-migrated answer are
 * deliberately indistinguishable to the caller — both mean "there is nothing
 * to draw", and neither is the lifter's problem.
 *
 * That also makes the shape check load-bearing: `isBlock` exists here for the
 * reason it exists in `coach.ts` — an RPC that does not exist can come back as
 * `[]` through some stacks, `[]` is truthy, and reading `.weights.length` off
 * an array is what took down the Log screen once already.
 */

export interface BodyOverview {
  weights: WeighIn[]
  protein: ProteinDay[]
  measurements: Measurement[]
}

const EMPTY: BodyOverview = { weights: [], protein: [], measurements: [] }

function isBlock(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Re-exported, not redefined. It moved to `readiness.ts` on 2026-08-21 so the
 * native store could use it too — this module imports the browser Supabase
 * client and can never enter `@wazn/domain`, and a date boundary copied per
 * platform is a date boundary that eventually disagrees with itself.
 */
export { localDay }

export async function fetchBodyOverview(weeks = 12): Promise<BodyOverview> {
  try {
    const { data, error } = await supabase.rpc('body_overview', { p_weeks: weeks })
    if (error || !isBlock(data)) return EMPTY
    return {
      weights: asArray<WeighIn>(data.weights),
      protein: asArray<ProteinDay>(data.protein),
      measurements: asArray<Measurement>(data.measurements),
    }
  } catch {
    return EMPTY
  }
}

/**
 * One weigh-in per day, last write wins.
 *
 * Kilograms, always — callers convert from the display unit before calling.
 * Storing what the toggle happened to be showing is the single most damaging
 * thing this table could get wrong, and it would be invisible until somebody
 * flipped the toggle and watched their bodyweight jump.
 */
export async function logWeighIn(weightKg: number, day = localDay()): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('body_weights')
      .upsert(
        { measured_on: day, weight_kg: weightKg },
        { onConflict: 'user_id,measured_on' },
      )
    return !error
  } catch {
    return false
  }
}

export async function logProtein(
  grams: number,
  targetG: number | null,
  day = localDay(),
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('protein_days')
      .upsert({ day, grams, target_g: targetG }, { onConflict: 'user_id,day' })
    return !error
  } catch {
    return false
  }
}

export async function logMeasurement(
  site: string,
  valueCm: number,
  day = localDay(),
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('body_measurements')
      .upsert(
        { site, measured_on: day, value_cm: valueCm },
        { onConflict: 'user_id,site,measured_on' },
      )
    return !error
  } catch {
    return false
  }
}

/* ── The daily check-in ───────────────────────────────────────────────────── */

/** Today's tap, or null. Null is "not asked yet", which reads as Normal. */
export async function fetchCheckIn(day = localDay()): Promise<CheckIn | null> {
  try {
    const { data, error } = await supabase
      .from('daily_checkins')
      .select('state')
      .eq('day', day)
      .maybeSingle()
    if (error || !data) return null
    return asCheckIn((data as { state?: unknown }).state)
  } catch {
    return null
  }
}

/**
 * One tap, and it may be changed. Returns false on any failure, which the row
 * treats as "stay on the optimistic value" — a check-in that fails to save is
 * not worth an error message mid-warm-up, and the readiness it feeds degrades
 * to Normal on the next load, silently.
 */
export async function logCheckIn(state: CheckIn, day = localDay()): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('daily_checkins')
      .upsert({ day, state }, { onConflict: 'user_id,day' })
    return !error
  } catch {
    return false
  }
}
