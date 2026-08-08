import type { WorkoutBlock } from './plan'
import type { WorkoutSet } from './types'
import { formatCount, formatVolume } from './format'
import { formatWeight } from './units'
import type { Unit } from './units'

/**
 * The rest canvas — E1, offense plan §8-E1.
 *
 * ── WHAT THIS MODULE IS ─────────────────────────────────────────────────────
 * Between sets a lifter has 60–180 seconds and nothing to do, which across a
 * session is 20 to 60 minutes of attention that every tracker in the category
 * spends on a countdown and a blank screen. This file is the deterministic
 * layer that decides what to say into that gap. It picks exactly one fact, or
 * none — and none is the better default, because §8-E1's own rule is that
 * "if the deterministic layer has nothing worth saying, the canvas shows the
 * plain timer exactly as today."
 *
 * ── NO MODEL, AND THAT IS A DEVIATION ───────────────────────────────────────
 * §8-E1 reads "deterministic layer picks the fact; the model phrases it". This
 * implementation stops at the first half, deliberately. A rest happens 15–30
 * times a session, so "the model phrases it" is 15–30 Edge Function calls per
 * workout against a free tier sized for a weekly regeneration — that is not
 * the "marginal cost close to zero" the same paragraph claims. Worse, it would
 * put the model on the critical path of the one flow §2.1 calls sacred, and a
 * sentence that lands three seconds into a rest and swaps under the reader's
 * eye is precisely the moving interface E2 forbids. The lines below are
 * composed the way `briefSkeleton` composes the briefing, which has shipped as
 * readable English since B1. Logged in DECISIONS.md.
 *
 * ── PURE, SO IT IS TESTED RATHER THAN EYEBALLED ─────────────────────────────
 * Everything here is a function of what the board already holds. No fetch, no
 * clock, no storage: the one impure pair at the bottom is the permanent
 * dismissal, and it is separated for exactly that reason.
 */

/** Which of §8-E1's three families a card came from. */
export type RestCardKind = 'target' | 'record' | 'crew' | 'session'

export interface RestCard {
  kind: RestCardKind
  /**
   * The stamped label. Mono, uppercased and tracked out by `.kicker`.
   *
   * Kept SHORT on purpose. The first screenshot of this card put the exercise
   * name in here and it truncated mid-word — "OVERHEAD PRESS (BARBEL…" — which
   * fails the one requirement the surface exists for. A kicker at 0.14em
   * tracking holds about twenty characters on a 390px phone, so anything
   * variable-length belongs in `subject` below.
   */
  kicker: string
  /** What the card is about, when that is a name rather than a label. */
  subject?: string
  /**
   * The glanceable payload, and the reason the canvas is legible at three
   * feet: number-led, short, and rendered at 26px tabular.
   */
  value: string
  /** The "why", as a data chip. Omitted rather than padded — silence is fine. */
  note?: string
}

/** A followed lifter's day, collapsed to what a chip can hold. */
export interface CrewToday {
  /** Followed lifters who finished a session today. Excludes the user. */
  lifters: number
  best: { name: string; volumeKg: number; records: number } | null
}

/**
 * The board, as this module needs it.
 *
 * Structurally satisfied by `OverviewBlock`, so the Log screen passes what it
 * already computed for the board rather than building a second shape.
 */
export interface RestBlock extends WorkoutBlock {
  exercise: { name: string } | undefined
}

export interface RestCanvasInput {
  unit: Unit
  /**
   * The exercise this rest belongs to — the one whose next set is coming.
   *
   * In a superset that is the PARTNER, not the lift just finished, because a
   * round alternates and the next thing under the bar is the other movement.
   * The Log screen reads it off `commitOutcome`, which already decides this.
   */
  restingExerciseId: string | null
  blocks: RestBlock[]
  /** Every set logged in this workout, committed or still queued. */
  sets: WorkoutSet[]
  crew?: CrewToday | null
}

/* ── The four cards ───────────────────────────────────────────────────────── */

/**
 * What is coming, and why the number moved.
 *
 * The strongest of the four and the one that fires on most rests: it answers
 * the only question a lifter actually has ninety seconds before a working set.
 * The values are the ghost row's own — the same numbers one tap on the board
 * would commit — so the canvas can never disagree with the board it sits over.
 */
function targetCard(input: RestCanvasInput): RestCard | null {
  const block = input.blocks.find((b) => b.exerciseId === input.restingExerciseId)
  const name = block?.exercise?.name
  if (!block || !name) return null

  const row = block.rows.find((r) => r.kind === 'ghost')
  // No ghost means the block is finished, not that there is nothing to say —
  // the caller falls through to a card about the session instead.
  if (!row) return null
  // A row with neither a weight nor a rep target is the app admitting it does
  // not know, which `buildBlock` is right to do and this is wrong to dress up.
  if (row.weightKg === null && row.reps === null) return null

  const weight =
    row.weightKg === null
      ? null
      : `${formatWeight(row.weightKg, input.unit)} ${input.unit}`
  const value =
    weight === null
      ? `${row.reps} reps`
      : row.reps === null
        ? weight
        : `${weight} × ${row.reps}`

  return {
    kind: 'target',
    kicker: `Next up · set ${row.label}`,
    subject: name,
    value,
    note: whyItMoved(row.weightKg, row.reps, row.previous, input.unit),
  }
}

/**
 * The chip under the target: what changed against the same set last session.
 *
 * Deliberately silent when the comparison is unflattering in a way that is not
 * actionable — a rep short of last time is a fact the row itself already shows
 * against its ghost, and a canvas somebody is resting under is not the place to
 * press it. Down on weight IS said, because loading a lighter bar than last
 * week is the one case where a lifter wants to know before the set, not after.
 */
function whyItMoved(
  weightKg: number | null,
  reps: number | null,
  previous: { weightKg: number | null; reps: number | null } | null,
  unit: Unit,
): string | undefined {
  if (!previous) return undefined

  if (weightKg !== null && previous.weightKg !== null) {
    const delta = Number((weightKg - previous.weightKg).toFixed(4))
    if (delta > 0) return `+${formatWeight(delta, unit)} ${unit} on last session`
    // U+2212, the same minus the timer's adjust control uses. A hyphen at 11px
    // mono sits too high and too short to read as a sign.
    if (delta < 0) {
      return `−${formatWeight(Math.abs(delta), unit)} ${unit} on last session`
    }
    if (reps !== null && previous.reps !== null && reps > previous.reps) {
      return `+${reps - previous.reps} ${reps - previous.reps === 1 ? 'rep' : 'reps'} on last session`
    }
    return 'Same as last session'
  }

  if (previous.weightKg !== null) {
    return `${formatWeight(previous.weightKg, unit)} ${unit} last session`
  }
  return undefined
}

/**
 * A record, while the session is still running.
 *
 * §2.1 forbids a celebration screen mid-set and this is not one: the flash and
 * the badge already happened on the row at commit, and this is the same fact
 * sitting quietly in a gap the user is spending anyway. Records only exist here
 * once the server has answered — an optimistic row cannot know it beat anything
 * — so this card is naturally absent offline rather than wrong.
 *
 * It names the SET that did it rather than counting records, because a count is
 * a scoreboard and the set is the thing worth reading: the load and the reps
 * are what the next attempt has to beat.
 */
function recordCard(input: RestCanvasInput): RestCard | null {
  const records = input.sets.filter((s) => s.pr_weight || s.pr_e1rm)
  if (records.length === 0) return null

  const latest = records[records.length - 1]
  if (latest.weight_kg === null || latest.reps === null) return null
  const name = input.blocks.find((b) => b.exerciseId === latest.exercise_id)?.exercise
    ?.name

  return {
    kind: 'record',
    kicker: 'Record',
    subject: name,
    value: `${formatWeight(latest.weight_kg, input.unit)} ${input.unit} × ${latest.reps}`,
    note:
      records.length > 1 ? `${formatCount(records.length)} this session` : undefined,
  }
}

/** Who else trained today. Absent with no crew, no signal, and no news. */
function crewCard(input: RestCanvasInput): RestCard | null {
  const crew = input.crew
  if (!crew || crew.lifters <= 0) return null
  return {
    kind: 'crew',
    kicker: 'Your crew',
    value: `${formatCount(crew.lifters)} trained today`,
    note: crew.best
      ? `${crew.best.name} · ${formatVolume(crew.best.volumeKg, input.unit)} ${input.unit}`
      : undefined,
  }
}

/**
 * Where the session stands. The always-available floor, and the only card that
 * can speak when the board is between blocks with nothing else to report.
 */
function sessionCard(input: RestCanvasInput): RestCard | null {
  const volumeKg = input.sets.reduce(
    (sum, s) =>
      s.weight_kg === null || s.reps === null ? sum : sum + s.weight_kg * s.reps,
    0,
  )
  if (volumeKg <= 0) return null

  const done = input.blocks.reduce((n, b) => n + b.committed, 0)
  const planned = input.blocks.reduce((n, b) => n + b.planned, 0)

  return {
    kind: 'session',
    kicker: 'Volume so far',
    value: `${formatVolume(volumeKg, input.unit)} ${input.unit}`,
    note:
      planned > 0
        ? `${formatCount(done)} of ${formatCount(planned)} sets`
        : `${formatCount(done)} ${done === 1 ? 'set' : 'sets'}`,
  }
}

/**
 * The one fact the canvas shows, or null for the plain timer.
 *
 * Fixed priority, never adaptive: E2's guardrail is that ordering may adapt but
 * an interface a lifter cannot learn is worse than a dull one, and this surface
 * appears twenty times a session. The variety comes from the board rather than
 * from shuffling — mid-block the answer is always the next set, and only when a
 * block closes does anything else get a turn.
 */
export function pickRestCard(input: RestCanvasInput): RestCard | null {
  return targetCard(input) ?? recordCard(input) ?? crewCard(input) ?? sessionCard(input)
}

/* ── The permanent dismissal ──────────────────────────────────────────────── */

const CANVAS_KEY = 'wazn.rest-canvas'

/**
 * §8-E1: "dismissible permanently in one tap". One tap is the whole point —
 * a confirmation dialog over a rest timer would be the modal §2.1 forbids, on
 * the screen it forbids it on.
 *
 * Off is stored, on is the absence of the key, so a first run costs no write
 * and a cleared storage fails safe toward the default rather than toward off.
 */
export function restCanvasEnabled(storage: Storage | null): boolean {
  if (!storage) return true
  try {
    return storage.getItem(CANVAS_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setRestCanvasEnabled(storage: Storage | null, on: boolean): void {
  if (!storage) return
  try {
    if (on) storage.removeItem(CANVAS_KEY)
    else storage.setItem(CANVAS_KEY, 'off')
  } catch {
    /* a preference that cannot be stored is not a failure worth surfacing */
  }
}
