import { useEffect, useState } from 'react'

import {
  briefSkeleton,
  debriefSkeleton,
  type BriefBlock,
  type DebriefBlock,
  type Locale,
  type Unit,
} from '@wazn/domain'

import { useCoach } from '@/hooks/use-coach'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { fetchBriefBlock, fetchCoachLine, fetchDebriefBlock } from '@/services/coach'
import { supabaseConfigError } from '@/services/supabase'

/**
 * The coach's sentence, drawn twice.
 *
 * ── THE ORDER IS THE FEATURE ────────────────────────────────────────────────
 * SQL first, model second. `session_brief()` and `session_debrief()` are
 * RLS-scoped RPCs, `briefSkeleton` / `debriefSkeleton` turn what they return
 * into an honest line with no model involved, and only then — if a sentence
 * arrives from the Edge Function — is that line replaced.
 *
 * So there is no spinner, no loading state and no failure state on either
 * surface. A provider outage, a spent quota, an open circuit breaker, an
 * unapplied migration and a phone in a basement all produce the same thing:
 * the plainer line. The app is fully usable with the model dark, which v5 §12
 * requires, and the way to guarantee that is to never be waiting on it.
 *
 * ── ONE HOOK, TWO SURFACES, ON PURPOSE ──────────────────────────────────────
 * The web wrote this ordering twice (`CoachBrief` and `FinishSummary`) and
 * says in its own comments that it should not have. Two implementations of a
 * safe ordering are two chances to get it wrong, and the wrong one is silent:
 * it looks identical until the model is slow.
 *
 * ── WHAT SILENCES IT ────────────────────────────────────────────────────────
 * `speaks` — `showsCoachSurfaces`, which is Full alone. On Quiet the coach
 * still THINKS (the ghosts keep seeding from `verdictFor`); it just does not
 * narrate, so nothing here runs and no request is made. Off is the same.
 */

/** Which surface is asking, and what it needs to identify itself. */
export type CoachSource =
  { surface: 'briefing' } | { surface: 'debrief'; workoutId: string }

/**
 * The block, kept WITH the surface that fetched it.
 *
 * Storing them together rather than as a bare block is what lets `compose`
 * narrow instead of cast, and it also makes a stale block from the other
 * surface impossible to render — the pair changes together or not at all.
 */
type Facts =
  | { surface: 'briefing'; block: BriefBlock }
  | { surface: 'debrief'; block: DebriefBlock }

function compose(facts: Facts | null, unit: Unit, locale: Locale): string | null {
  if (facts === null) return null
  return facts.surface === 'briefing'
    ? briefSkeleton(facts.block, unit, locale)
    : debriefSkeleton(facts.block, unit, locale)
}

/**
 * Pass null to say "not yet" — a workout with no id, a screen not ready. The
 * hook then makes no request and returns no line, rather than the caller
 * guarding a hook it cannot conditionally call.
 */
export function useCoachLine(source: CoachSource | null): string | null {
  const { unit } = useUnit()
  const { locale } = useLocale()
  const { speaks } = useCoach()

  // Destructured to primitives so the effect's deps are stable. A `source`
  // object literal at the call site is a new identity every render, and
  // depending on it would refetch the briefing on every keystroke elsewhere
  // on the screen.
  const surface = source?.surface ?? null
  const workoutId = source?.surface === 'debrief' ? source.workoutId : null

  const [facts, setFacts] = useState<Facts | null>(null)
  /**
   * The model's sentence, carrying the unit it was written IN.
   *
   * The unit rides along rather than being cleared by an effect when the
   * toggle moves. A stale sentence goes inert instead of being wiped, and the
   * skeleton — which converts locally — covers the gap. Clearing it in an
   * effect is also what `react-hooks` v7 forbids outright.
   */
  const [phrased, setPhrased] = useState<{ unit: Unit; line: string } | null>(null)

  useEffect(() => {
    if (supabaseConfigError !== null || !speaks || surface === null) return

    let live = true

    void (async () => {
      const block =
        surface === 'briefing'
          ? await fetchBriefBlock()
          : workoutId === null
            ? null
            : await fetchDebriefBlock(workoutId)
      if (!live || block === null) return

      const next = (
        surface === 'briefing'
          ? { surface, block: block as BriefBlock }
          : { surface, block: block as DebriefBlock }
      ) as Facts
      setFacts(next)

      // The sentence is asked for only when there is a line to improve. A
      // model call whose output has nowhere to go is a model call not worth
      // making, and on a brand-new account that is every call.
      if (compose(next, unit, locale) === null) return

      const result = await fetchCoachLine(surface, unit, workoutId ?? undefined)
      if (!live || !result.line) return
      setPhrased({ unit, line: result.line })
    })()

    return () => {
      live = false
    }
    // `unit` IS a dependency: a model was handed one unit and wrote a sentence
    // in it, so a toggle needs a different sentence. The function caches per
    // unit server-side, so returning to a unit already seen costs nothing.
  }, [surface, workoutId, speaks, unit, locale])

  if (!speaks || surface === null) return null
  const current = phrased?.unit === unit ? phrased : null
  return current?.line ?? compose(facts, unit, locale)
}
