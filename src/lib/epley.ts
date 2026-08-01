/**
 * Epley estimated 1RM: weight * (1 + reps / 30).
 *
 * Returns null for any set that does not qualify: warmups, and sets missing
 * either weight or reps (bodyweight movements, cardio, planks).
 */
export function estimatedOneRepMax(
  weightKg: number | null,
  reps: number | null,
  setType: string,
): number | null {
  if (setType === 'warmup') return null
  if (weightKg === null || reps === null) return null
  return weightKg * (1 + reps / 30)
}
