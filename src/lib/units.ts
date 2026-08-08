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

/**
 * An ESTIMATE in the display unit — an e1RM, or a change in one.
 *
 * `toDisplayWeight` snaps to the nearest quarter-kilo because a weight is
 * something you load, and 116.7 kg is not a thing you can put on a bar. An
 * estimated 1RM is not a load: nobody racks it, and snapping it prints 116.75
 * where the database says 116.7.
 *
 * That difference is not cosmetic. The coach's chips exist so a reader can
 * catch the model disagreeing with their own charts, and a chip reading
 * "beats 116.75 e1RM" against a Progress screen reading 116.7 teaches them
 * that the chips are approximate — which is exactly the habit that makes a
 * real fabrication invisible. So estimates convert and round to one decimal,
 * and never to a plate.
 */
export function formatEstimate(kg: number | null, unit: Unit): string {
  if (kg === null) return '—'
  const raw = unit === 'kg' ? kg : kgToLbs(kg)
  return raw.toFixed(1).replace(/\.0$/, '')
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
