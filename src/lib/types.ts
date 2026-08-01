export type SetType = 'normal' | 'warmup' | 'failure'

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'cardio'

export interface Exercise {
  id: string
  name: string
  muscle_group: MuscleGroup
  equipment: string
  is_custom: boolean
  owner_id: string | null
  /** Null when no confident free-exercise-db match; renders an initial tile. */
  image_url: string | null
}

export interface Workout {
  id: string
  user_id: string
  name: string | null
  started_at: string
  ended_at: string | null
}

export interface WorkoutSet {
  id: string
  workout_id: string
  exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  rpe: number | null
  duration_seconds: number | null
  distance_meters: number | null
  set_type: SetType
}

export interface PreviousSessionRow {
  workout_id: string
  started_at: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  set_type: SetType
}

export interface OneRepMaxPoint {
  workout_id: string
  started_at: string
  best_1rm_kg: number
}

export interface ExerciseUsageRow {
  exercise_id: string
  set_count: number
  last_used: string | null
}
