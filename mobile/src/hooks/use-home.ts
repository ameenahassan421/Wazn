import { useEffect, useState } from 'react'

import {
  asCheckIn,
  computeReadiness,
  estimatedOneRepMax,
  type CheckIn,
  type Readiness,
} from '@wazn/domain'

import { useCoachLine } from '@/hooks/use-coach-line'
import { supabase, supabaseConfigError } from '@/services/supabase'

/**
 * What the hunt home needs, and where it comes from.
 *
 * ── THE TARGET IS THE LAST SESSION'S VOLUME ─────────────────────────────────
 * `BEAT {n}` is the total normal-set volume of the most recent FINISHED
 * workout. Warm-ups are excluded — they are not work, and counting them makes
 * a target a lifter beats by warming up longer. Sets with a null weight or
 * null reps (bodyweight, planks, cardio) contribute nothing, for the same
 * reason `estimatedOneRepMax` refuses them.
 *
 * This is deliberately the last session regardless of routine, which is a
 * known simplification: on a push/pull/legs split it can ask a lifter to beat
 * a leg day's volume on a push day. The handoff's own prototype does the same
 * thing, and matching a routine needs the routine metadata that P2 adds.
 * Flagged rather than silently "fixed" into something the design did not ask
 * for.
 *
 * ── THE CHECK-IN IS AN INPUT, NOT A DISPLAY ─────────────────────────────────
 * The tap is stored in `daily_checkins` (migration 0027) and fed to the shared
 * `computeReadiness`, exactly as `LogScreen` does on the web. What comes back
 * is one of three internal states that are never rendered as a word: readiness
 * shows up only as changed behaviour, which on this screen means the plan's set
 * counts and, once a session starts, the ghosts.
 *
 * **And nothing reads it yet, which is a defect and not a design.** The
 * preference this paragraph used to say was missing landed on 2026-08-21
 * (`use-coach.tsx`), but `readiness` is still returned by this hook and
 * consumed by no screen, and the board seeds its ghosts from
 * `computeReadiness({ checkIn: null, daysRested: null })` — a hardcoded
 * Normal. So the three chips on Home write a row and change nothing anywhere.
 * Tracked as the next fix; see WAZN_PLAN.md §7.0.
 *
 * ── THE BRIEF IS THE COACH'S OWN, AND IT IS NOT FETCHED HERE ────────────────
 * `useCoachLine` owns it: `session_brief()` first, the Edge Function's
 * sentence second, silence when Coach volume is not Full. It is a separate
 * read on a separate cadence, so it lives in a separate hook and is merely
 * handed back through this one — the screen asks `useHome()` for everything
 * on it and should not have to know which query answered.
 *
 * The comment that used to sit here said the brief "needs the coach Edge
 * Function". It did not. It needed the skeleton, which shipped on the web in
 * B1 and could not cross into `@wazn/domain` because it lived in a file that
 * imports the browser Supabase client. Splitting `coach-lines.ts` out of
 * `coach.ts` on 2026-08-21 is the whole of what was missing.
 *
 * ── WHAT IS STILL NOT WIRED, AND WHY IT IS NULL RATHER THAN A PLACEHOLDER ───
 * `rank` and the duel need migration 0029 (the rank ladder and duel tables),
 * which is written but NOT applied. It returns null and the screen renders
 * nothing in its place. A fabricated rank on a screen whose whole job is to be
 * trusted with numbers is worse than an absence.
 */

/** `YYYY-MM-DD` for the LOCAL day. `toISOString()` here would be UTC, and a
 *  9pm check-in in Cairo would be filed under tomorrow. Mirrors `localDay` in
 *  the web's `body-store`, which is not shareable: it lives in a module that
 *  imports the browser's Supabase client. */
function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/**
 * Whole days since a timestamp, or null when there is none.
 *
 * The one readiness input the app always has, because it comes from the log
 * rather than from a wearable grant nobody has given. Same arithmetic as
 * `LogScreen`'s `daysRested`, against the same row: the last finished session.
 */
function daysSince(iso: string | null): number | null {
  if (iso === null) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/** Today's tap, or null. Null is "not asked yet", which reads as Normal. */
async function fetchCheckIn(day = localDay()): Promise<CheckIn | null> {
  try {
    const { data, error } = await supabase
      .from('daily_checkins')
      .select('state')
      .eq('day', day)
      .maybeSingle()
    if (error || !data) return null
    return asCheckIn((data as { state?: unknown }).state)
  } catch {
    return null
  }
}

/**
 * One tap, and it may be changed. Failure is swallowed on purpose: a check-in
 * that did not save is not worth an error mid-warm-up, and the readiness it
 * feeds degrades to Normal on the next load, silently, which is the same
 * thing a skipped check-in means. `user_id` is left to the column default
 * (`auth.uid()`, 0027), which is why the row carries only day and state.
 */
async function logCheckIn(state: CheckIn, day = localDay()): Promise<void> {
  try {
    await supabase
      .from('daily_checkins')
      .upsert({ day, state }, { onConflict: 'user_id,day' })
  } catch {
    // Intentionally silent. See above.
  }
}

/** What one read of the account produces. */
type Fetched = {
  loading: boolean
  username: string | null
  /** Total kg of the last finished session's working sets. Null on day one. */
  target: number | null
  routineName: string
  /** Whole days since the last finished session. Null on day one. */
  daysRested: number | null
  rank: { name: string; pct: number; detail: string } | null
  stats: { streak: string; thisWeek: string; sessions: string }
  plan: { name: string; sets: number }[]
}

export type HomeData = Fetched & {
  /**
   * The coach's sentence, or null when there is nothing true to say and when
   * the dial is not on Full. No chip: the prototype's coach card is a kicker
   * and one sentence, and the figure a chip would carry ("beat 4,320 kg") is
   * already the third line of the Up next card directly beneath it.
   */
  brief: { line: string } | null
  checkIn: CheckIn | null
  /** Computed, never displayed as a gauge. Drives behaviour, not copy. */
  readiness: Readiness
  setCheckIn: (state: CheckIn) => void
}

const DAY_ONE: Fetched = {
  loading: false,
  username: null,
  target: null,
  routineName: '',
  daysRested: null,
  rank: null,
  stats: { streak: '—', thisWeek: '—', sessions: '—' },
  plan: [],
}

export function useHome(): HomeData {
  /**
   * Seeded, not corrected. With no Supabase configuration there is nothing to
   * load, so the day-one shape IS the answer on the first render — and the
   * effect that would otherwise set it synchronously is what `react-hooks` v7
   * forbids. `supabaseConfigError` is a module constant.
   */
  const [data, setData] = useState<Fetched>(
    supabaseConfigError === null ? { ...DAY_ONE, loading: true } : DAY_ONE,
  )

  /**
   * Its own state, and its own read. Kept out of `data` so that a tap during
   * the session read wins rather than being overwritten by the object that
   * read returns. The check-in is the one value on this screen the lifter
   * authored, and losing it to a race would be the app arguing with them.
   */
  const [checkIn, setCheckInState] = useState<CheckIn | null>(null)

  /** Silent unless Coach volume is Full; see `use-coach-line.ts`. */
  const briefLine = useCoachLine({ surface: 'briefing' })

  useEffect(() => {
    if (supabaseConfigError !== null) return

    let live = true

    async function load() {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (userId === undefined) return DAY_ONE

      const [{ data: profile }, { data: recent }] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
        // Finished sessions only. An in-progress workout is not a target —
        // it is the thing you are doing.
        supabase
          .from('workouts')
          .select('id, name, started_at, workout_sets(weight_kg, reps, set_type)')
          .eq('user_id', userId)
          .not('ended_at', 'is', null)
          .order('started_at', { ascending: false })
          .limit(1),
      ])

      const last = recent?.[0]
      const username = (profile?.username as string | null) ?? null

      if (last === undefined) {
        return { ...DAY_ONE, username }
      }

      const sets = (last.workout_sets ?? []) as {
        weight_kg: number | null
        reps: number | null
        set_type: string
      }[]

      // `estimatedOneRepMax` is reused as the qualifier rather than
      // re-implementing "is this a working set": it already refuses warm-ups
      // and sets missing either half, and those are exactly the rows that
      // must not contribute volume. One rule, one place.
      const target = sets.reduce((total, s) => {
        if (estimatedOneRepMax(s.weight_kg, s.reps, s.set_type) === null) return total
        return total + (s.weight_kg ?? 0) * (s.reps ?? 0)
      }, 0)

      return {
        ...DAY_ONE,
        username,
        target: target > 0 ? target : null,
        routineName: (last.name as string | null) ?? 'Last session',
        daysRested: daysSince(last.started_at as string | null),
      }
    }

    void load()
      .then((next) => {
        if (live) setData(next)
      })
      .catch(() => {
        // A failed read is the day-one screen, not an error screen. Offline
        // is the normal case in a basement gym, and the one button that
        // matters — start a workout — does not need the network.
        if (live) setData(DAY_ONE)
      })

    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (supabaseConfigError !== null) return

    let live = true

    // A null answer never clears state: it means "nothing stored today", and a
    // tap that landed while this was in flight is worth more than that.
    void fetchCheckIn().then((state) => {
      if (live && state !== null) setCheckInState(state)
    })

    return () => {
      live = false
    }
  }, [])

  return {
    ...data,
    brief: briefLine === null ? null : { line: briefLine },
    checkIn,
    readiness: computeReadiness({ checkIn, daysRested: data.daysRested }),
    setCheckIn: (state) => {
      // Optimistic, and deliberately not awaited. The row is already painted
      // by the time the write leaves the phone.
      setCheckInState(state)
      void logCheckIn(state)
    },
  }
}
