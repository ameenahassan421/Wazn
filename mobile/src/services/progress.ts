import type { RecordSetRow, SessionVolumeRow } from '@wazn/domain'

import { supabase } from '@/services/supabase'

/**
 * Everything the Progress tab reads, in one round trip.
 *
 * ── FIVE READS, ONE `Promise.all`, AND ONE OF THEM IS ALLOWED TO FAIL ───────
 * The four that shape the screen are fatal together: without sessions there is
 * no frequency chart, no volume trend and no "this week", so a partial render
 * would be a screen of empty states claiming the lifter has done nothing.
 *
 * Records are deliberately NOT in that set. They are the reward surface, and
 * the whole screen going to an error page because one motivational block could
 * not load is the wrong trade. A failure there means no Records section and
 * nothing else changes. Same call the web screen makes, same reasoning.
 */

/** One row of `strength_summary`. Numerics arrive as strings through PostgREST. */
export interface StrengthRow {
  exercise_id: string
  name: string
  muscle_group: string
  image_url: string | null
  last_trained_at: string | null
  best_e1rm_kg: number | string | null
  recent_e1rm_kg: number | string | null
  previous_e1rm_kg: number | string | null
  set_count: number | string
}

export interface ProgressData {
  sessions: SessionVolumeRow[]
  strength: StrengthRow[]
  streakWeeks: number
  /** Empty when the catalogue or the record query failed; never fatal. */
  records: RecordSetRow[]
  nameById: Map<string, string>
}

export async function fetchProgress(): Promise<ProgressData> {
  const [volume, lifts, streakRows, catalogue, recordRows] = await Promise.all([
    supabase.rpc('session_volume_history'),
    supabase.rpc('strength_summary'),
    /*
     * The DEVICE timezone, not the default.
     *
     * `weekly_streak(p_timezone)` defaults to UTC, and `sessionsPerWeek` in
     * `@wazn/domain` buckets by local `getDay()`. On 2026-08-21 that put two
     * contradicting numbers on one screen: a session stored `2026-07-20
     * 00:01+00` is 2026-07-19 in Chicago, so the chart drew an empty week
     * where SQL saw none, and the card above it claimed a 34-week streak with
     * a visible gap in the bars directly beneath. Same lift, two weeks.
     */
    supabase.rpc('weekly_streak', {
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    supabase.from('exercises').select('id, name').order('name'),
    /*
     * Every record the database has flagged, newest first.
     *
     * `workout_sets_records_idx` (migration 0009) is a partial index over
     * exactly this predicate, so the scan touches only record rows rather than
     * every set. The order goes through the embedded workout because a set has
     * no date of its own, and the limit is a CEILING rather than the list
     * length: `recentRecords` sorts and slices to five, so a limit that clipped
     * a newer record would silently drop it.
     */
    supabase
      .from('workout_sets')
      .select(
        'exercise_id, weight_kg, reps, pr_weight, pr_e1rm, workouts!inner(started_at)',
      )
      .or('pr_weight.eq.true,pr_e1rm.eq.true')
      .order('started_at', { referencedTable: 'workouts', ascending: false })
      .limit(120),
  ])

  const fatal = volume.error ?? lifts.error ?? streakRows.error
  if (fatal) throw fatal

  const nameById = new Map<string, string>()
  for (const row of (catalogue.data ?? []) as { id: string; name: string }[]) {
    nameById.set(row.id, row.name)
  }

  /*
   * `workouts` comes back as an object under `!inner`, but PostgREST's generated
   * types call it an array. Flattened here so `recentRecords` sees the flat
   * `started_at` its own contract asks for, rather than each caller reaching
   * through a shape that is a lie in one direction or the other.
   */
  const records: RecordSetRow[] = (
    (recordRows.error ? [] : (recordRows.data ?? [])) as unknown[]
  ).map((raw) => {
    const row = raw as RecordSetRow & {
      workouts?: { started_at: string } | { started_at: string }[]
    }
    const joined = Array.isArray(row.workouts) ? row.workouts[0] : row.workouts
    return {
      exercise_id: row.exercise_id,
      weight_kg: row.weight_kg,
      reps: row.reps,
      pr_weight: row.pr_weight,
      pr_e1rm: row.pr_e1rm,
      started_at: joined?.started_at ?? '',
    }
  })

  return {
    sessions: (volume.data ?? []) as SessionVolumeRow[],
    strength: (lifts.data ?? []) as StrengthRow[],
    streakWeeks: ((streakRows.data ?? []) as { weeks: number }[])[0]?.weeks ?? 0,
    records,
    nameById,
  }
}
