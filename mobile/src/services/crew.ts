import * as Crypto from 'expo-crypto'

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

/**
 * This lifter's invite code, created on first ask and reused after.
 *
 * One code per person rather than one per share. A new code each time would
 * leave a trail of live links nobody can account for; one code makes "revoke my
 * invite" a single delete. Same rule `src/lib/social.ts` follows on the web,
 * and deliberately the same TABLE, so a code shared from the phone still works
 * on a link opened in a browser.
 *
 * `expo-crypto` rather than `crypto.getRandomValues`, which is the one line
 * that could not be shared with the web implementation: the global exists in a
 * browser and not in Hermes. The alphabet and the length match
 * `invites_code_check` from 0011 exactly, because a code this function invents
 * that the constraint rejects would fail at the insert with a message about a
 * check violation rather than about an invite.
 */
export async function getOrCreateInviteCode(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (userId === undefined) throw new Error('Not signed in.')

  const { data: existing } = await supabase
    .from('invites')
    .select('code')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (existing?.code !== undefined) return (existing as { code: string }).code

  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = Crypto.getRandomBytes(12)
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')

  const { error } = await supabase.from('invites').insert({ user_id: userId, code })
  if (error !== null) throw error
  return code
}

/**
 * The link.
 *
 * The production host, hardcoded, because a phone has no `window.location` to
 * read one from and the alternative is a `VITE_`-shaped env var in a native
 * bundle. `www.trywazn.app` is canonical and `app.config.ts` already registers
 * it for universal links, so this URL opens the app when it is installed and
 * the web landing page when it is not, which is exactly what an invite has to
 * do.
 */
export function inviteUrl(code: string): string {
  return `https://www.trywazn.app/join/${code}`
}

/** The inviter's actual week, for the landing screen. Anon-callable: see 0038. */
export interface InvitePreview {
  name: string | null
  weeklyTarget: number | null
  sessionsThisWeek: number
  avgSessions4w: number
}

export async function fetchInvitePreview(code: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('invite_preview', { p_code: code })
  if (error !== null) throw error
  const row = (
    (data ?? []) as {
      username: string | null
      display_name: string | null
      weekly_target: number | null
      sessions_this_week: number
      avg_sessions_4w: number | string
    }[]
  )[0]
  if (row === undefined) return null
  return {
    name: row.display_name ?? row.username,
    weeklyTarget: row.weekly_target === null ? null : Number(row.weekly_target),
    sessionsThisWeek: Number(row.sessions_this_week),
    avgSessions4w: num(row.avg_sessions_4w),
  }
}
