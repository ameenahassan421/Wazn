import type { WeekBucket } from './progress'

/**
 * The weekly streak, and the freezes that keep it from becoming a threat.
 *
 * Design v3.0 §Engagement, and the reasoning is not decoration:
 *
 *  - **Weekly, never daily.** A daily streak punishes rest, and a strength app
 *    must never do that. The target is sessions per week that the LIFTER set,
 *    so the streak measures a promise they made rather than one the app made
 *    for them.
 *  - **Two auto-freezes a month, applied silently and named afterwards.**
 *    Streaks without protection create anxiety and churn — that is the
 *    retention finding the spec cites, and it is why the freeze is spent by
 *    the app rather than offered as a decision at the moment somebody is
 *    already having a bad week.
 *  - **No loss vocabulary anywhere.** Nothing here returns "broken", "lost" or
 *    "missed". `StreakState` carries the record the run set, because a broken
 *    streak's copy states the record, never what was lost (GATE V3's copy
 *    review). The words live in i18n; this returns the numbers they need.
 *
 * ── WHY THIS IS DERIVED AND NOT STORED ──────────────────────────────────────
 * There is no `freezes_used` column, on purpose. A freeze is a fact ABOUT the
 * log — "this week fell short, and the run continued" — and storing it would
 * create a second answer that can disagree with the sessions it was computed
 * from. Editing a workout's date in History would leave a stored freeze
 * stranded; a derived one simply recomputes.
 */

/** Freezes granted per calendar month. */
export const FREEZES_PER_MONTH = 2

export interface StreakState {
  /** Consecutive weeks meeting the target, freezes included. */
  weeks: number
  /** Sessions logged in the current week so far. */
  thisWeek: number
  /** The target those sessions are counted against. */
  target: number
  /** Freezes still available this calendar month. */
  freezesLeft: number
  /** True when the current run is only standing because of a freeze. */
  heldByFreeze: boolean
  /** The longest run in the series, so copy can state a record, not a loss. */
  best: number
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`
}

/**
 * Walk the weeks and decide which ones stand.
 *
 * `weeks` is `sessionsPerWeek()`'s output — oldest first, empty weeks
 * included, the last entry being the week in progress. That last entry is
 * treated differently and the difference matters: a Tuesday with one of three
 * sessions logged has not fallen short of anything yet, so the current week
 * can extend a run but can never end one. Ending a run on a Tuesday would be
 * the app calling a week a failure while the lifter still has five days of it.
 */
export function streakState(
  weeks: WeekBucket[],
  target: number,
  now = new Date(),
): StreakState {
  const safeTarget = Math.max(1, Math.round(target))
  const rows = [...weeks].sort((a, b) => a.start.getTime() - b.start.getTime())

  if (rows.length === 0) {
    return {
      weeks: 0,
      thisWeek: 0,
      target: safeTarget,
      freezesLeft: FREEZES_PER_MONTH,
      heldByFreeze: false,
      best: 0,
    }
  }

  const current = rows[rows.length - 1]
  const completed = rows.slice(0, -1)

  // Freezes are spent oldest-first within each calendar month, which is the
  // only order that is stable: spending them latest-first would change every
  // earlier verdict the moment a new week arrived.
  const spent = new Map<string, number>()
  const held: boolean[] = []
  for (const week of completed) {
    if (week.sessions >= safeTarget) {
      held.push(true)
      continue
    }
    const key = monthKey(week.start)
    const used = spent.get(key) ?? 0
    if (used < FREEZES_PER_MONTH) {
      spent.set(key, used + 1)
      held.push(true)
      continue
    }
    held.push(false)
  }

  // The run ending at the last completed week.
  let run = 0
  for (let i = held.length - 1; i >= 0; i -= 1) {
    if (!held[i]) break
    run += 1
  }

  // The week in progress extends the run once it meets the target, and is
  // otherwise silent.
  const thisWeekMet = current.sessions >= safeTarget
  const weeksNow = run + (thisWeekMet ? 1 : 0)

  let best = 0
  let streak = 0
  for (const ok of held) {
    streak = ok ? streak + 1 : 0
    if (streak > best) best = streak
  }
  if (weeksNow > best) best = weeksNow

  const thisMonth = spent.get(monthKey(now)) ?? 0

  return {
    weeks: weeksNow,
    thisWeek: current.sessions,
    target: safeTarget,
    freezesLeft: Math.max(0, FREEZES_PER_MONTH - thisMonth),
    // Only the most recent completed week can be the one holding the run up,
    // and only when it did not meet the target on its own.
    heldByFreeze:
      completed.length > 0 &&
      held[held.length - 1] === true &&
      completed[completed.length - 1].sessions < safeTarget,
    best,
  }
}
