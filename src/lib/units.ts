/**
 * Weight is always stored in kilograms. The lbs/kg switch is display only —
 * nothing in the database changes when it is flipped.
 */
export type Unit = 'lbs' | 'kg'

export const LBS_PER_KG_FACTOR = 0.453592

/** Display rounding: nearest 0.5 lb, nearest 0.25 kg. Storage stays exact. */
const DISPLAY_STEP: Record<Unit, number> = { lbs: 0.5, kg: 0.25 }

export function kgToLbs(kg: number): number {
  return kg / LBS_PER_KG_FACTOR
}

export function lbsToKg(lbs: number): number {
  return lbs * LBS_PER_KG_FACTOR
}

/** kg out of the database -> a number in the user's display unit, rounded. */
export function toDisplayWeight(kg: number, unit: Unit): number {
  const raw = unit === 'kg' ? kg : kgToLbs(kg)
  const step = DISPLAY_STEP[unit]
  return Math.round(raw / step) * step
}

/** What the user typed in their display unit -> kg for storage. */
export function fromDisplayWeight(value: number, unit: Unit): number {
  return unit === 'kg' ? value : lbsToKg(value)
}

/** Trims the trailing zero so 135.0 reads as "135" but 132.5 keeps its half. */
export function formatWeight(kg: number | null, unit: Unit): string {
  if (kg === null) return '—'
  const display = toDisplayWeight(kg, unit)
  return display.toFixed(2).replace(/\.?0+$/, '')
}

export function formatWeightWithUnit(kg: number | null, unit: Unit): string {
  if (kg === null) return 'bodyweight'
  return `${formatWeight(kg, unit)} ${unit}`
}
