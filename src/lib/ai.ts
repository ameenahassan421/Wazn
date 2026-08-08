import { supabase } from './supabase'

/**
 * The client half of the AI layer.
 *
 * There is deliberately very little here. No prompt, no model id, no key —
 * those live in the Edge Functions, and the browser's entire part in this is
 * asking and rendering. `functions.invoke` attaches the caller's access token,
 * which is how the function knows who is asking; nothing here sends a user id.
 */

/**
 * The Coach's Notes half of this file moved to `coach.ts` at B2, along with
 * the surfaces it feeds. What is left here is the routine builder, which is
 * the Coach tab's other tool and shares nothing with the review but a screen.
 */

/** Shown on every AI surface. Plan §2C, and not negotiable per feature. */
export const AI_DISCLAIMER = 'AI-generated — not medical advice.'

/**
 * The functions client reports a non-2xx as a generic FunctionsHttpError and
 * puts the useful part in the response body. Quotas and a missing key both
 * arrive that way, and both have something worth saying to the user, so the
 * body is read rather than the status guessed at.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/** A generated plan that has NOT been written yet. v2.1: preview, then Save. */
export interface RoutinePreview {
  preview: {
    name: string
    exercises: { id: string; name: string; sets: number; reps: number }[]
  }[]
  model: string
  droppedExercises: string[]
  generationsLeft?: number
}

export interface SavedRoutines {
  routines: { id: string; name: string }[]
  saved: true
}

export const ROUTINE_GOALS = [
  { id: 'strength', label: 'Strength' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'general fitness', label: 'General' },
  { id: 'endurance', label: 'Endurance' },
] as const

export const ROUTINE_EQUIPMENT = [
  { id: 'barbell', label: 'Barbell' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'machine', label: 'Machine' },
  { id: 'cable', label: 'Cable' },
  { id: 'bodyweight', label: 'Bodyweight' },
] as const

/**
 * Ask for a plan. Nothing is written — the caller shows it and decides.
 *
 * This is where the quota is spent, not on save: the model call is the cost,
 * and charging on save would make "Adjust" the expensive choice, which is
 * exactly backwards for a preview whose whole point is that you can reject it.
 */
export async function generateRoutines(request: {
  goal: string
  days: number
  equipment: string[]
}): Promise<RoutinePreview> {
  const { data, error } = await supabase.functions.invoke<RoutinePreview>(
    'generate-routine',
    { body: request },
  )
  if (error) throw new Error(await describeFunctionError(error))
  if (!data?.preview) throw new Error('No routine came back.')
  return data
}

/** Keep a previewed plan. No model call, no quota. */
export async function saveGeneratedRoutines(
  plan: RoutinePreview['preview'],
): Promise<SavedRoutines> {
  const { data, error } = await supabase.functions.invoke<SavedRoutines>(
    'generate-routine',
    {
      body: {
        save: plan.map((day) => ({
          name: day.name,
          exercises: day.exercises.map((e) => ({
            id: e.id,
            sets: e.sets,
            reps: e.reps,
          })),
        })),
      },
    },
  )
  if (error) throw new Error(await describeFunctionError(error))
  if (!data) throw new Error('Nothing came back from saving.')
  return data
}
