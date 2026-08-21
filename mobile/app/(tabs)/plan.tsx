import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'

import { formatRelativeDay, formatWeight, type Unit } from '@wazn/domain'

import { Card } from '@/components/ui/Surface'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { tick } from '@/services/haptics'
import { fetchRoutines, type PlanRoutine } from '@/services/routines'
import { supabaseConfigError } from '@/services/supabase'

/**
 * Screen — Plan. The routines, and which one is up next.
 *
 * ── WHY THIS TAB EXISTS ─────────────────────────────────────────────────────
 * Row counts read from production on 2026-08-21, across all nine accounts:
 * routines and their children hold **386 rows** and had no screen on either
 * stack. Body held **one**, and owned a sixth of the tab bar. The navigation
 * was inverted relative to use, and this is the half of the fix that ADDS
 * something rather than removing it (`docs/FRIENDS_PLAN.md` Part 3B).
 *
 * They were not unused, either — `session_brief()` picks the due routine and
 * Home has been naming it on the Up Next card this whole time. A lifter could
 * be told what was up next and had nowhere to go and look at it.
 *
 * ── WHAT IT DOES NOT DO YET, SAID OUT LOUD ──────────────────────────────────
 * **You cannot start a routine from here, and nothing here pretends you can.**
 * `startWorkout()` takes no argument: it seeds the board from the last logged
 * session, not from a routine's planned sets. Wiring a tap to it would start
 * the wrong workout with an air of authority. Seeding a board FROM a routine
 * is a real change to the logging path, which is the one path in this app that
 * does not get changed at the end of a long session.
 *
 * So the cards expand instead of navigating: tapping one shows the planned
 * sets underneath it. That is a whole interaction rather than a stub, and it
 * is the question a lifter actually opens this screen with — "what is in
 * Upper Push again".
 *
 * ── ORDER IS THE ROTATION, NOT `position` ───────────────────────────────────
 * `rotationOrder` comes from the shared domain, so the list reads in the same
 * order `session_brief()` computes and the first card is the one Home calls up
 * next. L9 in the plan is the defect from getting this wrong on the web: the
 * card named a day the list underneath it did not reflect, and the obvious tap
 * was the wrong one.
 */

/** "5 × 60 kg", or "5 reps" when the plan carries no weight. */
function setLine(
  sets: { reps: number | null; weight_kg: number | null }[],
  unit: Unit,
): string {
  return sets
    .map((s) => {
      const reps = s.reps === null ? '—' : String(s.reps)
      if (s.weight_kg === null) return reps
      return `${reps} × ${formatWeight(s.weight_kg, unit)}`
    })
    .join('   ')
}

function RoutineCard({
  routine,
  due,
  unit,
  open,
  onToggle,
}: {
  routine: PlanRoutine
  due: boolean
  unit: Unit
  open: boolean
  onToggle: () => void
}) {
  const { t, locale } = useLocale()
  const [pressed, setPressed] = useState(false)

  const count = routine.exercises.length
  const meta =
    count === 1 ? t('plan.exercises_one') : t('plan.exercises', { n: String(count) })
  /*
   * No "Never run" here, and that copy was in this file for an hour.
   *
   * It rendered on all seven cards of a 163-workout account, because
   * `workouts.routine_id` is null on every finished workout in production —
   * measured 2026-08-21: 170 workouts, 2 carrying a routine, 0 of them
   * finished. Nothing in either app has ever written that column.
   *
   * So "Never run" was a claim about the LIFTER that the database could not
   * support. He has run Push four times; the record just does not connect them.
   * The app can say when a routine was last run when it knows, and it should
   * say nothing at all when it does not, rather than turning its own missing
   * foreign key into an accusation.
   */
  const when =
    routine.last_run_at === null ? null : formatRelativeDay(routine.last_run_at, locale)

  return (
    <Card style={{ gap: open ? 14 : 6, opacity: pressed ? 0.7 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          when === null
            ? `${routine.name}, ${meta}`
            : `${routine.name}, ${meta}, ${when}`
        }
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          tick()
          onToggle()
        }}
        // Static, never `({ pressed }) => ...` — see `Btn.tsx`.
        style={{ gap: 6 }}
      >
        {due ? <Kick ink="accent">{t('plan.due')}</Kick> : null}
        <Txt step="num">{routine.name}</Txt>
        <Txt step="caption" ink="muted">
          {when === null ? meta : `${meta} · ${when}`}
        </Txt>
      </Pressable>

      {open ? (
        <View style={{ gap: 10 }}>
          {routine.exercises.map((e) => (
            <View key={e.id} style={{ gap: 2 }}>
              <Txt step="title">{e.name ?? '—'}</Txt>
              {e.sets.length === 0 ? (
                <Txt step="caption" ink="muted">
                  —
                </Txt>
              ) : (
                <Txt step="caption" ink="muted" ltr>
                  {setLine(e.sets, unit)}
                </Txt>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

export default function PlanScreen() {
  const { t } = useLocale()
  const { unit } = useUnit()
  /*
   * Seeded from the config error during render rather than in an effect.
   * `eslint-plugin-react-hooks` v7 forbids the synchronous `setState` in an
   * effect, and a misconfigured build should say so on the first frame instead
   * of flashing an empty list first.
   */
  const [error, setError] = useState<string | null>(
    supabaseConfigError === null ? null : t('plan.error'),
  )
  const [routines, setRoutines] = useState<PlanRoutine[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (supabaseConfigError !== null) return
    let live = true
    void fetchRoutines()
      .then((rows) => {
        if (live) setRoutines(rows)
      })
      .catch(() => {
        if (live) setError(t('plan.error'))
      })
    return () => {
      live = false
    }
    // `t` is stable per locale; refetching on a language change is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('plan.kicker')}</Kick>

      <View style={{ gap: 12 }}>
        {error !== null ? (
          <Card>
            <Txt step="body">{error}</Txt>
          </Card>
        ) : routines === null ? (
          /* A blank frame on the right ground, not a spinner: the list is two
             round trips and a spinner that flashes for 200ms reads as jank. */
          <View style={{ height: 120 }} />
        ) : routines.length === 0 ? (
          <Empty line={t('plan.empty')}>
            <Txt step="caption" ink="muted" style={{ textAlign: 'center' }}>
              {t('plan.empty.sub')}
            </Txt>
          </Empty>
        ) : (
          <View style={{ gap: 12 }}>
            {routines.map((r, i) => (
              <RoutineCard
                key={r.id}
                routine={r}
                /* First in rotation order IS the due one — the same rule
                   `session_brief()` uses, so this card and Home's Up Next name
                   the same routine. */
                due={i === 0}
                unit={unit}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  )
}
