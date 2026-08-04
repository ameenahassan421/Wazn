import { supabase } from './supabase'

/**
 * The client half of the AI layer.
 *
 * There is deliberately very little here. No prompt, no model id, no key —
 * those live in the Edge Functions, and the browser's entire part in this is
 * asking and rendering. `functions.invoke` attaches the caller's access token,
 * which is how the function knows who is asking; nothing here sends a user id.
 */

export interface CoachInsight {
  title: string
  body: string
}

export interface CoachNotes {
  insights: CoachInsight[]
  generatedAt: string
  model: string
  cached: boolean
}

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

export async function fetchCoachNotes(
  options: { force?: boolean } = {},
): Promise<CoachNotes> {
  const { data, error } = await supabase.functions.invoke<CoachNotes>(
    `coach-notes${options.force ? '?force=1' : ''}`,
    { method: 'POST' },
  )
  if (error) throw new Error(await describeFunctionError(error))
  if (!data) throw new Error('No notes came back.')
  return data
}

export interface GeneratedRoutines {
  routines: { id: string; name: string }[]
  model: string
  droppedExercises: string[]
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

export async function generateRoutines(request: {
  goal: string
  days: number
  equipment: string[]
}): Promise<GeneratedRoutines> {
  const { data, error } = await supabase.functions.invoke<GeneratedRoutines>(
    'generate-routine',
    { body: request },
  )
  if (error) throw new Error(await describeFunctionError(error))
  if (!data) throw new Error('No routine came back.')
  return data
}
