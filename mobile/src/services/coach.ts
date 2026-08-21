import type {
  BriefBlock,
  CoachLine,
  CoachNotes,
  DebriefBlock,
  Unit,
} from '@wazn/domain'

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
 * The useful half of a non-2xx from an Edge Function, or an honest fallback.
 *
 * The functions client reports every non-2xx as a generic `FunctionsHttpError`
 * and puts the part worth reading — a quota message, a breaker notice — in the
 * response BODY. Reading it is the difference between "Something went wrong."
 * and a sentence that says what to do next.
 *
 * ── THE PARSE FAILURE IS NOT THE ANSWER, AND THIS SHIPPED SAYING IT WAS ─────
 * The first version of this re-threw whatever `context.json()` threw. On
 * 2026-08-21 the `coach-notes` call died with an EMPTY body, `json()` threw a
 * SyntaxError, and the Coach tab rendered **"JSON Parse error: Unexpected end
 * of input"** to a lifter, in place of the review, with a Try again button
 * under it. Screenshotted.
 *
 * That is the `|| echo "no"` scar for the third time in one day: a diagnostic
 * whose own failure gets reported as the finding. A body that cannot be parsed
 * is a body that said NOTHING, which is exactly the case the fallback is for.
 * So the parse is swallowed, and the caller gets a sentence written for a
 * person.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error !== '') return body.error
    } catch {
      // Empty or non-JSON body. Nothing to report; fall through to the
      // fallback rather than reporting the parser.
    }
  }
  // A timeout from `withDeadline` is already a sentence for a person.
  if (error instanceof TimeoutError) return error.message
  return 'The review could not be loaded. Try again.'
}

/**
 * How long a MODEL call may take before the app stops waiting on it.
 *
 * ── WHY THIS EXISTS, WITH A TIMESTAMP ───────────────────────────────────────
 * 2026-08-21, on a simulator, against a real account: Regenerate was pressed
 * on the Coach tab at 19:27:32. The function booted (26ms), called
 * `weekly_review` (200), checked the quota, read the exercise catalogue — and
 * then stopped logging, because the next thing it does is ask a model, and
 * that does not travel through Supabase's edge logs. Two minutes later the
 * card still read "Reading your log…". There was no timeout, no cancel and no
 * way out but leaving the tab.
 *
 * `supabase.functions.invoke` imposes no deadline of its own, so a request
 * that never answers is a promise that never settles and a spinner that never
 * stops. Every OTHER read in this file already degrades — they answer null and
 * the surface simply does not appear. The two model-backed calls could not,
 * because they have nothing to answer null WITH until they answer.
 *
 * ── WHY A RACE RATHER THAN AN ABORT ─────────────────────────────────────────
 * Aborting would be tidier and is version-dependent on the functions client.
 * Racing is version-proof and has a property that matters more here: the
 * request keeps running server-side, so a generation that was merely slow
 * still lands in the function's cache. The lifter gets an honest failure and a
 * Retry, and the Retry is then usually instant rather than another model call.
 *
 * 45 seconds. Long enough for a five-section generation on a cold model, short
 * enough that nobody stares at a card wondering whether the app is broken.
 */
const MODEL_TIMEOUT_MS = 45_000

class TimeoutError extends Error {}

function withDeadline<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(`${label} took too long. Try again.`)),
      MODEL_TIMEOUT_MS,
    )
  })
  return Promise.race([work, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  }) as Promise<T>
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
    const { data, error } = await withDeadline(
      supabase.functions.invoke<CoachLine>('coach-brief', {
        body: { surface, unit, ...(workoutId ? { workoutId } : {}) },
      }),
      'The coach',
    )
    if (error) return { line: null, degraded: true }
    return data ?? { line: null, degraded: true }
  } catch {
    return { line: null, degraded: true }
  }
}

/**
 * The weekly review, from the `coach-notes` Edge Function.
 *
 * ── THE ONE READ HERE THAT THROWS, AND THAT IS DELIBERATE ───────────────────
 * Every other function in this file answers null on failure, because every
 * other surface it feeds is a card that must simply not appear. This one feeds
 * a SCREEN, and a screen that renders nothing is indistinguishable from a
 * screen that is still loading. So the Coach tab gets three honest states —
 * loading, ready, failed with a message and a retry — and that needs the
 * failure to arrive as a failure. Same contract as the web's `coach.ts`.
 *
 * `force` is the Regenerate press. Without it the function serves whatever it
 * cached for this unit, which is the normal path and costs no model call.
 */
export async function fetchWeeklyReview(
  unit: Unit,
  options: { force?: boolean } = {},
): Promise<CoachNotes> {
  const query = new URLSearchParams({ unit })
  if (options.force) query.set('force', '1')
  const { data, error } = await withDeadline(
    supabase.functions.invoke<CoachNotes>(`coach-notes?${query}`, { method: 'POST' }),
    'The review',
  )
  if (error) throw new Error(await describeFunctionError(error))
  if (!data) throw new Error('No review came back.')
  return data
}
