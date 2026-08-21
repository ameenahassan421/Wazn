import { useCallback, useEffect, useState } from 'react'

import {
  type CalendarDay,
  describeError,
  type SessionVolumeRow,
  topDay,
  trainingCalendar,
} from '@wazn/domain'

import { supabase, supabaseConfigError } from '@/services/supabase'

/**
 * What screen 12 needs, and where each piece comes from.
 *
 * ── THE GRID AND THE FIND ARE THE SAME QUERY ────────────────────────────────
 * `session_volume_history()` returns one row per finished workout and is the
 * only source both the ten-week grid and COACH'S FIND read. That is on
 * purpose: the two make claims about the same history, and if they came from
 * different queries a lifter could see a card saying "Monday is your day"
 * above a grid with no Monday lit. `trainingCalendar` and `topDay` are both
 * pure and both live in the shared domain, so the phone and the browser
 * cannot disagree about either.
 *
 * ── WEEKS = 10, NOT 13 ──────────────────────────────────────────────────────
 * The web heatmap asks for 13. v5 screen 12 specifies a 7-row by 10-column
 * grid, so this asks for 10 and the difference is the design's, not a bug.
 * `trainingCalendar` lays out whole Monday-started weeks and stops at today,
 * so the last column is a partial week rather than a row of empty cells.
 *
 * ── PRS COME FROM THE SERVER, NOT FROM ARITHMETIC HERE ──────────────────────
 * `workout_totals()` carries `record_count`. A client cannot compute that
 * without every prior set of every lift, and the one thing worse than no PR
 * chip is a wrong one. Workouts with no row simply have no chip.
 *
 * ── WHY TWO RPCS AND A TABLE READ ───────────────────────────────────────────
 * `session_volume_history` has the volume and set counts, `workout_totals`
 * has the records, and neither carries the workout's NAME or `ended_at`,
 * which the row needs for its title and its `M MIN`. Three reads in parallel
 * rather than a view, because both RPCs are already shipped and used by the
 * web, and adding a fourth database object to render one screen is how a
 * schema gets wide.
 */

export interface HistorySession {
  workoutId: string
  name: string
  startedAt: string
  /** Null while a workout is still open; the row then shows no duration. */
  minutes: number | null
  sets: number
  volumeKg: number
  records: number
}

export interface HistoryData {
  loading: boolean
  error: string | null
  sessions: HistorySession[]
  calendar: CalendarDay[]
  /** Every finished workout ever, not the paged `sessions.length`. The header
   *  says "N TOTAL" and 60 would be a lie about a 152-workout history. */
  total: number
  /** Null when there is not enough history for the claim to be honest. */
  find: { weekday: number; count: number; total: number } | null
  reload: () => void
}

interface WorkoutRow {
  id: string
  name: string | null
  started_at: string
  ended_at: string | null
}

interface TotalsRow {
  workout_id: string
  volume_kg: number | string
  set_count: number | string
  record_count: number | string
}

const num = (v: number | string | null | undefined): number =>
  typeof v === 'number' ? v : Number(v ?? 0) || 0

export function useHistory(): HistoryData {
  // Seeded from the config rather than set to false inside the effect. A
  // synchronous setState in an effect is what `react-hooks` v7 forbids and
  // what CLAUDE.md's state rule is about: the answer is known at first render,
  // so it belongs in the initial value.
  const [loading, setLoading] = useState(supabaseConfigError === null)
  const [error, setError] = useState<string | null>(supabaseConfigError)
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [calendar, setCalendar] = useState<CalendarDay[]>([])
  const [find, setFind] = useState<HistoryData['find']>(null)
  const [total, setTotal] = useState(0)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (supabaseConfigError !== null) return
    let live = true

    void (async () => {
      setLoading(true)
      const [workoutsRes, historyRes, totalsRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, name, started_at, ended_at')
          .order('started_at', { ascending: false })
          .limit(60),
        supabase.rpc('session_volume_history'),
        supabase.rpc('workout_totals'),
      ])
      if (!live) return

      const failure = workoutsRes.error ?? historyRes.error ?? totalsRes.error
      if (failure) {
        // Through `describeError`, not raw. A signed-out request gets
        // `permission denied for function session_volume_history` back from
        // Postgres, and that reached a lifter's screen on 2026-08-21.
        setError(describeError('Loading your history', failure))
        setLoading(false)
        return
      }
      setError(null)

      const rows = (historyRes.data ?? []) as SessionVolumeRow[]
      setCalendar(trainingCalendar(rows, 10))
      setTotal(rows.length)
      setFind(topDay(rows))

      const totals = new Map<string, TotalsRow>()
      for (const t of (totalsRes.data ?? []) as TotalsRow[]) totals.set(t.workout_id, t)

      setSessions(
        ((workoutsRes.data ?? []) as WorkoutRow[]).map((w) => {
          const t = totals.get(w.id)
          return {
            workoutId: w.id,
            name: w.name ?? 'Workout',
            startedAt: w.started_at,
            minutes:
              w.ended_at === null
                ? null
                : Math.max(
                    0,
                    Math.round(
                      (new Date(w.ended_at).getTime() -
                        new Date(w.started_at).getTime()) /
                        60000,
                    ),
                  ),
            sets: num(t?.set_count),
            volumeKg: num(t?.volume_kg),
            records: num(t?.record_count),
          }
        }),
      )
      setLoading(false)
    })()

    return () => {
      live = false
    }
  }, [nonce])

  return { loading, error, sessions, calendar, total, find, reload }
}
