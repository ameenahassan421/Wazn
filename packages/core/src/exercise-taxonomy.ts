import type { MuscleGroup } from './types'

/**
 * The two fixed vocabularies the catalogue is built on.
 *
 * These lived in `exercises.ts` until E1, which is where `createCustomExercise`
 * and the PostgREST queries live too. That module imports the Supabase client,
 * so it cannot cross into `@wazn/core`, and these two arrays have no reason to
 * be stuck behind that. They are taxonomy: `exercise-guess.ts` derives against
 * them, the picker groups by them, the routine generator filters by them, and
 * every one of those is platform-free.
 *
 * `exercises.ts` re-exports both, so nothing that imported them from there had
 * to change.
 */
export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
]

/**
 * The equipment values the seeded catalogue uses.
 *
 * A free-text field would be friendlier to type and worse for everything else:
 * the picker groups by equipment, the routine generator filters by it, and
 * "Dumbell" would quietly become its own category forever. Fixed list.
 */
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'other',
] as const
