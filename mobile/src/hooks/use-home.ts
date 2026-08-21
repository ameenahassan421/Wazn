import { useEffect, useState } from 'react'

import {
  asCheckIn,
  lastLoggedSession,
  localDay,
  sessionVolume,
  type BriefBlock,
  type CheckIn,
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
 * **It used to be the last session regardless of routine, and that limitation
 * is fixed here (2026-08-21, Ameen's ask).** On a push/pull/legs split it asked
 * a lifter to beat a leg day's volume on a push day. The target is now the last
 * run of the routine that is DUE, when one can be matched, and only falls back
 * to the last session otherwise.
 *
 * ── AND IT READS A WINDOW, NOT ONE ROW ──────────────────────────────────────
 * The query took `limit(1)`. On 2026-08-21 an account with 163 workouts and
 * 3,476 sets rendered as brand new — "Welcome, amin", "Your first workout",
 * "Your log starts today" — because the newest finished workout was a
 * 21-second start-and-abandon with no sets, so its volume was zero, so
 * `target` was null, and `dayOne` is just `target === null`. The coach card
 * directly above was quoting "Bench Press 140 lbs x 2 last time" at the time,
 * which is how it was caught.
 *
 * That is not an import artifact and it is not rare: any lifter who taps
 * Start, logs nothing and ends the session erases their own history from the
 * one screen every workout begins on. `lastLoggedSession` walks the window
 * back to the last session that actually moved weight.
 *
 * ── WHAT IS NEXT COMES FROM ROTATION AND FROM THE BAND GAPS ─────────────────
 * `session_brief()` already computes both, for the calling user, in SQL:
 * `due_routine` by the same rotation rule `rotation.ts` transcribes, and
 * `low_bands`, the muscle groups under ten sets in the last seven days. Neither
 * is a model call and neither is new machinery — the numbers were already on
 * this screen inside the coach's sentence, and the card underneath was
 * ignoring them to echo the name of the session just finished.
 *
 * ── THE CHECK-IN IS AN INPUT, AND THIS SCREEN ONLY COLLECTS IT ──────────────
 * The tap is stored in `daily_checkins` (migration 0027). It is never rendered
 * as a word and this hook no longer scores it: readiness shows up as changed
 * BEHAVIOUR, and the only behaviour that acts on it is the ghost on the board.
 *
 * So `startWorkout` reads the row and freezes a `Readiness` onto the live
 * store, and this hook returns the tap and its setter and nothing more. It
 * used to return a `readiness` that grep proved no screen read, while the
 * board seeded its ghosts from `computeReadiness({ checkIn: null, daysRested:
 * null })` — a hardcoded Normal. Three chips on the highest-traffic screen
 * wrote a row to Postgres and changed nothing a lifter could see. Fixed
 * 2026-08-21 by giving the value ONE owner instead of two half-owners.
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
  /** Total kg of working sets in the session the next one is measured against.
   *  Null only when nothing in the window has volume. */
  target: number | null
  /** The routine that is DUE, or the last session's name when rotation has
   *  nothing to say (fewer than two routines). */
  routineName: string
  /** The muscle group furthest under its weekly band, or null when none is. */
  lowBand: { muscle: string; sets: number } | null
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
  setCheckIn: (state: CheckIn) => void
}

const DAY_ONE: Fetched = {
  loading: false,
  username: null,
  target: null,
  routineName: '',
  lowBand: null,
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

      const [{ data: profile }, { data: recent }, { data: briefBlock }] =
        await Promise.all([
          supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
          /*
           * A WINDOW, not a row. Finished sessions only — an in-progress
           * workout is not a target, it is the thing you are doing.
           *
           * Thirty is roughly two months of training for a four-day week, so
           * it comfortably spans the "week or a month" this card reasons over,
           * and it is one query with the sets embedded rather than thirty.
           * ponytail: fixed window, not a date filter — a lifter returning
           * after a long layoff still has their last real session in it, where
           * `started_at > now() - 30 days` would hand them the day-one screen
           * for having rested.
           */
          supabase
            .from('workouts')
            .select(
              'id, name, routine_id, started_at, workout_sets(weight_kg, reps, set_type)',
            )
            .eq('user_id', userId)
            .not('ended_at', 'is', null)
            .order('started_at', { ascending: false })
            .limit(30),
          /*
           * Rotation and the band gaps, both already computed in SQL for this
           * user. Plain statistics, no model: this is the logging path and the
           * coach never puts a model on it.
           */
          supabase.rpc('session_brief'),
        ])

      const username = (profile?.username as string | null) ?? null

      type Row = {
        name: string | null
        routine_id: string | null
        started_at: string | null
        workout_sets: {
          weight_kg: number | null
          reps: number | null
          set_type: string
        }[]
      }
      const rows = ((recent ?? []) as Row[]).map((row) => ({
        name: row.name,
        started_at: row.started_at,
        sets: row.workout_sets ?? [],
      }))

      const lastLogged = lastLoggedSession(rows)
      // Day one means NEVER trained, not "nothing lately". A lifter whose last
      // real session is older than the window still has it in these thirty
      // rows, so a null here is genuinely an empty log.
      if (lastLogged === null) return { ...DAY_ONE, username }

      const block = (briefBlock ?? null) as BriefBlock | null
      const due = block?.due_routine?.name ?? null

      /*
       * Like-for-like when it can be had.
       *
       * The target is the last run of the routine that is DUE, matched on the
       * workout's own name, because that is the comparison a lifter actually
       * makes. Falling back to the last session regardless of routine is the
       * old behaviour and is still correct when rotation has nothing to say or
       * the due routine has never been run — better a target from the wrong
       * day than no target at all.
       */
      const dueRun =
        due === null
          ? null
          : (rows.find((row) => row.name === due && sessionVolume(row.sets) > 0) ??
            null)

      return {
        ...DAY_ONE,
        username,
        target: dueRun === null ? lastLogged.volumeKg : sessionVolume(dueRun.sets),
        routineName: due ?? lastLogged.name ?? 'Last session',
        lowBand: block?.low_bands?.[0] ?? null,
        daysRested: daysSince(lastLogged.startedAt),
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
    setCheckIn: (state) => {
      // Optimistic, and deliberately not awaited. The row is already painted
      // by the time the write leaves the phone.
      setCheckInState(state)
      void logCheckIn(state)
    },
  }
}
