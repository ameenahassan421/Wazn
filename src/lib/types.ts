export type SetType = 'normal' | 'warmup' | 'failure' | 'drop'

/** Tap order for the set-type control. Normal first: it is the common case. */
export const SET_TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'failure', 'drop']

/** Single letter shown in the logging flow. Full words do not fit at 48px. */
export const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: '',
  warmup: 'W',
  failure: 'F',
  drop: 'D',
}

export const SET_TYPE_NAME: Record<SetType, string> = {
  normal: 'Normal set',
  warmup: 'Warm-up set',
  failure: 'Set to failure',
  drop: 'Drop set',
}

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
  /** Per-lift rest default in seconds; null falls back to the app default. */
  default_rest_seconds: number | null
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
  /** Sets sharing a group within one workout were performed alternating. */
  superset_group: number | null
}

export interface Routine {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  position: number
  superset_group: number | null
  notes: string | null
}

export interface RoutineSet {
  id: string
  routine_exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  set_type: SetType
}

export interface WeeklyStreakRow {
  weeks: number
  current_week_sessions: number
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
