import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line, Path, Rect } from 'react-native-svg'

import {
  describeBarMath,
  ghostChip,
  fromDisplayWeight,
  palette,
  platesFor,
  seedWeight,
  verdictFor,
  radius,
  space,
  toDisplayWeight,
} from '@wazn/domain'

import { FinishSummary } from '@/components/FinishSummary'
import { RestCanvas } from '@/components/RestCanvas'
import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Plate } from '@/components/ui/Plate'
import { Txt } from '@/design/Txt'
import { useCoach } from '@/hooks/use-coach'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { banked as hapticBanked, tick } from '@/services/haptics'
import {
  adjustRest,
  bankCurrentSet,
  endRest,
  finishWorkout,
  resetWorkout,
  selectBoardView,
  startWorkout,
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
 * The exercise thumbnail (no image pipeline on native), the equipment word
 * (`deriveEquipment` needs a muscle group the board does not carry), and the
 * coach's sentence (`ghost-reason` is not wired here yet). Each is a hole in
 * the layout rather than a placeholder, for the reason Home gives.
 */

/** The prototype's back chevron, at its own weight. */
function BackChevron() {
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
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useLocale()
  const { unit, ready } = useUnit()
  const { mode, speaks, thinks } = useCoach()
  const live = useLiveWorkout()
  const view = selectBoardView(live)

  const done = (view.exercise?.sets ?? []).filter((s) => s.done)

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
          committed: done.map((row) => ({
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
  }>({ key, weightKg: view.set?.weightKg ?? null, reps: view.set?.reps ?? null })

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
    setDialled({
      key,
      weightKg: seedWeight(view.set, dialled.weightKg),
      reps: view.set?.reps ?? dialled.reps,
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
  const bodyweight = view.set !== null && view.set.weightKg === null
  const shown = toDisplayWeight(dialled.weightKg ?? 0, unit)
  const load = bodyweight ? null : platesFor(shown, unit)

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
    bankCurrentSet(dialled.weightKg, dialled.reps)
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
  const previous = (view.exercise?.sets ?? [])
    .filter((s) => s.previousReps !== null)
    .map((s) =>
      s.previousKg === null
        ? `${s.previousReps}`
        : `${toDisplayWeight(s.previousKg, unit)}×${s.previousReps}`,
    )
    .join(' · ')

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.paper, paddingTop: insets.top }}
      // The rest canvas vanishes on interaction, and the interaction still
      // lands where the lifter aimed it. See `RestCanvas`.
      onTouchStart={live.restEndsAt === null ? undefined : endRest}
    >
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
            what is true and `WAZN_PLAN.md` records the real gap: native has no
            way to ADD an exercise, which makes this a dead end rather than an
            empty state. That is day one for every new user. */}
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
            <Txt step="title" numberOfLines={1}>
              {view.exercise?.name ?? ''}
            </Txt>
            <Txt step="meta" ink="muted" ltr style={{ marginTop: 3 }}>
              {t('workout.set_of', {
                n: String(view.set?.setNumber ?? 0),
                total: String(view.exercise?.sets.length ?? 0),
              })}
            </Txt>

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
                    <Txt step="dataLg" ltr>
                      {s.weightKg === null
                        ? `${s.reps}`
                        : `${toDisplayWeight(s.weightKg, unit)} ${unit} × ${s.reps}`}
                    </Txt>
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
            retried; "saved" is a promise the store can now keep. */}
        {live.pending.length > 0 && (
          <Txt step="meta" ink="muted">
            {`${live.pending.length} set${live.pending.length === 1 ? '' : 's'} saved on this phone, waiting to sync.`}
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
            {view.position === null
              ? t('log.finish')
              : bodyweight
                ? t('workout.log_set_reps', {
                    n: String(view.set?.setNumber ?? 0),
                    reps: String(dialled.reps ?? 0),
                  })
                : t('workout.log_set', {
                    n: String(view.set?.setNumber ?? 0),
                    weight: String(shown),
                    reps: String(dialled.reps ?? 0),
                  })}
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
