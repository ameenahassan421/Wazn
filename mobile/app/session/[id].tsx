import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line, Path, Rect } from 'react-native-svg'

import {
  describeBarMath,
  ghostChip,
  fromDisplayWeight,
  platesFor,
  seedWeight,
  verdictFor,
  radius,
  space,
  toDisplayWeight,
} from '@wazn/domain'

import { FinishSummary } from '@/components/FinishSummary'
import { RestCanvas } from '@/components/RestCanvas'
import { Btn, ChipBtn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Plate } from '@/components/ui/Plate'
import { Txt } from '@/design/Txt'
import { useCoach } from '@/hooks/use-coach'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { banked as hapticBanked, tick } from '@/services/haptics'
import { usePalette } from '@/hooks/use-theme'
import {
  adjustRest,
  bankCurrentSet,
  endRest,
  finishWorkout,
  resetWorkout,
  selectBoardView,
  setCurrentSetType,
  startWorkout,
  toggleCurrentSuperset,
  useLiveWorkout,
} from '@/state/live-workout'

/**
 * The live board, against `docs/design/prototype/source.html` — the screen
 * labelled "Workout". The screen the app exists for.
 *
 * ── THE SHAPE CHANGED, AND THE 48px FLOOR DID NOT ───────────────────────────
 * v5 gave each stepper a full-bleed row with 82px minus and plus zones, and
 * this file argued for it: a stepper pair sharing 390px leaves each target
 * under the floor. The prototype puts BOTH in one row, as two cards with 46px
 * keys, and 46 is under 48.
 *
 * It is drawn at 46 and `hitSlop` brings the target to 48 — the same honest
 * technique `Btn` uses for its small variant. The ink is the prototype's, the
 * target is the plan's, and neither is compromised.
 *
 * The figure between the keys is `flex: 1` rather than intrinsic, and shrinks
 * its own text. The prototype is drawn at 430pt wide; on a 375pt phone the
 * reps card's inner width falls to about 20pt and a two-digit figure at 29px
 * would overflow it. Flexing degrades instead of clipping.
 *
 * ── WHAT THE PROTOTYPE DROPPED, AND THIS DROPS WITH IT ──────────────────────
 * The momentum bar. It answered "am I winning" and it WORKED — `view.pct` is
 * real, from the last session's volume — so unlike Home's three tiles this is
 * a live feature being removed rather than dead chrome. The prototype's board
 * has no slot for it and inventing one would be the reskin this migration
 * exists to avoid. Recorded in WAZN_PLAN 7.0 for Ameen rather than quietly
 * relocated: the Finish screen's stat tiles are the obvious new home.
 *
 * ── WHAT IS NOT DRAWN, FOR WANT OF DATA ─────────────────────────────────────
 * The exercise thumbnail (no image pipeline on native) and the equipment word
 * (`deriveEquipment` needs a muscle group the board does not carry). Each is a
 * hole in the layout rather than a placeholder, for the reason Home gives.
 *
 * This list used to name the coach's sentence too, and had gone stale: the
 * ghost was wired to this board on 2026-08-23 and renders above the logged
 * rows. A comment that describes a hole somebody has already filled is how
 * WAZN_PLAN 7.0 ends up claiming work is outstanding after it shipped.
 */

/**
 * The RPE scale as a lifter actually uses it.
 *
 * Six to ten, not one to ten. RPE below 6 describes a set nobody logs an
 * effort rating for, and every extra chip is width this row does not have on a
 * 375pt phone.
 */
const RPE_CHOICES = [6, 7, 8, 9, 10] as const

/** The prototype's back chevron, at its own weight. */
function BackChevron() {
  const palette = usePalette()
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M14 5l-7 7 7 7"
        fill="none"
        stroke={palette.ink}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/**
 * A loaded bar, seen from the side. Decorative and deliberately so: the
 * NUMBERS beside it are the instruction, and this says at a glance which of
 * the two lines on the card is the one about the bar.
 */
function Barbell() {
  const palette = usePalette()
  return (
    <Svg width={110} height={44} viewBox="0 0 120 52">
      <Line
        x1={4}
        y1={26}
        x2={116}
        y2={26}
        stroke={palette.ink}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <Rect x={30} y={3} width={11} height={46} rx={3} fill={palette.accent} />
      <Rect x={45} y={16} width={7} height={20} rx={2.5} fill={palette.ink} />
      <Rect
        x={14}
        y={19}
        width={9}
        height={14}
        rx={2}
        fill={palette.ink}
        opacity={0.25}
      />
    </Svg>
  )
}

/** One half of the stepper row. 46px keys, 48px targets. */
function Stepper({
  label,
  value,
  flex,
  onDown,
  onUp,
}: {
  label: string
  value: string
  flex: number
  onDown: () => void
  onUp: () => void
}) {
  const palette = usePalette()
  const key = {
    width: 46,
    height: 46,
    borderRadius: radius.ctl,
    backgroundColor: palette.paper,
    alignItems: 'center',
    justifyContent: 'center',
  } as const
  return (
    <Card small style={{ flex, paddingVertical: 11, paddingHorizontal: 14 }}>
      <Txt step="nano" ink="muted" style={{ marginBottom: 5 }}>
        {label}
      </Txt>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* 46 drawn, 48 pressed: `(48 - 46) / 2` on every edge. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="−"
          hitSlop={1}
          onPress={onDown}
          style={key}
        >
          <Txt step="glyph">−</Txt>
        </Pressable>
        <Txt
          step="fig"
          ltr
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ flex: 1, textAlign: 'center' }}
        >
          {value}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="+"
          hitSlop={1}
          onPress={onUp}
          style={key}
        >
          <Txt step="glyph">+</Txt>
        </Pressable>
      </View>
    </Card>
  )
}

export default function LiveWorkout() {
  /**
   * The screen stays on for as long as this board is mounted.
   *
   * The default lock is 30 seconds on a new iPhone and this app's one sentence
   * is "log a set in under thirty seconds, one hand" — so the lifter racks the
   * bar, rests, and comes back to Face ID with chalk on their hands. Every
   * competitor holds the screen awake here; the dependency has been installed
   * and called zero times since the native app existed.
   *
   * Scoped to the board rather than the app, and to the whole session rather
   * than just the rest timer: it releases on unmount, so Finish and every
   * other route lock normally, and a mid-set edit is as much a reason to stay
   * lit as the countdown is.
   */
  useKeepAwake()

  const palette = usePalette()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useLocale()
  const { unit, ready } = useUnit()
  const { mode, speaks, thinks } = useCoach()
  const live = useLiveWorkout()
  const view = selectBoardView(live)

  const done = (view.exercise?.sets ?? []).filter((s) => s.done)
  /**
   * The ghost reasons about WORKING sets, which is `verdictFor`'s own stated
   * contract (`ghost-reason.ts:89`, "Working sets already committed today").
   *
   * That was a distinction without a difference while every set was `'normal'`.
   * The moment the board can hold a warm-up it is a real one: a 40 × 10 off an
   * empty bar inside `committed` reads to the coach as the lifter falling
   * short of their 100 × 5, and the sentence it draws from that tells them to
   * take weight OFF.
   */
  const working = done.filter((row) => row.type !== 'warmup')

  /**
   * The ghost. The thing that makes this a coach and not a spreadsheet.
   *
   * ── IT WAS BUILT AND TESTED AND NOTHING CALLED IT ───────────────────────
   * `verdictFor` has been in `src/lib/ghost-reason.ts`, exported through
   * `@wazn/domain`, with its own suite, since before this app existed — and
   * every native screen rendered `null` where its sentence belongs. v5's
   * handoff is titled "full app redesign + AI layer" and weaves the coach
   * through every moment; the migration shipped the moments and skipped the
   * coach.
   *
   * Every number below is COMPUTED. No model sits on this path — that is the
   * standing rule (CLAUDE.md: "the model never sits on the critical path",
   * "statistics answer anything statistics can answer"), and it is also why
   * this works offline in a basement.
   */
  /*
   * `thinks`, not `speaks`. Quiet keeps the arithmetic and loses the sentence,
   * so the verdict is still computed here and only the chip below is gated on
   * `speaks`. Collapsing the two would either leave the coach talking with the
   * dial Off or strip a silenced app of the ghosts it had before v3.
   */
  const verdict =
    view.exercise === null || view.set === null || !thinks
      ? null
      : verdictFor(view.set.setNumber - 1, {
          mode,
          // Seeded in `startWorkout` from today's check-in and the gap since
          // the last session, and frozen there. This was
          // `computeReadiness({ checkIn: null, daysRested: null })` — a
          // hardcoded Normal — which made Home's three check-in chips write a
          // row and change nothing.
          readiness: live.readiness,
          previous: view.exercise.sets.map((row) => ({
            weightKg: row.previousKg,
            reps: row.previousReps,
          })),
          committed: working.map((row) => ({
            weightKg: row.weightKg,
            reps: row.reps,
            label: String(row.setNumber),
          })),
          // A plate increment, not a percentage. `weightStep` is the same jump
          // the ± keys make, so the coach never proposes a load the lifter
          // cannot actually build.
          // The same jump the ± keys make, so the coach never proposes a
          // load the lifter cannot actually build. Inlined rather than reusing
          // `weightStep`, which is declared after the `ready` guard: the ghost
          // is computed during render, before it.
          incrementKg: fromDisplayWeight(unit === 'kg' ? 2.5 : 5, unit),
        })

  const chip =
    verdict === null || verdict.cause === 'none' || !speaks ? null : ghostChip(verdict)

  /** The coach's one sentence, phrased once and read by the board AND the rest
   *  canvas — they are the same verdict about the same set. */
  const chipText =
    chip === null
      ? null
      : t(chip.key, {
          weight:
            chip.weightKg === null ? '—' : String(toDisplayWeight(chip.weightKg, unit)),
          label: chip.label,
          run: chip.run.join('/'),
          reps: String(chip.reps ?? ''),
        })

  /**
   * Dialled values, keyed by the set they belong to.
   *
   * Adjusted during render rather than in an effect: when the position moves
   * the seeded values ARE the answer on the first frame, and an effect that
   * set them would paint the previous set's numbers first.
   */
  const key =
    view.position === null
      ? ''
      : `${view.position.exerciseIndex}-${view.position.setIndex}`
  const [dialled, setDialled] = useState<{
    key: string
    weightKg: number | null
    reps: number | null
    /** Cleared on every move, never carried. See `BoardSet.rpe`. */
    rpe: number | null
  }>({
    key,
    weightKg: view.set?.weightKg ?? null,
    reps: view.set?.reps ?? null,
    rpe: null,
  })

  if (dialled.key !== key) {
    /*
     * Seeded from the new set when it HAS numbers, carried forward from the
     * last ones when it does not.
     *
     * A board seeded from history gives every set the previous session's
     * numbers, so the first branch is the normal case. A lift added mid-session
     * has none — and resetting to null there meant banking set 1 at 60×8 and
     * finding set 2 showing 0, which is GATE U2's one-tap repeat turning into
     * eight taps on the `+`. "The stepper KEEPS them" is the gate; this is
     * where it is kept.
     */
    /*
     * ── AND THE COACH GETS TO MOVE THE NUMBER, SINCE 2026-08-23 ─────────────
     * `verdict` already factors today's check-in: `readiness` is seeded in
     * `startWorkout` from `daily_checkins` and passed into `verdictFor` above.
     * Until now it reached only the CHIP. The board said "raise to 62.5" in
     * words and dialled 60, so the app asked how you felt, worked out what to
     * do about it, told you, and then made you press `+` yourself.
     *
     * That is the whole differentiator, one wire short. Fitbod cannot ask how
     * you feel because automation is what it sells; Hevy publicly chose not to
     * coach. The claim only holds if the answer moves the bar.
     *
     * It is NOT model output, so nothing here breaks the rule that a model
     * never writes without a press: `verdictFor` is deterministic TypeScript
     * over the lifter's own sets, and the number is a proposal in an editable
     * field that banks nothing until they commit it.
     *
     * `null` falls through, which is the common case: `verdict.weightKg` is
     * null whenever the ghost has no opinion (`cause: 'none'`, a first-ever
     * lift, the coach dialled off), and the previous behaviour stands.
     */
    setDialled({
      key,
      weightKg: verdict?.weightKg ?? seedWeight(view.set, dialled.weightKg),
      reps: verdict?.reps ?? view.set?.reps ?? dialled.reps,
      /*
       * Null on every move, and deliberately unlike the two above it. Weight
       * and reps are a PRESCRIPTION worth carrying: repeating them is the
       * one-tap path GATE U2 measures. RPE is a READING of a set that has not
       * happened yet, and carrying the last one forward would put a number the
       * lifter did not choose into their own record of effort — the same error
       * as seeding a starting weight they never picked.
       */
      rpe: null,
    })
  }

  /**
   * Start a workout when this route opens, and ONLY then.
   *
   * Keyed on `live.status` it re-fired the moment "Done" reset the store to
   * idle — starting a fresh workout, checkpointing it, and persisting it,
   * one render before `router.back()` had a chance to leave. Opening the route
   * is the event; the status is not.
   */
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (live.status === 'idle') void startWorkout()
  }, [live.status])

  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    if (live.startedAt === 0) return
    const render = () => {
      const secs = Math.floor((Date.now() - live.startedAt) / 1000)
      setElapsed(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)
    }
    render()
    // Painted once, then frozen: a finished workout's duration is a fact, and
    // the summary's first tile counted upwards forever without this.
    if (live.status !== 'active') return
    const id = setInterval(render, 1000)
    return () => {
      clearInterval(id)
    }
  }, [live.startedAt, live.status])

  if (!ready) return <View style={{ flex: 1, backgroundColor: palette.paper }} />

  if (live.status === 'finished') {
    return (
      <FinishSummary
        elapsed={elapsed}
        volumeKg={view.banked}
        targetKg={live.targetKg}
        unit={unit}
        workoutId={live.workoutId}
        sealed={live.sealed}
        rows={live.board.flatMap((exercise) =>
          exercise.sets
            .filter((row) => row.done)
            .map((row) => ({
              exercise: exercise.name,
              setNumber: row.setNumber,
              type: row.type,
              weightKg: row.weightKg,
              reps: row.reps,
            })),
        )}
        onDone={() => {
          resetWorkout()
          router.back()
        }}
      />
    )
  }

  const weightStep = unit === 'kg' ? 2.5 : 5
  /*
   * From the EXERCISE, not from the dialled value.
   *
   * This was `view.set.weightKg === null`, and those are different questions:
   * a null weight means either "this is a pull-up" or "there is no history to
   * pre-dial". `seedBoard` produces the second for every set of a lift the
   * lifter has never done, so the weight stepper vanished and the lift could
   * not be given a weight at all. Seen on a simulator as Squat set 6 of 6.
   *
   * The `??` keeps the old rule for a checkpoint written before `bodyweight`
   * existed on the board. Those restore without the field, and falling back to
   * the previous behaviour is better than treating every restored exercise as
   * loaded.
   */
  const bodyweight =
    view.exercise?.bodyweight ?? (view.set !== null && view.set.weightKg === null)
  const warmup = view.set?.type === 'warmup'
  const shown = toDisplayWeight(dialled.weightKg ?? 0, unit)
  const load = bodyweight ? null : platesFor(shown, unit)

  /**
   * What the button says it is about to do.
   *
   * The type belongs in the LABEL and not only in the chip above it: the label
   * is the last thing read before the tap, and this screen cannot take the row
   * back afterwards — `markSetType` refuses a banked set, because by then it is
   * in Postgres and the board has no update path.
   *
   * A warm-up loses its set number on purpose. `set_number` stays what it is on
   * the row; but the number a lifter READS is a working-set count everywhere
   * else in the app, and "Log set 3" under an empty bar is exactly the label
   * that teaches somebody to stop believing the screen.
   */
  const commitLabel =
    view.position === null
      ? t('log.finish')
      : warmup
        ? bodyweight
          ? t('workout.log_warmup_reps', { reps: String(dialled.reps ?? 0) })
          : t('workout.log_warmup', {
              weight: String(shown),
              reps: String(dialled.reps ?? 0),
            })
        : bodyweight
          ? t('workout.log_set_reps', {
              n: String(view.set?.setNumber ?? 0),
              reps: String(dialled.reps ?? 0),
            })
          : t('workout.log_set', {
              n: String(view.set?.setNumber ?? 0),
              weight: String(shown),
              reps: String(dialled.reps ?? 0),
            })

  function step(field: 'weightKg' | 'reps', direction: 1 | -1) {
    tick()
    setDialled((d) => {
      if (field === 'reps') {
        return { ...d, reps: Math.max(1, (d.reps ?? 0) + direction) }
      }
      const next = Math.max(
        0,
        toDisplayWeight(d.weightKg ?? 0, unit) + direction * weightStep,
      )
      return { ...d, weightKg: fromDisplayWeight(next, unit) }
    })
  }

  function bank() {
    // The haptic and the board move together, before anything is asked of the
    // network. `bankCurrentSet` is synchronous for exactly this reason.
    hapticBanked()
    bankCurrentSet(dialled.weightKg, dialled.reps, dialled.rpe)
  }

  /**
   * Finish ENDS the workout; it does not leave the screen.
   *
   * `finishWorkout` sets `status: 'finished'` and drains the queue, and this
   * screen switches to the summary. Resetting and popping here — which is what
   * it did until 2026-08-21 — threw the session away before the lifter had
   * seen a single number about it.
   */
  function finish() {
    void finishWorkout()
  }

  const banked = live.board.reduce(
    (n, e) => n + e.sets.filter((row) => row.done).length,
    0,
  )
  /**
   * The superset the lifter is inside, and who else is in it.
   *
   * ── PAIRED WITH THE NEXT LIFT, NOT WITH ONE PICKED FROM A LIST ───────────
   * A superset is two adjacent things on the board. Offering a picker would be
   * a rewrite of the running order dressed up as a pairing, and it would cost
   * a modal on the one screen this app refuses to put modals on.
   *
   * So the control is binary and reads as a sentence: "Superset with Barbell
   * Row", or "Break up the superset". `toggleSuperset` in the shared domain
   * holds the rule that a group of one dissolves rather than lingering.
   */
  const groupId = view.exercise?.supersetGroup ?? null
  const partnerNames = live.board
    .filter(
      (e) =>
        groupId !== null &&
        e.supersetGroup === groupId &&
        e.exerciseId !== view.exercise?.exerciseId,
    )
    .map((e) => e.name)
  const pairWith =
    view.position === null || groupId !== null
      ? null
      : (live.board[view.position.exerciseIndex + 1] ?? null)

  const previous = (view.exercise?.sets ?? [])
    .filter((s) => s.previousReps !== null)
    .map((s) =>
      s.previousKg === null
        ? `${s.previousReps}`
        : `${toDisplayWeight(s.previousKg, unit)}×${s.previousReps}`,
    )
    .join(' · ')

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper, paddingTop: insets.top }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingTop: 10,
          paddingBottom: 12,
          paddingHorizontal: space.gutter,
        }}
      >
        <Pressable
          accessibilityRole="button"
          // English-only, and the only untranslated string on this screen.
          // `common.back` is not in the catalogue and minting a key for a
          // VoiceOver label on a control that already shows a chevron is more
          // catalogue than it is worth. Revisit with the RTL pass.
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => router.back()}
          style={{
            width: space.back,
            height: space.back,
            borderRadius: radius.pill,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.ring,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BackChevron />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Txt step="cta" numberOfLines={1}>
            {live.name === '' ? t('log.workout_fallback') : live.name}
          </Txt>
          <Txt step="meta" ink="muted" ltr style={{ marginTop: 2 }}>
            {/* "exercise 1 of 0" until 2026-08-21, on the first workout of
                every new account. The counter only makes sense once there IS
                a board. */}
            {live.board.length === 0
              ? elapsed
              : `${elapsed} · ${t('workout.exercise_of', {
                  n: String((view.position?.exerciseIndex ?? 0) + 1),
                  total: String(live.board.length),
                })}`}
          </Txt>
        </View>

        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={finish}
          style={{
            height: 40,
            paddingHorizontal: 16,
            borderRadius: radius.pill,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.ringStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt step="pill">{t('log.finish')}</Txt>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          gap: 11,
          paddingBottom: 8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Nothing to log against ──────────────────────────────────────
            The board is seeded from the LAST session, so it is empty on the
            first workout of a new account — and the prototype has no empty
            state for this screen, because its demo always has a bench press.
            An empty white card is not a design, it is a hole, so this says
            what is true and offers the one thing that resolves it.

            THIS COMMENT USED TO SAY "native has no way to ADD an exercise,
            which makes this a dead end rather than an empty state", directly
            above the button that adds an exercise. `session/add.tsx` shipped,
            with a search over the catalogue AND a create path for a lift that
            is not in it. The picker is not empty for a new account either:
            `exercises` holds 135 rows with `owner_id is null`, and
            `exercises_select_visible` grants every authenticated user those
            plus their own (read from production 2026-08-23).

            The sentence outlived the gap it described, and WAZN_PLAN's v1
            table still carries it as "day one is a dead end", which is the
            exact way this repo keeps convincing itself work is outstanding
            after it shipped. */}
        {live.board.length === 0 ? (
          <Card style={{ paddingVertical: 20, paddingHorizontal: 18, gap: 14 }}>
            <Txt step="title">{t('log.empty')}</Txt>
            <Btn
              kind="ink"
              full
              label={t('log.add_exercise')}
              onPress={() => router.push('/session/add')}
            />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 14, paddingHorizontal: 18 }}>
            {/* `flexShrink` on the name and no `flex` on the row's children:
                a flexed Text in Arabic swallows the free space without putting
                its content on the start edge, which has shipped twice. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt step="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                {view.exercise?.name ?? ''}
              </Txt>
              {groupId !== null && (
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: palette.ringStrong,
                  }}
                >
                  <Txt step="nano" ink="muted">
                    {t('workout.superset.badge', { n: String(groupId) })}
                  </Txt>
                </View>
              )}
            </View>
            <Txt step="meta" ink="muted" ltr style={{ marginTop: 3 }}>
              {t('workout.set_of', {
                n: String(view.set?.setNumber ?? 0),
                total: String(view.exercise?.sets.length ?? 0),
              })}
            </Txt>

            {/* Said out loud rather than left to the badge. "No rest between
                them" is the whole behavioural consequence of the pairing, and
                a lifter who does not expect the rest canvas to be skipped will
                read its absence as a bug. */}
            {partnerNames.length > 0 && (
              <Txt step="caption" ink="muted" style={{ marginTop: 8 }}>
                {t('workout.superset.paired', { name: partnerNames.join(' · ') })}
              </Txt>
            )}

            {previous !== '' && (
              <Txt step="meta" ink="muted" ltr style={{ marginTop: 12 }}>
                {`${t('workout.previous')}  ${previous}`}
              </Txt>
            )}

            {/* The coach's one line, above the log. One sentence, one chip —
              the doctrine v5 states and this app had nowhere on native. It is
              absent rather than empty when there is nothing computed to say:
              `cause: 'none'` is the honest silence, not a bug. */}
            {chip !== null && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  alignItems: 'center',
                  marginTop: 12,
                }}
              >
                <Plate size={18} variant="hub" color={palette.ink} />
                <Txt step="meta" ink={chip.raised ? 'accentSoft' : 'muted'} ltr>
                  {t(chip.key, {
                    weight:
                      chip.weightKg === null
                        ? '—'
                        : String(toDisplayWeight(chip.weightKg, unit)),
                    label: chip.label,
                    run: chip.run.join('/'),
                    reps: String(chip.reps ?? ''),
                  })}
                </Txt>
              </View>
            )}

            {done.length > 0 && (
              <View style={{ gap: 6, marginTop: 8 }}>
                {done.map((s) => (
                  <View
                    key={s.setNumber}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <Plate size={16} />
                    <Txt step="dataLg" ink="muted" ltr style={{ width: 36 }}>
                      {s.setNumber}
                    </Txt>
                    {/* A banked row cannot be retyped from this board, so the
                        list is the only place a mistyped set can be SEEN. It
                        is muted and named rather than merely styled: a lifter
                        who reads back four grey rows has to be told which of
                        them the coach and the records are ignoring. */}
                    <Txt step="dataLg" ink={s.type === 'warmup' ? 'muted' : 'ink'} ltr>
                      {s.weightKg === null
                        ? `${s.reps}`
                        : `${toDisplayWeight(s.weightKg, unit)} ${unit} × ${s.reps}`}
                    </Txt>
                    {s.type === 'warmup' && (
                      <Txt step="nano" ink="muted">
                        {t('workout.warmup')}
                      </Txt>
                    )}
                    {/* The only place a banked RPE can be READ. The board has
                        no update path for a committed row, so if this list did
                        not show it the number would go into Postgres and
                        disappear from the lifter's session entirely.

                        `typeof === 'number'`, NOT `!== null`. A workout that
                        was in progress when this shipped restores from a
                        checkpoint written before the field existed, so `rpe`
                        comes back UNDEFINED — which is not null, so the row
                        rendered the literal string "RPE UNDEFINED". Seen on a
                        simulator within a minute of the feature working, and
                        invisible to every check in the repo because no test
                        restores a checkpoint from the previous build. */}
                    {typeof s.rpe === 'number' && (
                      <Txt step="nano" ink="muted" ltr>
                        {`RPE ${s.rpe}`}
                      </Txt>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* ── The two dials ───────────────────────────────────────────────
            1.3 to 1, the prototype's ratio: a weight can be 102.5 and a rep
            count is almost never three digits. */}
        {live.board.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!bodyweight && (
              <Stepper
                flex={1.3}
                label={t('workout.weight', { unit })}
                value={String(shown)}
                onDown={() => step('weightKg', -1)}
                onUp={() => step('weightKg', 1)}
              />
            )}
            <Stepper
              flex={1}
              label={t('workout.reps')}
              value={String(dialled.reps ?? 0)}
              onDown={() => step('reps', -1)}
              onUp={() => step('reps', 1)}
            />
          </View>
        )}

        {/* ── Warm-up or working ──────────────────────────────────────────
            Under the dials, not in the card header and not in the commit
            cluster. Three reasons, in the order they mattered:

            It qualifies the two numbers directly above it, and this is the one
            place it can sit adjacent to them. It is a thumb's reach from the
            commit button without floating over the rest canvas the way the
            sticky cluster does (z-31, deliberately). And it is a CHIP rather
            than a switch because selected-is-an-ink-fill is how this system
            already draws a state that is not an action — ember stays with the
            one thing you press.

            Not sticky across sets, which is where the web app went (`SetEntry`
            keeps a chosen warm-up after commit). A stuck flag deletes working
            volume silently and permanently; three taps across a warm-up run,
            on the unhurried half of a session, is the cheaper failure. History
            does the work anyway — `seedBoard` carries last session's types. */}
        {live.board.length > 0 && view.set !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ChipBtn
              label={t('workout.warmup')}
              selected={warmup}
              onPress={() => setCurrentSetType(warmup ? 'normal' : 'warmup')}
            />
            {/* `caption`, not `nano`. Both are small and muted and only one of
                them is a VOICE: `nano` is the tracked uppercase mono this
                system labels machines with (WEIGHT · LBS, ON THE BAR), and a
                sentence set in it renders as "OUT OF VOLUME, RECORDS AND THE
                COACH." — prose, shouted, in the typeface reserved for plate
                maths. Caught on a simulator; the same defect as the offline
                queue line, in the same file, three weeks apart. */}
            {warmup && (
              <Txt step="caption" ink="muted" style={{ flex: 1 }}>
                {t('workout.warmup_note')}
              </Txt>
            )}
          </View>
        )}

        {/* ── How hard it felt ────────────────────────────────────────────
            `workout_sets.rpe` has had a column since migration 0001 and no
            client has ever written to it, so every row in production is null.
            This is the control that changes that.

            OPTIONAL, and the design has to say so without a word: there is no
            default, no pre-selection and no "none" chip. Nothing is chosen
            until something is tapped, and tapping the chosen one again clears
            it. A required RPE would tax the commonest path in the app for a
            number most lifters do not track, which is the trade this screen
            exists to refuse.

            Under the dials with the warm-up chip, because it qualifies the two
            numbers above it, and BEFORE the plate maths, because plate maths
            is read while loading the bar and this is answered after the set.

            Six to ten. Below six is not a working set anybody records, and a
            wider range would wrap the row onto a second line on a 375pt
            phone. */}
        {live.board.length > 0 && view.set !== null && !warmup && (
          <View style={{ gap: 8 }}>
            <Txt step="nano" ink="muted">
              {t('workout.rpe')}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RPE_CHOICES.map((value) => (
                <ChipBtn
                  key={value}
                  label={String(value)}
                  selected={dialled.rpe === value}
                  // Tapping the chosen one clears it. There is no "none" chip
                  // because "not said" is the state you START in, and a chip
                  // for it would suggest the field had to be answered.
                  onPress={() =>
                    setDialled((d) => ({ ...d, rpe: d.rpe === value ? null : value }))
                  }
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Superset ────────────────────────────────────────────────────
            A `ghost` button and not a chip: this is an ACTION on the running
            order, not a state of the set in front of you, and this system
            keeps those apart — the warm-up and RPE chips fill with ink when
            selected, and ember stays with the one thing you press to commit.

            `line` and not `ghost`, which is where it started and which a
            simulator killed in one screenshot: a ghost button is chrome-less
            by design, so "Superset with Bench Press (Barbell)" sat alone on
            the page in bold and read as a SECTION HEADING. A control nobody
            can tell is a control is worse than no control, and under load
            nobody experiments.

            It sits with the add-exercise button because both change the board
            rather than the set, and below the commit cluster's reach so a
            thumb going for the hero cannot catch it. */}
        {(pairWith !== null || groupId !== null) && (
          <Btn
            kind="line"
            small
            label={
              groupId !== null
                ? t('workout.superset.break')
                : t('workout.superset.with', { name: pairWith?.name ?? '' })
            }
            onPress={toggleCurrentSuperset}
          />
        )}

        {/* ── What to hang on the bar ─────────────────────────────────────
            `platesFor` returns null under the bar's own weight, which is not
            an error — it is a bar with nothing on it, and saying so is more
            use than an empty card. `short` is the case the prototype ignores:
            plates that cannot make the number exactly. A lifter who loads what
            this printed and logs what they dialled has a wrong record, so it
            is said out loud. */}
        {load !== null && (
          <Card
            small
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              paddingVertical: 12,
              paddingHorizontal: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Txt step="nano" ink="muted" style={{ marginBottom: 3 }}>
                {t('workout.on_the_bar')}
              </Txt>
              <Txt step="strong" ltr>
                {load.perSide.length === 0
                  ? t('workout.empty_bar')
                  : describeBarMath(load)}
              </Txt>
              {load.remainder > 0 && (
                <Txt step="meta" ink="accentSoft" ltr style={{ marginTop: 3 }}>
                  {t('workout.short_by', {
                    amount: `${Number(load.remainder.toFixed(2))} ${unit}`,
                  })}
                </Txt>
              )}
            </View>
            <Barbell />
          </Card>
        )}

        {/* Adding is a `line` button, not the hero: the hero is the set in
            front of you. It sits under the board rather than in the header so
            a thumb reaching for it cannot hit Finish. */}
        {live.board.length > 0 && (
          <Btn
            kind="line"
            full
            label={t('log.add_exercise')}
            onPress={() => router.push('/session/add')}
          />
        )}

        {/* The queue, said plainly. These sets are on the phone and will be
            retried; "saved" is a promise the store can now keep.

            It was a raw English template literal, and prose at that — a full
            sentence in `step="meta"`, which is IBM Plex Mono, this system's
            machine voice. Two defects in one line: an Arabic lifter read
            English mid-workout, and the one place the app talks to somebody
            under a bar did it in the typeface reserved for plate maths.
            Now a catalogue key, and now dot-separated status, which is what
            `meta` is actually for. */}
        {live.pending.length > 0 && (
          <Txt step="meta" ink="muted" ltr>
            {t('log.sync.pending', { count: String(live.pending.length) })}
          </Txt>
        )}
      </ScrollView>

      {/* ── The one action ──────────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 26),
          paddingHorizontal: space.gutter,
          /*
           * 31, against the rest canvas's 29 — the same pair the web app has
           * used since v5 (`SetEntry.tsx:640` and `RestExpanded.tsx:126`).
           *
           * It is what lets the canvas be a real surface with its own controls
           * while a repeat set stays ONE tap: the commit button is never
           * covered, so the finger goes where it already knows to go and the
           * rest ends on the way past. Lowering this number is a two-tap
           * regression on the app's only stated metric.
           */
          zIndex: 31,
        }}
      >
        <Pressable
          accessibilityRole="button"
          /*
           * A set with no reps is not a set.
           *
           * The button was live at 0 reps and wrote `reps: 0` rows — caught in
           * a finish summary reading "Bench Press · Set 2   0 × 0". Nothing
           * downstream can use one: `estimatedOneRepMax` refuses it, volume
           * counts it as nothing, and it still occupies a set number forever.
           * Finishing stays available, which is the other thing this button
           * does.
           */
          disabled={view.position !== null && (dialled.reps ?? 0) < 1}
          onPress={view.position === null ? finish : bank}
          style={{
            height: space.ctaLive,
            borderRadius: radius.pill,
            backgroundColor: palette.accent,
            opacity: view.position !== null && (dialled.reps ?? 0) < 1 ? 0.45 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 11,
            shadowColor: palette.accent,
            shadowOpacity: 0.35,
            shadowOffset: { width: 0, height: 10 },
            shadowRadius: 13,
            elevation: 8,
          }}
        >
          <Plate size={20} color={palette.onInk} />
          <Txt step="cta" ink="onInk" ltr>
            {commitLabel}
          </Txt>
        </Pressable>
      </View>

      {/* Screen 08. Still the v5 canvas — the prototype draws a Rest screen of
          its own and it is the next one built. Kept wired rather than removed:
          a rest timer that stops working between two commits is a regression a
          lifter feels immediately. */}
      {live.restEndsAt !== null && (
        <RestCanvas
          endsAt={live.restEndsAt}
          total={live.restTotal}
          title={live.name === '' ? t('log.workout_fallback') : live.name}
          loggedLabel={`${elapsed} · ${t('workout.logged', {
            n: String(banked),
          })}`}
          /*
           * The same verdict the board is showing, phrased for the canvas.
           *
           * It is the NEXT set's reasoning by construction: `view.set` has
           * already moved on by the time a rest starts, so the sentence a
           * lifter reads while resting is about the set they are about to do,
           * which is what v5 screen 08 specifies. Gated on `speaks` with
           * everything else — a quiet canvas is a ring and a clock.
           */
          coachLine={chipText}
          onSkip={endRest}
          onAdjust={adjustRest}
        />
      )}
    </View>
  )
}
