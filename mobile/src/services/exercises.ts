import { supabase } from './supabase'

export interface Exercise {
  id: string
  name: string
  muscle_group: string
  equipment: string
}

/**
 * The catalogue.
 *
 * Ordered by name rather than by usage for now. `exercise_usage` is the RPC
 * the web picker sorts by — "what you actually train" beats alphabetical every
 * time — and wiring it here is a follow-up, not a rewrite: same RPC, same
 * shape. Flagged rather than silently shipped as if alphabetical were the
 * design.
 */
export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, equipment')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Exercise[]
}
