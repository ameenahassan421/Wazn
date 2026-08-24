import { formatEstimate, formatWeight } from './units'
import type { Unit } from './units'
import { muscleLabel, t } from './i18n'
import type { Locale } from './i18n'

/**
 * What the coach SAYS, with no network in the room.
 *
 * ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
 * It was the back half of `coach.ts` until 2026-08-21, and `coach.ts` imports
 * `./supabase` — which builds a browser client, which is why the whole module
 * could never enter `portable.ts`. So the native app had a coach card in its
 * markup and `brief: null` in its hook, and the only thing standing between
 * them was a file boundary.
 *
 * Splitting it is the rule this repo already runs on: **domain shared, I/O
 * adapted**. The two apps compose the identical sentence from the identical
 * block; they differ only in which client fetched it. `coach.ts` keeps the
 * reads and re-exports everything here, so no web call site moved.
 *
 * ── THE ORDERING THIS FILE EXISTS TO PROTECT ────────────────────────────────
 * Every coach surface draws TWICE. First from SQL, synchronously with the
 * screen: `session_brief()` and `session_debrief()` are RLS-scoped RPCs, and
 * the skeletons below turn their output into an honest line with no model
 * involved. Then, if and when the Edge Function answers, the model's sentence
 * replaces the skeleton.
 *
 * That ordering is the whole design. §12 requires the app to be fully usable
 * with AI dark, and the way to guarantee that is not to handle the error well
 * — it is to never be waiting on the model in the first place. A card that
 * renders from statistics in one round trip and *improves* when a sentence
 * arrives cannot be broken by a provider outage, a spent quota, an open
 * circuit breaker or an unapplied migration. It can only be plainer.
 *
 * Everything here is pure and total. There is no input for which throwing is
 * better than saying less: these lines render on the screen the app opens on.
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

/**
 * The weekly review's RAW block: the figures `weekly_review()` returns.
 *
 * Not the WHOLE block. The RPC also returns `recommendation`, a
 * `{ kind, ... }` union chosen in SQL, which is left off deliberately —
 * the screen draws the recommendation from the model's phrased
 * `sections.recommendation`, so typing the raw one here would add a union
 * with no reader. `REVIEW_BLOCK_KEYS` in
 * `supabase/functions/_shared/review-contract.ts` is the full list.
 *
 * ── WHY THE CLIENT WANTS THIS AS WELL AS THE SENTENCES ──────────────────────
 * The `coach-notes` Edge Function hands back `{ line, chip }` per section: a
 * phrased sentence and one string. That is everything a paragraph needs and
 * nothing a CHART needs, so a screen built on it alone can only ever be a
 * column of prose — which is what the Coach tab was, four identical grey boxes
 * where the only difference between "you did nothing" and "you gained 24 kg on
 * a press" was the words inside them.
 *
 * The numbers were never missing. `weekly_review()` is the same RLS-scoped RPC
 * the Edge Function itself calls, the client is entitled to it, and it returns
 * the sets per muscle, the productive range, the plateau slopes and the gains
 * as figures. So the tab reads BOTH: figures from SQL, sentence from the
 * model. That is the two-stage draw this file already documents, applied one
 * level further out, and it means every number on that screen is computed with
 * the model only ever phrasing.
 *
 * ── EVERYTHING HERE IS KILOGRAMS ────────────────────────────────────────────
 * `unit` is the literal `'kg'`, like every other block. The screen converts.
 */
export interface ReviewBlock {
  unit: 'kg'
  window_days: number
  /** The band a muscle's weekly sets should land in. `[10, 20]` today. */
  productive_range: [number, number]
  plateau_min_sessions: number
  adherence: {
    sessions_this_week: number
    sessions_prev_week: number
    avg_sessions_per_week_8w: number
    weeks_trained_of_8: number
    sessions_last_28: number
    from_routine_last_28: number
    longest_gap_days_28: number
  }
  bands: {
    muscle: string
    sets: number
    sets_prev: number
    status: 'under' | 'in' | 'over'
  }[]
  plateaus: {
    exercise: string
    sessions: number
    slope_per_session: number
    first_e1rm: number
    last_e1rm: number
  }[]
  wins: { exercise: string; e1rm_28d: number; e1rm_before: number; gain: number }[]
  records_last_7: number
  total_sets_90d: number
}

/**
 * What the review's volume chart draws, and what it drops.
 *
 * `weekly_review()` returns up to twelve muscles sorted by weekly sets
 * ASCENDING. A chart cannot legibly stack twelve bars on a phone, and the
 * lowest are the ones the section exists to surface ("am I neglecting legs"),
 * so it draws the first `limit` of them.
 *
 * ── WHY THE CEILING IS COMPUTED HERE AND NOT INLINE ─────────────────────────
 * The first version of this took `max(...)` over ALL the bands. Because the
 * rows arrive ascending, that max is always one of the rows the slice throws
 * away — so a lifter doing 28 sets of quads (dropped) and six lighter muscles
 * (drawn) had every visible bar scaled against a bar that was not on screen,
 * and the productive-range wash squashed along with them. The bug is invisible
 * in any account whose twelve muscles are close together, which is most of
 * them, and it gets worse exactly when the chart matters most.
 *
 * The floor of `high * 1.25` is separate and deliberate: it stops a week where
 * every muscle is under-trained from stretching two sets across the full track
 * and reading as a full bar.
 */
export function reviewBandScale(
  bands: ReviewBlock['bands'],
  range: [number, number],
  limit: number,
): { shown: ReviewBlock['bands']; hidden: number; ceiling: number } {
  const shown = bands.slice(0, limit)
  return {
    shown,
    hidden: bands.length - shown.length,
    // `range[1] * 1.25` is always present, so `Math.max` cannot see an empty
    // argument list and answer -Infinity on a week with no bands at all.
    ceiling: Math.max(range[1] * 1.25, ...shown.map((b) => b.sets)),
  }
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
  /**
   * Generation failed and the LAST review was served instead.
   *
   * Deliberately not `stale`, which means "older contract" and is rendered as
   * " · in the previous format". During a model outage the format is fine and
   * the model is not, so the two need different words.
   */
  refreshFailed?: boolean
  /**
   * The served review was written in an EARLIER week than the one its figures
   * describe. Distinct from `stale` (older contract) and `refreshFailed`
   * (generation died), because the sentence a reader needs is different in each
   * case, and `coach-notes/index.ts` says why at the flag's other end.
   */
  previousWeek?: boolean
  degraded?: boolean
  regeneratesLeft?: number
}

/**
 * Below this many regenerates left, the count is worth putting on screen.
 *
 * The quota limits stopped being product rules on 2026-08-14 and became loop
 * backstops set at 500 (`supabase/functions/_shared/quota.ts`). A footer
 * reading "500 regenerates left this week" is not information, it is
 * furniture — and it invites the reader to manage a budget that no longer
 * exists. Under this it is a real warning again, so it comes back.
 *
 * Deliberately declared here and not beside the limits it relates to. Nothing
 * on the server renders anything, so there is no second copy to disagree with,
 * and `src/edge-shims.d.ts` marks `supabase/functions/**` as Deno code that
 * client modules do not import.
 */
export const QUOTA_VISIBLE_AT = 3

/* ── The deterministic skeletons ──────────────────────────────────────────── */

/**
 * The briefing, said without a model.
 *
 * Up to THREE clauses, in the order a lifter cares about them: what is due,
 * what to beat, and — only when it has actually been a while — how long it has
 * been. Returns null when there is genuinely nothing to say, which renders as
 * no card at all rather than as a card apologising for itself.
 *
 * This said "at most two" from the day it was written and all three fire
 * together on any account with a routine, a target and a gap: seen on a
 * simulator 2026-08-21 as "Push day is up · Bench Press: 60 kg × 8 last time ·
 * 7 days since your last session." Which is also the honest shape of this
 * function — a joined LIST, where the prototype's coach card speaks prose.
 * Closing that gap is the phrased sentence's job, not this one's. The
 * skeleton's contract is to be true and instant, never to be good writing.
 */
export function briefSkeleton(
  block: BriefBlock | null,
  unit: Unit,
  locale: Locale = 'en',
): string | null {
  if (!block) return null

  const parts: string[] = []

  if (block.due_routine?.name) {
    parts.push(t(locale, 'coach.line.up', { name: block.due_routine.name }))
  }

  // Every field is read as optional even though the SQL always sends it. This
  // function renders on the screen the app opens on, so it has to be TOTAL:
  // there is no input for which throwing is better than saying less.
  const gap = block.low_bands?.[0]
  if (block.target) {
    const target = block.target
    parts.push(
      t(locale, 'coach.line.target', {
        exercise: target.exercise,
        weight: formatWeight(target.last_weight_kg, unit),
        unit,
        reps: String(target.last_reps),
      }),
    )
  } else if (gap) {
    parts.push(
      t(locale, gap.sets === 1 ? 'coach.line.low_band_one' : 'coach.line.low_band', {
        muscle: muscleLabel(locale, gap.muscle),
        n: String(gap.sets),
      }),
    )
  }

  // Only past the point where it is worth mentioning. §4-A1 puts that at five
  // days, and below it a "days since" line is the app nagging someone who is
  // on schedule.
  if (typeof block.days_since_last === 'number' && block.days_since_last > 5) {
    parts.push(t(locale, 'coach.line.days_since', { n: String(block.days_since_last) }))
  }

  if (parts.length === 0) return null
  return `${parts.join(' · ')}.`
}

/** The target chip: what to hit, and what it would be worth. */
export function briefChip(
  block: BriefBlock | null,
  unit: Unit,
  locale: Locale = 'en',
): string | undefined {
  if (!block?.target) return undefined
  const target = block.target
  // The target is a load and rounds like one; the e1RM it beats is an
  // estimate and must match the figure the block (and the Progress screen)
  // carries, to the decimal.
  return t(locale, 'coach.line.chip', {
    weight: formatWeight(target.next_weight_kg, unit),
    unit,
    reps: String(target.last_reps),
    e1rm: formatEstimate(target.best_e1rm, unit),
  })
}

/**
 * The debrief, said without a model.
 *
 * Deliberately silent about volume, sets and duration: they are on the same
 * screen, in larger type, three centimetres above this line. Repeating them is
 * the coach proving it can read rather than saying anything.
 */
export function debriefSkeleton(
  block: DebriefBlock | null,
  unit: Unit,
  locale: Locale = 'en',
): string | null {
  if (!block?.found || !block.anchor) return null
  const a = block.anchor

  if (a.progression_streak >= 2) {
    // Both an ordinal and a count go in: English wants "3rd straight", and
    // Arabic ordinals are words with their own agreement, so the AR string
    // counts the sessions instead. Each locale spends the parameter it needs.
    return t(locale, 'coach.line.streak', {
      ordinal: ordinal(a.progression_streak),
      n: String(a.progression_streak),
      exercise: a.exercise,
    })
  }
  if (a.gain_since_last_e1rm !== null && a.gain_since_last_e1rm > 0) {
    return t(locale, 'coach.line.gain_last', {
      exercise: a.exercise,
      gain: formatEstimate(a.gain_since_last_e1rm, unit),
      unit,
    })
  }
  if (
    a.e1rm_28d !== null &&
    a.e1rm_before_28d !== null &&
    a.e1rm_28d > a.e1rm_before_28d
  ) {
    const gain = a.e1rm_28d - a.e1rm_before_28d
    return t(locale, 'coach.line.gain_month', {
      exercise: a.exercise,
      gain: formatEstimate(gain, unit),
      unit,
    })
  }
  if (block.records > 0) {
    return t(
      locale,
      block.records === 1 ? 'coach.line.records_one' : 'coach.line.records',
      { n: String(block.records) },
    )
  }
  if (block.low_band) {
    const band = block.low_band
    return `${t(
      locale,
      band.sets === 1 ? 'coach.line.low_band_one' : 'coach.line.low_band',
      { muscle: muscleLabel(locale, band.muscle), n: String(band.sets) },
    )}.`
  }
  return null
}

export function debriefChip(
  block: DebriefBlock | null,
  unit: Unit,
  locale: Locale = 'en',
): string | undefined {
  if (!block?.anchor) return undefined
  const a = block.anchor
  return t(locale, 'coach.line.debrief_chip', {
    exercise: a.exercise,
    weight: formatWeight(a.top_weight_kg, unit),
    unit,
    reps: String(a.top_reps),
  })
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
