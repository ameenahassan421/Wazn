import type { Unit } from './units'

/**
 * Warm-up ramp: 40/60/80% of the working weight, per the plan.
 *
 * Rounded to what the plates can actually make — a suggestion of 87.3 lb is
 * useless in a gym. Rounding is to the smallest plate pair (5 lb / 2.5 kg
 * total bar increment), and never below the bar.
 */
export const RAMP_PERCENTS = [0.4, 0.6, 0.8] as const

/** Smallest change you can make to a bar with one pair of the lightest plate. */
const INCREMENT: Record<Unit, number> = { lbs: 5, kg: 2.5 }

export interface WarmupSet {
  percent: number
  weight: number
  /** Descending as the bar gets heavier — the usual ramp shape. */
  reps: number
}

const RAMP_REPS = [8, 5, 3]

/**
 * Returns null for bodyweight or nonsensical input rather than inventing a
 * ramp. Also returns null when the working weight is at or below the bar:
 * there is nothing to ramp through.
 */
export function warmupRamp(
  workingWeight: number,
  unit: Unit,
  bar: number,
): WarmupSet[] | null {
  if (!Number.isFinite(workingWeight) || workingWeight <= bar) return null

  const step = INCREMENT[unit]
  const seen = new Set<number>()
  const sets: WarmupSet[] = []

  RAMP_PERCENTS.forEach((percent, i) => {
    const raw = workingWeight * percent
    const rounded = Math.max(bar, Math.round(raw / step) * step)
    // Two percentages can round to the same loadable weight on a light lift;
    // showing the same number twice reads as a bug.
    if (seen.has(rounded)) return
    seen.add(rounded)
    sets.push({ percent, weight: rounded, reps: RAMP_REPS[i] ?? 3 })
  })

  return sets.length > 0 ? sets : null
}
