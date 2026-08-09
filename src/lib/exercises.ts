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

/**
 * Rename a custom exercise, or move it to a different muscle group or
 * equipment kind.
 *
 * Only custom rows, enforced by `exercises_update_own` (migration 0014): the
 * policy's `with check` requires `owner_id = auth.uid() and is_custom`, so a
 * seeded row cannot be edited even by a client that tries. That is deliberate
 * and not a limitation to route around: `exercises` is a shared catalogue, and
 * renaming a seeded lift would rename it for everyone.
 */
export async function updateCustomExercise(
  exerciseId: string,
  input: { name: string; muscleGroup: MuscleGroup; equipment: string },
): Promise<Exercise> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2) throw new Error('Give the exercise a name.')
  if (name.length > 80) throw new Error('That name is too long.')

  const { data, error } = await supabase
    .from('exercises')
    .update({
      name,
      muscle_group: input.muscleGroup,
      equipment: input.equipment,
    })
    .eq('id', exerciseId)
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error(`You already have an exercise called “${name}”.`)
    }
    throw new Error(describeError('Saving that exercise', error))
  }
  return data as Exercise
}

/**
 * Delete a custom exercise.
 *
 * `workout_sets.exercise_id` is `on delete restrict` (migration 0001), so the
 * database refuses this whenever a single set has ever been logged against it.
 * **That is the archive-not-delete guarantee, and it is structural rather than
 * a UI convention** — no amount of client code can lose that history.
 *
 * What the app owes the user is the reason. Postgres raises 23503 with a
 * constraint name in it, which tells a lifter nothing, so it is translated
 * here. The honest phrasing matters: the exercise is not "in use", it is part
 * of what they have already done.
 */
export async function deleteCustomExercise(exerciseId: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', exerciseId)
  if (!error) return
  if ((error as { code?: string }).code === '23503') {
    throw new Error(
      'You have logged sets with this exercise, so it stays in your history. Rename it instead.',
    )
  }
  throw new Error(describeError('Deleting that exercise', error))
}

/**
 * Archive or restore a custom exercise (migration 0024).
 *
 * Archiving is NOT what protects logged history: `workout_sets.exercise_id` is
 * `on delete restrict`, so the database already refuses to delete an exercise
 * with any set against it. What this adds is getting a lift you have finished
 * with out of a picker that is scanned one-handed mid-workout.
 *
 * `42703` is Postgres for "column does not exist", which is what comes back
 * until 0024 is applied. It is reported as the missing migration rather than as
 * a failure, the same way the app already handles 0008 and 0015 being absent:
 * the feature is unavailable, nothing is broken, and the message says which.
 */
export async function setExerciseArchived(
  exerciseId: string,
  archived: boolean,
): Promise<string | null> {
  const archivedAt = archived ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('exercises')
    .update({ archived_at: archivedAt })
    .eq('id', exerciseId)
    .select('archived_at')
    .single()

  if (error) {
    if ((error as { code?: string }).code === '42703') {
      throw new Error('Archiving needs migration 0024. Apply it and reload.')
    }
    throw new Error(describeError(archived ? 'Archiving' : 'Restoring', error))
  }
  return (data as { archived_at: string | null }).archived_at
}
