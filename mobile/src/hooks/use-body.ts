import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'

import {
  averageWeightKg,
  describeError,
  latestWeightKg,
  weightSeries,
  weightSteady,
  type WeighIn,
} from '@wazn/domain'

import { supabase, supabaseConfigError } from '@/services/supabase'

/**
 * Weigh-ins, read and written.
 *
 * ── THE SCREEN TOLD PEOPLE TO LOG ONE AND HAD NO WAY TO ─────────────────────
 * Body was a 24-line stub whose whole content was the sentence "Log a weigh-in
 * to start the second chart." There was no input, no table read, and no write
 * path anywhere in the native app. That is the same shape as the workout board
 * with no exercise picker: an instruction with nothing behind it.
 *
 * ── ONE ROW PER DAY, AND THE TABLE ENFORCES IT ──────────────────────────────
 * `body_weights` is keyed `(user_id, measured_on)` (migration 0027), so a
 * second weigh-in on the same day is an UPDATE, not a duplicate. `logWeight`
 * upserts on that key rather than inserting and hoping — stepping on the scale
 * twice before coffee is normal and must not produce two rows.
 *
 * `user_id` is left to the column default (`auth.uid()`), which is why the
 * payload carries only the date and the weight.
 */

/**
 * The chart's window, in days, and it exists because the label was a lie.
 *
 * `body.weight` reads "Weight · 12 wk" and this hook handed the chart every
 * row ever written, so an account with two years of weigh-ins drew two years
 * under a label promising twelve weeks. Windowed here rather than at each
 * chart, because there are two of them now (the Body screen and the card on
 * Progress) and a window that lives in a component is a window the second
 * component forgets.
 *
 * `latestKg` is deliberately NOT windowed: "what do I weigh" is answered by
 * the last reading whenever it was taken, and a lifter who stopped weighing in
 * three months ago should still see their number rather than an em dash.
 */
const CHART_DAYS = 84

export interface BodyData {
  loading: boolean
  error: string | null
  /** Oldest first, for a chart that reads left to right. Last 12 weeks. */
  series: { on: Date; kg: number }[]
  /** The most recent reading. Null before the first one. */
  latestKg: number | null
  /** The 28-day trailing mean. A single morning swings a kilo on water. */
  averageKg: number | null
  /** True when four weeks have held inside a kilogram. */
  steady: boolean
  /** Upserts today's row and refreshes. Rejects on a failed write. */
  logWeight: (kg: number) => Promise<void>
}

/** `YYYY-MM-DD` for the LOCAL day. `toISOString()` is UTC, and a 9pm weigh-in
 *  in Cairo would be filed under tomorrow — against a table whose primary key
 *  is the date. */
function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export function useBody(): BodyData {
  const [rows, setRows] = useState<WeighIn[]>([])
  const [loading, setLoading] = useState(supabaseConfigError === null)
  const [error, setError] = useState<string | null>(supabaseConfigError)

  /**
   * One read, returning a result rather than setting state.
   *
   * Split this way on purpose: `react-hooks` v7 refuses a `setState` reachable
   * synchronously from an effect body, and it sees through `useCallback` — so
   * a `load()` that both fetched AND set was an error, not a warning. The
   * fetch is pure, `apply` is the only setter, and the effect calls it from a
   * `.then`, which is a callback and therefore allowed. Same shape `use-home`
   * already uses, and the same rule CLAUDE.md records under "State handling".
   */
  const fetchWeights = useCallback(async (): Promise<
    { rows: WeighIn[]; error: null } | { rows: null; error: string }
  > => {
    const { data, error: failure } = await supabase
      .from('body_weights')
      .select('measured_on, weight_kg')
      .order('measured_on', { ascending: true })

    if (failure) {
      return { rows: null, error: describeError('Loading your weigh-ins', failure) }
    }
    return {
      rows: ((data ?? []) as { measured_on: string; weight_kg: number | string }[]).map(
        (r) => ({ on: r.measured_on, kg: r.weight_kg }),
      ),
      error: null,
    }
  }, [])

  /* Has a read ever succeeded? A ref rather than state: nothing renders from
     it, and it must be readable inside `apply` without adding a dependency
     that would re-run the focus effect on every successful read. */
  const loaded = useRef(false)

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchWeights>>) => {
    if (result.rows === null) {
      /*
       * A FAILED REFETCH KEEPS WHAT IS ON SCREEN.
       *
       * This used to publish the error unconditionally, and every consumer
       * draws its failure branch before its data branch — so one flaky read on
       * returning to Progress replaced a figure, an average, a chart and a
       * door with a single grey line. `progress.tsx` states the same rule for
       * the same reason one card up: "data is only replaced on success, so the
       * previous read stays on screen while the new one is in flight".
       *
       * The FIRST read still fails loudly, because there is nothing behind it
       * to keep. What this buys is staleness in exchange for never blanking,
       * and the write path is unaffected: `logWeight` throws.
       */
      if (!loaded.current) setError(result.error)
    } else {
      loaded.current = true
      setError(null)
      setRows(result.rows)
    }
    setLoading(false)
  }, [])

  /*
   * ON FOCUS, NOT ON MOUNT, and in the hook rather than in each screen.
   *
   * Both consumers live under the tab navigator and both stay mounted: the
   * Body screen, and the card on Progress whose own door leads to the screen
   * that changes this number. A mount-only read showed the OLD weight
   * immediately after logging the new one. `HistorySection` shipped exactly
   * that defect and fixed it by calling a `reload` the hook exposed — done
   * here instead, because a hook that exposes a refresh its callers must
   * remember to wire up is a hook whose second caller forgets. It also keeps
   * the count at one read per focus; wiring it from the component meant the
   * mount effect and the focus effect both firing on the first render.
   */
  useFocusEffect(
    useCallback(() => {
      if (supabaseConfigError !== null) return
      let live = true
      void fetchWeights()
        .then((result) => {
          if (live) apply(result)
        })
        .catch(() => {
          if (live) setLoading(false)
        })
      return () => {
        live = false
      }
    }, [fetchWeights, apply]),
  )

  const logWeight = useCallback(
    async (kg: number) => {
      const { error: failure } = await supabase
        .from('body_weights')
        .upsert(
          { measured_on: localDay(), weight_kg: kg },
          { onConflict: 'user_id,measured_on' },
        )
      // Thrown, not swallowed. Unlike the check-in — which degrades to Normal
      // and costs nothing — a weigh-in that silently failed to save is a gap
      // in the one series this screen exists to draw.
      if (failure) throw new Error(describeError('Saving your weigh-in', failure))
      apply(await fetchWeights())
    },
    [fetchWeights, apply],
  )

  return {
    loading,
    error,
    series: weightSeries(rows, { sinceDays: CHART_DAYS }),
    latestKg: latestWeightKg(rows),
    averageKg: averageWeightKg(rows),
    steady: weightSteady(rows),
    logWeight,
  }
}
