import { useEffect, useState } from 'react'

import { estimatedOneRepMax } from '@wazn/domain'

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
 * ── WHAT IS NOT WIRED, AND WHY IT RETURNS NULL RATHER THAN A PLACEHOLDER ────
 * `rank` and the duel need migration 0029 (the rank ladder and duel tables),
 * which is written but NOT applied — this build session has no Supabase
 * credentials. `brief` needs the coach Edge Function. Both return null, and
 * the screen renders nothing in their place. A fabricated rank on a screen
 * whose whole job is to be trusted with numbers is worse than an absence.
 */

export type Readiness = 'fresh' | 'normal' | 'drained'

export type HomeData = {
  loading: boolean
  username: string | null
  /** Total kg of the last finished session's working sets. Null on day one. */
  target: number | null
  routineName: string
  brief: { line: string; chip: string } | null
  rank: { name: string; pct: number; detail: string } | null
  stats: { streak: string; thisWeek: string; sessions: string }
  plan: { name: string; sets: number }[]
}

const DAY_ONE: HomeData = {
  loading: false,
  username: null,
  target: null,
  routineName: '',
  brief: null,
  rank: null,
  stats: { streak: '—', thisWeek: '—', sessions: '—' },
  plan: [],
}

export function useHome(): HomeData {
  const [data, setData] = useState<HomeData>({ ...DAY_ONE, loading: true })

  useEffect(() => {
    if (supabaseConfigError !== null) {
      setData(DAY_ONE)
      return
    }

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

  return data
}
