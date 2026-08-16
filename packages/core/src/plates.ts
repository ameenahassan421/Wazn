import type { Unit } from './units'

/**
 * Plate maths for loading a barbell.
 *
 * Everything here is display-side. Weight is stored in kg (see CLAUDE.md), but
 * a lifter loads the bar in whatever the plates are stamped with, so the
 * calculator works in the unit on screen and never touches stored values.
 */

/** Bar weights people actually use, in each unit's own numbers. */
export const BAR_WEIGHTS: Record<Unit, number[]> = {
  lbs: [45, 35, 25],
  kg: [20, 15, 10],
}

export const DEFAULT_BAR: Record<Unit, number> = { lbs: 45, kg: 20 }

/** Plates in a typical commercial gym, heaviest first. */
export const PLATES: Record<Unit, number[]> = {
  lbs: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
}

export interface PlateResult {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: { plate: number; count: number }[]
  /** Weight the listed plates plus the bar actually make. */
  achievable: number
  /** target - achievable. Non-zero when the plates cannot make the number. */
  remainder: number
  bar: number
}

/**
 * Greedy from the heaviest plate down. Greedy is optimal here because every
 * standard plate set is such that each plate is at least the sum of nothing
 * smaller it cannot cover — and more practically, it is what a lifter does:
 * grab the biggest plate that still fits.
 *
 * Returns null when the target is below the bar, which is a real state
 * (someone typing 30 with a 45 lb bar selected) and not an error worth an
 * exception mid-workout.
 */
export function platesFor(
  target: number,
  unit: Unit,
  bar?: number,
): PlateResult | null {
  const barWeight = bar ?? DEFAULT_BAR[unit]
  if (!Number.isFinite(target) || target < barWeight) return null

  let perSideRemaining = (target - barWeight) / 2
  const perSide: { plate: number; count: number }[] = []

  for (const plate of PLATES[unit]) {
    const count = Math.floor(perSideRemaining / plate + 1e-9)
    if (count > 0) {
      perSide.push({ plate, count })
      perSideRemaining -= count * plate
    }
  }

  const loaded = perSide.reduce((sum, p) => sum + p.plate * p.count, 0)
  const achievable = barWeight + loaded * 2
  return {
    perSide,
    achievable,
    remainder: Math.round((target - achievable) * 100) / 100,
    bar: barWeight,
  }
}

/**
 * "25 + 25 + 10 = 140" — the loading as an addition, the way the design
 * writes it on the plate card.
 *
 * Plates REPEAT rather than group: "25 × 2" four lines above a set row reading
 * "62.5 kg × 5" invites reading the count as reps, and the card sits in the
 * commit cluster where that misread is expensive. And it names the total,
 * because the question the card answers is "is this bar the weight I typed".
 *
 * The total is `achievable`, never the typed target: the card must not claim
 * a number these plates cannot build. When the two differ, the disclosure
 * says by how much.
 *
 * Unit-free by design. The stepper label directly above it already reads
 * WEIGHT · KG, and there is no unit key in the catalogue — a literal "kg"
 * here would be an untranslated latin token inside an Arabic surface.
 */
export function describeBarMath(result: PlateResult): string {
  const fmt = (n: number) => Number(n.toFixed(2)).toString()
  if (result.perSide.length === 0) return `= ${fmt(result.achievable)}`
  const loaded = result.perSide.flatMap(({ plate, count }) =>
    Array.from({ length: count }, () => fmt(plate)),
  )
  return `${loaded.join(' + ')} = ${fmt(result.achievable)}`
}
