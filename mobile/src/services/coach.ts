import type { BriefBlock, CoachLine, DebriefBlock, Unit } from '@wazn/domain'

import { supabase } from './supabase'

/**
 * The coach's reads, native side.
 *
 * The mirror of `src/lib/coach.ts` and deliberately a separate file rather
 * than a shared one: the sentences are shared (`coach-lines.ts`, reached
 * through `@wazn/domain`), the client that fetches them is not. Same schema,
 * same RLS, same two RPCs — a different session store underneath.
 *
 * Nothing here throws and nothing here reports. Every function answers null on
 * failure, including the failure where the RPC does not exist in this project
 * yet, because the surfaces these feed sit on the screen the app opens on and
 * on the screen a lifter reaches at the end of a workout. Neither may show an
 * error, and neither may stand between a lifter and the next tap.
 */

/**
 * Is this actually a block, or merely truthy?
 *
 * Carried over verbatim from the web, along with its scar. An RPC that does
 * not exist returns `[]` through PostgREST in some shapes, `[]` is truthy, and
 * `block.low_bands.length` on an array threw — which took down the Log screen
 * behind an error boundary and left no Start button on it. The door nobody
 * checks is the SHAPE of the answer, not the presence of an error.
 */
function isBlock(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export async function fetchBriefBlock(): Promise<BriefBlock | null> {
  try {
    const { data, error } = await supabase.rpc('session_brief')
    if (error || !isBlock(data)) return null
    return data as unknown as BriefBlock
  } catch {
    return null
  }
}

export async function fetchDebriefBlock(
  workoutId: string,
): Promise<DebriefBlock | null> {
  try {
    const { data, error } = await supabase.rpc('session_debrief', {
      p_workout: workoutId,
    })
    if (error || !isBlock(data)) return null
    return data as unknown as DebriefBlock
  } catch {
    return null
  }
}

/**
 * The phrased line, from the `coach-brief` Edge Function.
 *
 * The display unit travels with the request because the MODEL writes the
 * sentence, so it has to be handed the unit the reader is looking at. Without
 * it the card reads "102.5 kg" under a header toggled to lbs, which is what
 * the web's first screenshot of this card showed.
 *
 * A null `line` is the normal case, not an error case: no key configured, a
 * spent quota, an open breaker, an offline phone. The caller already has a
 * skeleton drawn and simply keeps it.
 */
export async function fetchCoachLine(
  surface: 'briefing' | 'debrief',
  unit: Unit,
  workoutId?: string,
): Promise<CoachLine> {
  try {
    const { data, error } = await supabase.functions.invoke<CoachLine>('coach-brief', {
      body: { surface, unit, ...(workoutId ? { workoutId } : {}) },
    })
    if (error) return { line: null, degraded: true }
    return data ?? { line: null, degraded: true }
  } catch {
    return { line: null, degraded: true }
  }
}
