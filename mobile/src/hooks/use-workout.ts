import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'

import {
  DEFAULT_MODE,
  estimatedOneRepMax,
  verdictFor,
  type GhostVerdict,
  type Readiness,
  type RowPrevious,
} from '@wazn/domain'

import { supabase } from '@/services/supabase'

/**
 * The live workout.
 *
 * ── IT LIVES ON THE DEVICE FIRST ────────────────────────────────────────────
 * Every mutation writes to AsyncStorage synchronously-ish before anything
 * touches the network, and the board renders from that copy. This is not an
 * optimisation, it is the product: LAUNCH §4 requires that a workout logged in
 * a basement with no signal survives the app being killed and syncs clean when
 * the radio comes back. A store that waited on a round trip would fail that on
 * the first set.
 *
 * The set `id` is generated HERE and is the primary key on the server, so a
 * replay of the same queued write is a 23505 rather than a duplicate row. That
 * is what makes retry safe.
 *
 * ── GATE U2: A REPEAT SET IS ONE TAP ────────────────────────────────────────
 * `commit()` takes no arguments. The values it banks are whatever the stepper
 * is showing, and after a commit the stepper KEEPS them — so logging
 * 125×8 three times is press, press, press. Anything that makes the second set
 * cost more than one press is a regression of the gate the plan names.
 */

const KEY = 'wazn.live-workout'

export type SetType = 'normal' | 'warmup'

export interface LiveSet {
  /** Client-generated, and the server's primary key. Retry-safe by design. */
  id: string
  exerciseId: string
  setNumber: number
  weightKg: number | null
  reps: number | null
  setType: SetType
  at: string
}

export interface LiveWorkout {
  id: string
  startedAt: string
  /** Exercise order, as added. */
  order: string[]
  names: Record<string, string>
  sets: LiveSet[]
}

/** Working sets only — warm-ups are not work and never count as volume. */
export function workingSets(w: LiveWorkout, exerciseId?: string): LiveSet[] {
  return w.sets.filter(
    (s) =>
      s.setType !== 'warmup' &&
      (exerciseId === undefined || s.exerciseId === exerciseId),
  )
}

/** Total kg×reps of the working sets. The momentum bar's numerator. */
export function volumeKg(w: LiveWorkout): number {
  return workingSets(w).reduce((total, s) => {
    if (estimatedOneRepMax(s.weightKg, s.reps, s.setType) === null) return total
    return total + (s.weightKg ?? 0) * (s.reps ?? 0)
  }, 0)
}

function blank(): LiveWorkout {
  return {
    id: Crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    order: [],
    names: {},
    sets: [],
  }
}

export function useWorkout() {
  const [workout, setWorkout] = useState<LiveWorkout | null>(null)
  const [ready, setReady] = useState(false)
  /** Previous-session rows per exercise, for the ghost. Loaded on demand. */
  const [previous, setPrevious] = useState<Record<string, RowPrevious[]>>({})

  // Restore. A workout in progress must come back after the OS kills the app,
  // so this runs before anything is rendered from it.
  useEffect(() => {
    let live = true
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!live) return
        if (raw !== null) {
          try {
            setWorkout(JSON.parse(raw) as LiveWorkout)
          } catch {
            // A corrupt checkpoint is a lost workout, not a broken app. It is
            // dropped rather than crashing the board on every launch.
          }
        }
        setReady(true)
      })
      .catch(() => {
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [])

  /** One writer, so no path can mutate without persisting. */
  const write = useCallback((next: LiveWorkout | null) => {
    setWorkout(next)
    if (next === null) void AsyncStorage.removeItem(KEY).catch(() => {})
    else void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
  }, [])

  const start = useCallback(() => {
    const w = blank()
    write(w)
    return w
  }, [write])

  const addExercise = useCallback(
    (exerciseId: string, name: string) => {
      const base = workout ?? blank()
      if (base.order.includes(exerciseId)) return
      write({
        ...base,
        order: [...base.order, exerciseId],
        names: { ...base.names, [exerciseId]: name },
      })
    },
    [workout, write],
  )

  /**
   * Bank a set. The values come from the caller's stepper and nothing else is
   * asked — see GATE U2 above.
   */
  const commit = useCallback(
    (
      exerciseId: string,
      weightKg: number | null,
      reps: number | null,
      setType: SetType,
    ) => {
      const base = workout ?? blank()
      const count = base.sets.filter((s) => s.exerciseId === exerciseId).length
      const set: LiveSet = {
        id: Crypto.randomUUID(),
        exerciseId,
        setNumber: count + 1,
        weightKg,
        reps,
        setType,
        at: new Date().toISOString(),
      }
      write({ ...base, sets: [...base.sets, set] })
      return set
    },
    [workout, write],
  )

  /** Remove the most recent set. The only correction the board offers —
   *  per-set editing is out of scope and stays that way. */
  const undoLast = useCallback(() => {
    if (workout === null || workout.sets.length === 0) return
    write({ ...workout, sets: workout.sets.slice(0, -1) })
  }, [workout, write])

  /**
   * Finish, and push everything to the server.
   *
   * The local copy is cleared only after the writes are ACCEPTED. If the
   * network is down the workout stays on the device and the next finish
   * replays it — the client-generated ids make that idempotent.
   */
  const finish = useCallback(async (): Promise<{ synced: boolean }> => {
    if (workout === null) return { synced: true }
    const w = workout
    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (userId === undefined) return { synced: false }

      const endedAt = new Date().toISOString()
      const { error: wErr } = await supabase.from('workouts').upsert({
        id: w.id,
        user_id: userId,
        started_at: w.startedAt,
        ended_at: endedAt,
      })
      if (wErr) throw wErr

      if (w.sets.length > 0) {
        const { error: sErr } = await supabase.from('workout_sets').upsert(
          w.sets.map((s) => ({
            id: s.id,
            workout_id: w.id,
            exercise_id: s.exerciseId,
            set_number: s.setNumber,
            weight_kg: s.weightKg,
            reps: s.reps,
            set_type: s.setType,
          })),
        )
        if (sErr) throw sErr
      }

      write(null)
      return { synced: true }
    } catch {
      // Kept, deliberately. A finish that cannot reach the server must not
      // throw the session away — it stays banked and syncs on the next try.
      return { synced: false }
    }
  }, [workout, write])

  const discard = useCallback(() => write(null), [write])

  /** Load the previous session's working rows for a lift, for the ghost. */
  const loadPrevious = useCallback(
    async (exerciseId: string) => {
      if (previous[exerciseId] !== undefined) return
      try {
        const { data } = await supabase.rpc('previous_session', {
          p_exercise_id: exerciseId,
          p_exclude_workout: workout?.id ?? null,
        })
        const rows = (
          (data ?? []) as {
            weight_kg: number | null
            reps: number | null
            set_type: string
          }[]
        )
          .filter((r) => r.set_type !== 'warmup')
          .map((r) => ({ weightKg: r.weight_kg, reps: r.reps }))
        setPrevious((p) => ({ ...p, [exerciseId]: rows }))
      } catch {
        // No history is a real answer — the ghost falls silent rather than
        // guessing, which is what `verdictFor` does with an empty array.
        setPrevious((p) => ({ ...p, [exerciseId]: [] }))
      }
    },
    [previous, workout],
  )

  return {
    ready,
    workout,
    previous,
    start,
    addExercise,
    commit,
    undoLast,
    finish,
    discard,
    loadPrevious,
  }
}

/**
 * The ghost for the next set of a lift — the coach-seeded value the stepper
 * opens on.
 *
 * All of the reasoning is `verdictFor` in the shared domain: double
 * progression, the under-plan recalculation, the rep band for the mode. None
 * of it is reimplemented here, which is the entire reason that module is
 * shared rather than copied.
 */
export function useGhost({
  workout,
  exerciseId,
  previous,
  readiness,
  incrementKg,
}: {
  workout: LiveWorkout | null
  exerciseId: string | null
  previous: RowPrevious[]
  readiness: Readiness
  incrementKg: number
}): GhostVerdict | null {
  return useMemo(() => {
    if (workout === null || exerciseId === null) return null
    const committed = workingSets(workout, exerciseId).map((s) => ({
      weightKg: s.weightKg,
      reps: s.reps,
      label: String(s.setNumber),
    }))
    return verdictFor(committed.length, {
      mode: DEFAULT_MODE,
      readiness,
      previous,
      committed,
      incrementKg,
    })
  }, [workout, exerciseId, previous, readiness, incrementKg])
}
