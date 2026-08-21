import { supabase } from './supabase'
import type { Unit } from './units'
import type { BriefBlock, CoachLine, CoachNotes, DebriefBlock } from './coach-lines'

/**
 * The proactive coach's client half — B1's two surfaces and B2's review.
 *
 * ── WHAT IS LEFT HERE, AND WHAT MOVED ───────────────────────────────────────
 * Reads only. Everything that composes a sentence lives in `./coach-lines`,
 * which is pure and therefore portable — the native app runs the same
 * skeletons through `@wazn/domain`, and until 2026-08-21 it could not, because
 * this file imports `./supabase` and that import poisoned the whole module for
 * the barrel.
 *
 * The split is re-exported below, so every existing call site still imports
 * `briefSkeleton` and friends from `./coach` and nothing moved for the web.
 * Read `./coach-lines` for the two-stage draw this file's reads feed.
 *
 * Nothing here throws. A briefing that cannot be computed is a briefing that
 * is not shown — never an error on the screen the app opens on, and never
 * something standing between a lifter and the Start button.
 */

export * from './coach-lines'

/* ── Reads ────────────────────────────────────────────────────────────────── */

/**
 * The functions client reports a non-2xx as a generic FunctionsHttpError and
 * puts the useful part in the response body — same as `ai.ts`.
 */
async function readErrorBody(
  error: unknown,
): Promise<{ error?: string; degraded?: boolean }> {
  const context = (error as { context?: Response })?.context
  if (context && typeof context.json === 'function') {
    try {
      return (await context.json()) as { error?: string; degraded?: boolean }
    } catch {
      /* fall through */
    }
  }
  return {}
}

/**
 * Is this actually a block, or merely truthy?
 *
 * Both RPCs return a single `jsonb` object. Anything else — an array, a
 * string, a number — means the call did not reach the function it was aimed
 * at, and the honest response is "no briefing" rather than an attempt to read
 * fields off it.
 *
 * **This is not defensive-programming garnish; the smoke suite caught it.**
 * An RPC that does not exist yet returns `[]` through some stubs and through
 * PostgREST in some shapes, `[]` is truthy, and `block.low_bands.length` on an
 * array threw — which took down the Log screen behind the error boundary and
 * left no Start button on the screen the app opens on. Exactly the failure the
 * whole two-stage draw exists to make impossible, arriving through the one
 * door nobody had checked: the shape of the answer, rather than the presence
 * of an error.
 */
function isBlock(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The deterministic block, straight from SQL.
 *
 * Returns null rather than throwing on ANY failure, including the function not
 * existing yet. A briefing that cannot be computed is a briefing that is not
 * shown — never an error on the screen the app opens on, and never something
 * standing between a lifter and the Start button.
 */
export async function fetchBriefBlock(): Promise<BriefBlock | null> {
  const { data, error } = await supabase.rpc('session_brief')
  if (error || !isBlock(data)) return null
  return data as unknown as BriefBlock
}

export async function fetchDebriefBlock(
  workoutId: string,
): Promise<DebriefBlock | null> {
  const { data, error } = await supabase.rpc('session_debrief', {
    p_workout: workoutId,
  })
  if (error || !isBlock(data)) return null
  return data as unknown as DebriefBlock
}

/** The phrased line. Never throws: the caller already has something to draw. */
export async function fetchCoachLine(
  surface: 'briefing' | 'debrief',
  unit: Unit,
  workoutId?: string,
): Promise<CoachLine> {
  try {
    const { data, error } = await supabase.functions.invoke<CoachLine>('coach-brief', {
      // The display unit travels with the request. The model writes the
      // sentence, so it has to be handed the unit the reader is looking at —
      // otherwise the card reads "102.5 kg" under a header toggled to lbs,
      // which is what the first screenshot of this card showed.
      body: { surface, unit, ...(workoutId ? { workoutId } : {}) },
    })
    if (error) {
      const body = await readErrorBody(error)
      return { line: null, degraded: body.degraded ?? true }
    }
    return data ?? { line: null, degraded: true }
  } catch {
    return { line: null, degraded: true }
  }
}

export async function fetchWeeklyReview(
  unit: Unit,
  options: { force?: boolean } = {},
): Promise<CoachNotes> {
  const query = new URLSearchParams({ unit })
  if (options.force) query.set('force', '1')
  const { data, error } = await supabase.functions.invoke<CoachNotes>(
    `coach-notes?${query}`,
    { method: 'POST' },
  )
  if (error) {
    const body = await readErrorBody(error)
    throw new Error(
      body.error ?? (error instanceof Error ? error.message : 'Something went wrong.'),
    )
  }
  if (!data) throw new Error('No review came back.')
  return data
}

/** Fire-and-forget. GATE B1's instrument; never blocks or surfaces anything. */
export async function recordCoachView(
  // `rest_canvas` needs migration 0022; until that is applied the check
  // constraint refuses the row and the catch below eats it, which is the
  // correct outcome — an unapplied migration must never be visible on a
  // surface somebody is resting under.
  surface: 'briefing' | 'debrief' | 'weekly_review' | 'rest_canvas',
  action: 'view' | 'dismiss' = 'view',
): Promise<void> {
  try {
    // `user_id` is filled by the column default (migration 0021), which is the
    // lesson of 0016: the client forgetting to send an owner column is how
    // following and liking shipped broken and stayed broken.
    await supabase.from('coach_views').insert({ surface, action })
  } catch {
    /* telemetry must never be visible */
  }
}
