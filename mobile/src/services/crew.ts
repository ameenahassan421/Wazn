import { supabase } from '@/services/supabase'

/**
 * The Week Board.
 *
 * ── ONE ROW IS THE NORMAL CASE, NOT THE EMPTY ONE ───────────────────────────
 * `docs/FRIENDS_PLAN.md` F6: "With no crew, Friends shows you against yourself.
 * The same Week Board, the same layout, one row: this week against your own
 * four-week average."
 *
 * That is not politeness about an edge case. Production on 2026-08-22 held nine
 * profiles and ONE follow row, so the solo board is the only board that exists
 * today, and a screen that needed a crew to say anything would be blank for
 * every account including Ameen's.
 *
 * ── RANKED ON ADHERENCE, NEVER ON VOLUME ────────────────────────────────────
 * `week_board()` does the ordering, and the reason it exists at all is that
 * `weekly_leaderboard()` ordered by `volume_kg desc`. F2 calls that the break to
 * make: volume is won by whoever trains longest and heaviest, so the same person
 * wins every week. The STEP UP trial's only durable arm was scored on adherence
 * to each participant's own goal.
 */

export interface BoardRow {
  userId: string
  /** Null on a profile that has never set one. The screen falls back to `you`. */
  username: string | null
  displayName: string | null
  isMe: boolean
  /** Sessions per week this person is aiming at. */
  weeklyTarget: number | null
  sessionsThisWeek: number
  /** Their own four-week baseline, one decimal. */
  avgSessions4w: number
  /**
   * Sessions over target, capped at 2 by SQL, null when the account has neither
   * a target nor any history. Used for ORDER, never rendered: the row shows
   * "6 of 3" because that is the sentence, and "2.00" is the sort key.
   */
  adherence: number | null
}

interface Wire {
  user_id: string
  username: string | null
  display_name: string | null
  is_me: boolean
  weekly_target: number | null
  sessions_this_week: number
  avg_sessions_4w: number | string
  adherence: number | string | null
}

/** `numeric` arrives as a string over PostgREST when it will not fit a float
 *  exactly, so every numeric column is coerced rather than trusted. */
function num(value: number | string | null | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export async function fetchBoard(): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc('week_board')
  if (error !== null) throw error
  return ((data ?? []) as Wire[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    isMe: r.is_me,
    weeklyTarget: r.weekly_target === null ? null : Number(r.weekly_target),
    sessionsThisWeek: Number(r.sessions_this_week),
    avgSessions4w: num(r.avg_sessions_4w),
    adherence: r.adherence === null ? null : num(r.adherence),
  }))
}

/**
 * The floor and ceiling 0027 put on the column, restated so the stepper cannot
 * send a value the check constraint will reject.
 */
export const TARGET_MIN = 1
export const TARGET_MAX = 14

/**
 * Commit to a number of sessions a week.
 *
 * Goes through `upsert_user_preference`, which is the writer 0027 shipped and
 * the one the web already uses. Writing `user_preferences` directly would work
 * under RLS and would be a second path to the same column, which is how 0030
 * ended up adding a second column.
 */
export async function setWeeklyTarget(sessions: number): Promise<void> {
  const clamped = Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(sessions)))
  const { error } = await supabase.rpc('upsert_user_preference', {
    p_column: 'weekly_target',
    p_value: String(clamped),
  })
  if (error !== null) throw error
}
