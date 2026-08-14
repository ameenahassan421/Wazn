/**
 * The coach's three dials: mode, volume, and what each one is allowed to change.
 *
 * ── A MODE IS A LENS, NEVER A FORK ──────────────────────────────────────────
 * Design v3.0 §Modes. All three modes share the sets × reps × weight spine, so
 * History and every chart stay ONE dataset. Nothing in this module writes to a
 * training table, partitions one, or migrates anything; switching modes must
 * change zero rows of history and zero routine content, and the way to
 * guarantee that is for the mode to be readable only by the four functions
 * below — ghost seeding, rest, the hero metric, and which block leads Progress.
 *
 * A lifter who never opens the mode selector is in Strength and loses nothing.
 *
 * ── VOLUME IS NOT A MODE ────────────────────────────────────────────────────
 * `full` / `quiet` / `off` is orthogonal (spec §12). `quiet` keeps the ghost
 * intelligence and silences every card and line; `off` renders the v2.2 app
 * verbatim, which is why `showsCoachSurfaces` and `usesGhostIntelligence` are
 * two questions and not one. Getting them confused would either leave the
 * coach talking with the dial off, or strip a silenced app of the ghosts it
 * had before v3 existed.
 */

export const COACH_MODES = ['strength', 'hypertrophy', 'meetprep'] as const
export type CoachMode = (typeof COACH_MODES)[number]

export const COACH_VOLUMES = ['full', 'quiet', 'off'] as const
export type CoachVolume = (typeof COACH_VOLUMES)[number]

export const DEFAULT_MODE: CoachMode = 'strength'
export const DEFAULT_VOLUME: CoachVolume = 'full'

/** The five things a mode changes, from the spec's own table. */
export interface ModeBehaviour {
  id: CoachMode
  /** Message key for the card's one-line description. Copy is final; see i18n. */
  bodyKey: string
  titleKey: string
  /** Rest, in seconds, before the effort scaling in `rest.ts` is applied. */
  rest: { min: number; max: number }
  /** The rep window ghosts ladder within. Null where reps come from the block. */
  repBand: [number, number] | null
  /** Which figure the app leads with — the Progress tab's first section. */
  hero: 'e1rm' | 'weekly-sets' | 'total'
  /** Meet prep alone needs one extra fact before it can seed anything. */
  needsMeetDate: boolean
}

export const MODE_BEHAVIOUR: Record<CoachMode, ModeBehaviour> = {
  strength: {
    id: 'strength',
    titleKey: 'mode.strength',
    bodyKey: 'mode.strength.body',
    // "2–4 min scaled to % e1RM".
    rest: { min: 120, max: 240 },
    repBand: null,
    hero: 'e1rm',
    needsMeetDate: false,
  },
  hypertrophy: {
    id: 'hypertrophy',
    titleKey: 'mode.hypertrophy',
    bodyKey: 'mode.hypertrophy.body',
    // "60–120 s, superset-friendly".
    rest: { min: 60, max: 120 },
    repBand: [8, 15],
    hero: 'weekly-sets',
    needsMeetDate: false,
  },
  meetprep: {
    id: 'meetprep',
    titleKey: 'mode.meetprep',
    bodyKey: 'mode.meetprep.body',
    // "3–5 min, no rushing".
    rest: { min: 180, max: 300 },
    repBand: null,
    hero: 'total',
    needsMeetDate: true,
  },
}

/**
 * Widen an unknown string to a mode, or fall back.
 *
 * Every entry point is untrusted for the same reason: localStorage survives a
 * downgrade, the server row survives a migration being rolled back, and both
 * can hold a value this build has never heard of. A bad value must land on
 * Strength rather than render a screen with no active card on it.
 */
export function asMode(value: unknown): CoachMode | null {
  return typeof value === 'string' && (COACH_MODES as readonly string[]).includes(value)
    ? (value as CoachMode)
    : null
}

export function asVolume(value: unknown): CoachVolume | null {
  return typeof value === 'string' &&
    (COACH_VOLUMES as readonly string[]).includes(value)
    ? (value as CoachVolume)
    : null
}

/**
 * May the coach speak on this surface?
 *
 * Every v3 card, line and chip is gated on this — the Today brief, the plateau
 * card, the weekly review, the finish verdict, the Body cross-signal line, the
 * reasoning chips' explainer. `quiet` silences all of it.
 */
export function showsCoachSurfaces(volume: CoachVolume): boolean {
  return volume === 'full'
}

/**
 * May the coach still shape the ghosts?
 *
 * True for `full` AND `quiet`: quiet is "stop talking", not "stop thinking".
 * Only `off` returns to v2.2's precedence, where a ghost is the previous
 * session and nothing else.
 */
export function usesGhostIntelligence(volume: CoachVolume): boolean {
  return volume !== 'off'
}

/** True when the app must render exactly what v2.2 rendered. */
export function isCoachOff(volume: CoachVolume): boolean {
  return volume === 'off'
}

/**
 * Meet prep with no date is a setup card, not a mode.
 *
 * The selector draws it dashed until this answers true, and — more importantly
 * — `ghost-reason.ts` refuses to seed from a block that has no platform to
 * count back from, rather than inventing a percentage.
 */
export function isModeReady(mode: CoachMode, meetDate: string | null): boolean {
  if (!MODE_BEHAVIOUR[mode].needsMeetDate) return true
  return typeof meetDate === 'string' && meetDate.length > 0
}

/**
 * Weeks between now and the meet, rounded down, floored at zero.
 *
 * Zero means meet day: the countdown does not go negative, because a meet that
 * has happened is history and history has its own screens.
 */
export function weeksOut(meetDate: string | null, now = new Date()): number | null {
  if (!meetDate) return null
  const target = new Date(`${meetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const days = Math.floor((target.getTime() - now.getTime()) / 86_400_000)
  return Math.max(0, Math.floor(days / 7))
}
