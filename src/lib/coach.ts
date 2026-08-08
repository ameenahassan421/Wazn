import { supabase } from './supabase'
import { formatEstimate, formatWeight } from './units'
import type { Unit } from './units'

/**
 * The proactive coach's client half — B1's two surfaces and B2's review.
 *
 * ── THE SHAPE OF THIS, AND WHY IT IS THIS SHAPE ─────────────────────────────
 * Every surface here draws **twice**. First from SQL, synchronously with the
 * screen it lives on: `session_brief()` and `session_debrief()` are RLS-scoped
 * RPCs the browser is entitled to call, and `skeletonFor()` below turns their
 * output into an honest English line with no model involved. Then, if and when
 * the Edge Function answers, the model's sentence replaces the skeleton.
 *
 * That ordering is the whole design. §12 requires the app to be fully usable
 * with AI dark, and the way to guarantee that is not to handle the error well
 * — it is to never be waiting on the model in the first place. A briefing card
 * that renders from statistics in one round trip and *improves* when a
 * sentence arrives cannot be broken by a provider outage, a spent quota, an
 * open circuit breaker, or an unapplied migration. It can only be plainer.
 *
 * The composition functions are pure and exported so they are tested against
 * fixtures rather than against a network.
 */

/* ── Blocks, as the SQL returns them ──────────────────────────────────────── */

export interface BriefTarget {
  exercise: string
  last_weight_kg: number
  last_reps: number
  last_e1rm: number
  best_e1rm: number
  last_done_days_ago: number
  next_weight_kg: number
  next_e1rm: number
}

export interface BriefBlock {
  unit: 'kg'
  days_since_last: number | null
  sessions_last_7: number
  sessions_last_28: number
  total_sets_90d: number
  due_routine: { name: string; exercises: number; days_since_run: number | null } | null
  target: BriefTarget | null
  low_bands: { muscle: string; sets: number }[]
}

export interface DebriefBlock {
  unit: 'kg'
  found: boolean
  sets: number
  exercises: number
  volume_kg: number
  duration_min: number | null
  records: number
  anchor: {
    exercise: string
    e1rm: number
    top_weight_kg: number
    top_reps: number
    previous_e1rm: number | null
    gain_since_last_e1rm: number | null
    progression_streak: number
    e1rm_28d: number | null
    e1rm_before_28d: number | null
  } | null
  low_band: { muscle: string; sets: number } | null
}

/* ── The phrased line ─────────────────────────────────────────────────────── */

export interface CoachLine {
  line: string | null
  chip?: string
  cached?: boolean
  model?: string
  /** The function declined for a reason the user should not read as a fault. */
  degraded?: boolean
}

/* ── The weekly review ────────────────────────────────────────────────────── */

export const REVIEW_SECTIONS = [
  'adherence',
  'bands',
  'plateaus',
  'wins',
  'recommendation',
] as const

export type ReviewSectionKey = (typeof REVIEW_SECTIONS)[number]

/** The label each section carries on screen. Fixed, like the sections. */
export const REVIEW_SECTION_LABELS: Record<ReviewSectionKey, string> = {
  adherence: 'Turning up',
  bands: 'Volume',
  plateaus: 'Stalled',
  wins: 'Moving',
  recommendation: 'Next week',
}

export interface WeeklyReview {
  headline: string
  sections: Record<ReviewSectionKey, { line: string; chip?: string }>
}

/** The pre-B2 shape. Still in the cache for anyone who has not regenerated. */
export interface CoachInsight {
  title: string
  body: string
  chip?: string
}

export interface CoachNotes {
  review: WeeklyReview | null
  /** Legacy list, present only when the cache predates the review contract. */
  insights: CoachInsight[] | null
  generatedAt?: string
  model?: string
  cached: boolean
  /** The cached answer is from an older contract and quota said no. */
  stale?: boolean
  degraded?: boolean
  regeneratesLeft?: number
}

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
  surface: 'briefing' | 'debrief' | 'weekly_review',
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

/* ── The deterministic skeletons ──────────────────────────────────────────── */

/**
 * The briefing, said without a model.
 *
 * At most two clauses, in the order a lifter cares about them: what is due,
 * what to beat, and — only when it has actually been a while — how long it has
 * been. Returns null when there is genuinely nothing to say, which renders as
 * no card at all rather than as a card apologising for itself.
 */
export function briefSkeleton(block: BriefBlock | null, unit: Unit): string | null {
  if (!block) return null

  const parts: string[] = []

  if (block.due_routine?.name) parts.push(`${block.due_routine.name} is up`)

  // Every field is read as optional even though the SQL always sends it. This
  // function renders on the screen the app opens on, so it has to be TOTAL:
  // there is no input for which throwing is better than saying less.
  const gap = block.low_bands?.[0]
  if (block.target) {
    const t = block.target
    parts.push(
      `${t.exercise} — ${formatWeight(t.last_weight_kg, unit)} ${unit} × ${t.last_reps} last time`,
    )
  } else if (gap) {
    parts.push(
      `${gap.muscle} is at ${gap.sets} ${gap.sets === 1 ? 'set' : 'sets'} this week`,
    )
  }

  // Only past the point where it is worth mentioning. §4-A1 puts that at five
  // days, and below it a "days since" line is the app nagging someone who is
  // on schedule.
  if (typeof block.days_since_last === 'number' && block.days_since_last > 5) {
    parts.push(`${block.days_since_last} days since your last session`)
  }

  if (parts.length === 0) return null
  return `${parts.join(' · ')}.`
}

/** The target chip: what to hit, and what it would be worth. */
export function briefChip(block: BriefBlock | null, unit: Unit): string | undefined {
  if (!block?.target) return undefined
  const t = block.target
  // The target is a load and rounds like one; the e1RM it beats is an
  // estimate and must match the figure the block (and the Progress screen)
  // carries, to the decimal.
  return `${formatWeight(t.next_weight_kg, unit)} ${unit} × ${t.last_reps} beats ${formatEstimate(t.best_e1rm, unit)} e1RM`
}

/**
 * The debrief, said without a model.
 *
 * Deliberately silent about volume, sets and duration: they are on the same
 * screen, in larger type, three centimetres above this line. Repeating them is
 * the coach proving it can read rather than saying anything.
 */
export function debriefSkeleton(block: DebriefBlock | null, unit: Unit): string | null {
  if (!block?.found || !block.anchor) return null
  const a = block.anchor

  if (a.progression_streak >= 2) {
    return `${ordinal(a.progression_streak)} straight ${a.exercise} progression.`
  }
  if (a.gain_since_last_e1rm !== null && a.gain_since_last_e1rm > 0) {
    return `${a.exercise} estimate up ${formatEstimate(a.gain_since_last_e1rm, unit)} ${unit} on last session.`
  }
  if (
    a.e1rm_28d !== null &&
    a.e1rm_before_28d !== null &&
    a.e1rm_28d > a.e1rm_before_28d
  ) {
    const gain = a.e1rm_28d - a.e1rm_before_28d
    return `${a.exercise} estimate up ${formatEstimate(gain, unit)} ${unit} this month.`
  }
  if (block.records > 0) {
    return `${block.records} personal ${block.records === 1 ? 'record' : 'records'} logged.`
  }
  if (block.low_band) {
    return `${block.low_band.muscle} is at ${block.low_band.sets} ${block.low_band.sets === 1 ? 'set' : 'sets'} this week.`
  }
  return null
}

export function debriefChip(
  block: DebriefBlock | null,
  unit: Unit,
): string | undefined {
  if (!block?.anchor) return undefined
  const a = block.anchor
  return `${a.exercise} ${formatWeight(a.top_weight_kg, unit)} ${unit} × ${a.top_reps}`
}

/** 1st, 2nd, 3rd, 4th — English, and only ever used on small counts. */
export function ordinal(n: number): string {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
