import { describeError, supabase } from './supabase'
import type { Exercise, MuscleGroup } from './types'

/**
 * Creating a custom exercise.
 *
 * The row is private by construction rather than by a filter: `exercises` has
 * carried `owner_id` since 0001 and its SELECT policy has always read
 * `owner_id is null or owner_id = auth.uid()`. Migration 0014 added the write
 * policies, so `owner_id` and `is_custom` are checked by the database on the
 * way in — this function sets them, but nothing depends on it doing so.
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

export async function createCustomExercise(input: {
  name: string
  muscleGroup: MuscleGroup
  equipment: string
}): Promise<Exercise> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2) throw new Error('Give the exercise a name.')
  if (name.length > 80) throw new Error('That name is too long.')

  const { data: user } = await supabase.auth.getUser()
  const ownerId = user.user?.id
  if (!ownerId) throw new Error('Sign in to add an exercise.')

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name,
      muscle_group: input.muscleGroup,
      equipment: input.equipment,
      is_custom: true,
      owner_id: ownerId,
    })
    .select('*')
    .single()

  if (error) {
    // 23505 is the per-owner unique index from 0014. The useful thing to say
    // is that they already have one, not what PostgREST calls the constraint.
    if ((error as { code?: string }).code === '23505') {
      throw new Error(`You already have an exercise called “${name}”.`)
    }
    throw new Error(describeError('Adding that exercise', error))
  }
  return data as Exercise
}
