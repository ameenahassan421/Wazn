import { useCallback, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'

import { formatRelativeDay, formatWeight, type Unit } from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { tick } from '@/services/haptics'
import { fetchRoutines, type PlanRoutine } from '@/services/routines'
import { startWorkout, useLiveWorkout } from '@/state/live-workout'
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
 * ── AND THEY CAN BE WRITTEN HERE NOW ────────────────────────────────────────
 * Every one of the 386 routine rows in production came from the Hevy import.
 * Nothing in either app had ever WRITTEN a routine, so an account that did not
 * import from Hevy had a Plan tab that could only say "No routines yet" and a
 * coach whose rotation had nothing to rotate. `routine/[id]` is the editor.
 *
 * ── YOU CAN START ONE NOW, AND THAT IS THE WHOLE POINT ──────────────────────
 * This section used to say the opposite, because `startWorkout()` took no
 * argument and could only seed from the last logged session. It takes an
 * optional routine id now, so the card's Start opens a board shaped by THAT
 * routine and writes `workouts.routine_id`.
 *
 * That column is why it mattered. It was null on all 166 finished workouts in
 * production, and `session_brief()`'s rotation joins on it, so the due routine
 * was a constant and Home was naming a routine the account had never run.
 * Starting one from here is what fills it.
 *
 * **Start lives inside the EXPANDED card, not on the collapsed one.** Tapping a
 * routine to read it is the common act and starting one is the rare, committing
 * act; a Start button on every collapsed row would put an irreversible action
 * under the tap that means "what is in Upper Push again".
 *
 * ── ORDER IS THE ROTATION, NOT `position` ───────────────────────────────────
 * `rotationOrder` comes from the shared domain, so the list reads in the same
 * order `session_brief()` computes and the first card is the one Home calls up
 * next. L9 in the plan is the defect from getting this wrong on the web: the
 * card named a day the list underneath it did not reflect, and the obvious tap
 * was the wrong one.
 */

/**
 * "5 × 60 kg", or "5" when the plan carries no weight, or **empty** when it
 * prescribes nothing at all.
 *
 * That last case is the one this had wrong. A routine written in this app
 * stores a set COUNT and no numbers (see `routine-draft.ts`), so every set was
 * rendering as an em rule and a two-lift routine read
 * `—   —   —   —` under one lift and `—   —   —` under the other. Honest, and
 * it looks like a rendering failure. The caller shows the count instead when
 * this comes back empty, which says the same thing in words the lifter asked
 * for.
 *
 * Empty rather than null so the check at the call site is one comparison, and
 * a plan where SOME sets carry numbers still renders those.
 */
function setLine(
  sets: { reps: number | null; weight_kg: number | null }[],
  unit: Unit,
): string {
  if (sets.every((s) => s.reps === null && s.weight_kg === null)) return ''
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
  onStart,
  onEdit,
  busy,
}: {
  routine: PlanRoutine
  due: boolean
  unit: Unit
  open: boolean
  onToggle: () => void
  onStart: () => void
  onEdit: () => void
  /** A session is already running, so this card cannot start another. */
  busy: boolean
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
        <View style={{ gap: 14 }}>
          <View style={{ gap: 10 }}>
            {routine.exercises.map((e) => {
              const planned = setLine(e.sets, unit)
              return (
                <View key={e.id} style={{ gap: 2 }}>
                  <Txt step="title">{e.name ?? '—'}</Txt>
                  {e.sets.length === 0 ? (
                    <Txt step="caption" ink="muted">
                      —
                    </Txt>
                  ) : planned === '' ? (
                    /* Nothing prescribed, which is what every routine written
                       in this app looks like. The count is the whole plan, so
                       the count is what it says. NOT `ltr`: this is a
                       sentence, and Arabic reads it right to left. */
                    <Txt step="caption" ink="muted">
                      {e.sets.length === 1
                        ? t('plan.sets_one')
                        : t('plan.sets', { n: String(e.sets.length) })}
                    </Txt>
                  ) : (
                    <Txt step="caption" ink="muted" ltr>
                      {planned}
                    </Txt>
                  )}
                </View>
              )
            })}
          </View>
          {/*
            No Start while a session is running, and this was found by pressing
            it. `startWorkout` returns early when `status === 'active'` — which
            is correct, it must not clobber a session in progress — but the
            screen navigated anyway, so tapping "Start Upper Push" opened a
            board headed "Aug 20-26 Day A: Lower" with five Squat sets already
            on it. A button that performs a DIFFERENT action from the one on its
            label is worse than a button that is absent.

            The line replaces it rather than disabling it, because a greyed
            button invites a press and then explains nothing.
          */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {busy ? (
              <Txt step="caption" ink="muted" style={{ flex: 1 }}>
                {t('plan.busy')}
              </Txt>
            ) : (
              <Btn
                kind="hero"
                label={t('plan.start', { name: routine.name })}
                onPress={onStart}
                style={{ flex: 1 }}
              />
            )}
            {/* Edit stays reachable during a live session. It writes to the
                routine, not to the board, so there is nothing for it to
                clobber, and hiding it would make the control appear and
                disappear for a reason a lifter cannot see. */}
            <Btn kind="line" small label={t('plan.edit')} onPress={onEdit} />
          </View>
        </View>
      ) : null}
    </Card>
  )
}

export default function PlanScreen() {
  const { t } = useLocale()
  const { unit } = useUnit()
  const router = useRouter()
  const live = useLiveWorkout()
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

  /*
   * On FOCUS, not on mount.
   *
   * The editor and the board are both routes pushed over this one, so this
   * screen stays mounted while a routine is created, renamed, deleted, or run.
   * A mount effect therefore showed a list that was correct exactly once, and
   * saving a new routine returned the lifter to a tab that did not have it.
   *
   * The previous rows are kept while the refetch is in flight, so a focus does
   * not blank the list.
   */
  useFocusEffect(
    useCallback(() => {
      if (supabaseConfigError !== null) return
      let live = true
      void fetchRoutines()
        .then((rows) => {
          if (!live) return
          setRoutines(rows)
          /*
           * Cleared on success, and it was not until the review caught it.
           * The render checks `error` BEFORE `routines`, so one failed fetch
           * pinned the error card for the rest of the app session even as
           * every later refetch succeeded behind it. On a mount effect that
           * took a failed launch to reach; on a focus effect every tab switch
           * is another chance to enter a state nothing can leave.
           */
          setError(null)
        })
        .catch(() => {
          if (live) setError(t('plan.error'))
        })
      return () => {
        live = false
      }
      // `t` is stable per locale; refetching on a language change is not wanted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

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
            {/* `alignSelf` because `Btn` sets its own to `flex-start`, which
                beats `Empty`'s `alignItems: center` and left-flushes the pill
                under centred copy. Seen on a simulator; this is the first
                caller ever to put a button in that slot. */}
            <Btn
              kind="hero"
              label={t('plan.new')}
              onPress={() => router.push('/routine/new')}
              style={{ alignSelf: 'center' }}
            />
            {/* The door to `/routine/generate`, which shipped with none and
                was therefore reachable by nothing: 305 lines of screen and 22
                strings per locale that no user could get to, and `plan.generate`
                sitting in both catalogues used zero times.

                It belongs HERE most of all. The generate screen exists for
                exactly this state, an account that did not import from Hevy
                opening Plan to "No routines yet" with nothing that can fill
                it. `line` rather than a second `hero`, because the ember is
                one per screen. */}
            <Btn
              kind="line"
              label={t('plan.generate')}
              onPress={() => router.push('/routine/generate')}
              style={{ alignSelf: 'center' }}
            />
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
                busy={live.status === 'active'}
                onStart={() => {
                  void startWorkout(r.id)
                  router.push('/session/new')
                }}
                onEdit={() => router.push(`/routine/${r.id}`)}
              />
            ))}
            {/* `line`, not `hero`. The ember is one-per-screen and it belongs
                to Start inside the open card: writing a routine is the rare
                act here and running one is the daily act. The empty state
                inverts this, correctly, because there is nothing to run. */}
            <Btn
              kind="line"
              full
              label={t('plan.new')}
              onPress={() => router.push('/routine/new')}
            />
            <Btn
              kind="line"
              full
              label={t('plan.generate')}
              onPress={() => router.push('/routine/generate')}
            />
          </View>
        )}
      </View>
    </Screen>
  )
}
