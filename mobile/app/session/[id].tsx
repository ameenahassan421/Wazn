import { useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  formatWeight,
  fromDisplayWeight,
  palette,
  space,
  toDisplayWeight,
  type Readiness,
} from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Btn } from '@/components/ui/Btn'
import { Chip } from '@/components/ui/Chip'
import { Rule } from '@/components/ui/Surface'
import { CommitBar } from '@/components/workout/CommitBar'
import { MomentumBar } from '@/components/workout/MomentumBar'
import { Picker } from '@/components/workout/Picker'
import { RestCanvas } from '@/components/workout/RestCanvas'
import { Zone } from '@/components/workout/Zone'
import { useHome } from '@/hooks/use-home'
import { useRestTimer } from '@/hooks/use-rest-timer'
import { useUnit } from '@/hooks/use-unit'
import { useGhost, useWorkout, volumeKg, workingSets } from '@/hooks/use-workout'

/**
 * Screen 07 — the live board. The screen the app exists for.
 *
 * ── THE LOOP IS TWO STEPPERS AND ONE BAR ────────────────────────────────────
 * Everything else on this screen is context. A lifter mid-set adjusts the
 * weight, adjusts the reps, and presses BANK IT — and for a repeat set they
 * press BANK IT alone, because the stepper keeps its values after a commit.
 * That is GATE U2 and it is the reason there is no confirmation, no sheet and
 * no navigation on the commit path.
 *
 * ── THE GHOST IS NOT A DEFAULT ──────────────────────────────────────────────
 * When a lift is opened, the stepper is seeded by `verdictFor` from the shared
 * domain: double progression off the last session, eased if a set today came
 * in under plan, held otherwise. The chip says which — ▲ / → / ↓ — so the
 * number is never mysterious. It is a proposal the lifter can step away from
 * in one press, never an auto-applied change.
 *
 * ── REST DOES NOT TAKE THE SCREEN ───────────────────────────────────────────
 * The rest canvas is built and reachable from the rest chip, and it does NOT
 * appear automatically on commit. That is the same open decision the web app
 * carries: an automatic takeover makes a repeat set cost two taps, which is
 * exactly GATE U2. One line, marked below, turns it on when Ameen decides.
 */

/** Plate increments, per display unit. A percentage is a coach who has never
 *  stood at a rack — you can only load what is on the rack. */
const STEP = { lbs: 5, kg: 2.5 } as const
const DEFAULT_REST_SECONDS = 150

export default function LiveWorkout() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { unit } = useUnit()
  const home = useHome()
  const timer = useRestTimer()
  const {
    ready,
    workout,
    previous,
    start,
    addExercise,
    commit,
    undoLast,
    finish,
    loadPrevious,
  } = useWorkout()

  const [picking, setPicking] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [showRest, setShowRest] = useState(false)
  const [weightKg, setWeightKg] = useState<number | null>(null)
  const [reps, setReps] = useState<number>(8)
  /** Set once per lift so a seeded value is never overwritten mid-session. */
  const [seeded, setSeeded] = useState<string | null>(null)

  // A route opened with no workout starts one. `/session/new` is the only way
  // in, so this is the start button's other half.
  useEffect(() => {
    if (ready && workout === null) start()
  }, [ready, workout, start])

  useEffect(() => {
    if (current !== null) void loadPrevious(current)
  }, [current, loadPrevious])

  const prevRows = current === null ? [] : (previous[current] ?? [])
  const ghost = useGhost({
    workout,
    exerciseId: current,
    previous: prevRows,
    readiness: 'normal' as Readiness,
    incrementKg: fromDisplayWeight(STEP[unit], unit),
  })

  /**
   * Seed the stepper from the ghost, ONCE per lift.
   *
   * Adjusted during render rather than in an effect: `react-hooks` v7 forbids
   * the synchronous setState an effect would need, and this is the exact case
   * that rule is for — state following a prop.
   */
  if (current !== null && seeded !== current && ghost !== null) {
    setSeeded(current)
    if (ghost.weightKg !== null) setWeightKg(ghost.weightKg)
    if (ghost.reps !== null) setReps(ghost.reps)
  }

  const done = workout === null || current === null ? [] : workingSets(workout, current)
  const sessionVolume = workout === null ? 0 : volumeKg(workout)

  const displayWeight = weightKg === null ? '—' : formatWeight(weightKg, unit)

  const commitLabel = useMemo(() => {
    if (weightKg === null) return 'BANK IT'
    return `BANK IT · ${formatWeight(weightKg, unit)} × ${reps}`
  }, [weightKg, reps, unit])

  if (!ready) return <View style={{ flex: 1, backgroundColor: palette.ink }} />

  if (picking) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.ink,
          paddingTop: insets.top + 12,
          paddingHorizontal: space.gutter,
        }}
      >
        <Picker
          onCancel={() => setPicking(false)}
          onPick={(e) => {
            addExercise(e.id, e.name)
            setCurrent(e.id)
            setPicking(false)
          }}
        />
      </View>
    )
  }

  const name = current === null ? null : (workout?.names[current] ?? null)
  const lastRow = prevRows.at(done.length) ?? prevRows.at(-1) ?? null

  return (
    <View style={{ flex: 1, backgroundColor: palette.ink }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: space.gutter,
          paddingBottom: space.commitBar + insets.bottom + 24,
          gap: 14,
        }}
      >
        {/* Status strip. FINISH is the only way out — the back gesture is
            disabled on this route on purpose. */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Kick ltr>
            {done.length > 0 ? `${sessionVolumeLabel(sessionVolume, unit)}` : 'LIVE'}
          </Kick>
          <View style={{ flex: 1 }} />
          <Btn
            kind="ghost"
            small
            label="FINISH"
            onPress={() => {
              void finish().then(() => router.replace('/'))
            }}
          />
        </View>

        <MomentumBar
          volumeKg={sessionVolume}
          targetKg={home.target}
          unitLabel={unit}
          formatVolume={(kg) => String(Math.round(toDisplayWeight(kg, unit)))}
        />

        {current === null ? (
          <View style={{ gap: 12, paddingTop: 40, alignItems: 'center' }}>
            <Txt step="title">Nothing on the bar yet.</Txt>
            <Btn kind="hero" label="ADD A LIFT" onPress={() => setPicking(true)} />
          </View>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Txt step="title">{name}</Txt>
              <Txt step="meta" ink="muted" ltr>
                SET {done.length + 1}
                {lastRow?.weightKg != null && lastRow.reps != null
                  ? ` · LAST ${formatWeight(lastRow.weightKg, unit)}×${lastRow.reps}`
                  : ''}
              </Txt>
              {/* The ghost's reason, as a chip. No chip when the coach has
                  nothing to say — an unexplained number is worse than none. */}
              {ghost !== null && ghost.cause !== 'none' && (
                <Chip>{ghostChip(ghost.kind, ghost.cause)}</Chip>
              )}
            </View>

            <View style={{ marginHorizontal: -space.gutter }}>
              <Zone
                label="WEIGHT"
                value={displayWeight}
                suffix={unit}
                step={`${STEP[unit]} ${unit}`}
                onStep={(d) => {
                  const currentDisplay =
                    weightKg === null ? 0 : toDisplayWeight(weightKg, unit)
                  const next = Math.max(0, currentDisplay + d * STEP[unit])
                  setWeightKg(fromDisplayWeight(next, unit))
                }}
              />
              <Zone
                label="REPS"
                value={String(reps)}
                size="hero"
                step="1"
                onStep={(d) => setReps((r) => Math.max(0, r + d))}
              />
            </View>

            {weightKg !== null && reps > 0 && (
              <Chip>
                {`+${Math.round(toDisplayWeight(weightKg * reps, unit))} ${unit.toUpperCase()} TO THE BAR`}
              </Chip>
            )}

            {done.length > 0 && (
              <View style={{ gap: 8 }}>
                <Kick>BANKED</Kick>
                {done.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 && <Rule />}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        gap: 12,
                      }}
                    >
                      <Txt step="meta" ink="faint" ltr>
                        {String(s.setNumber).padStart(2, '0')}
                      </Txt>
                      <Txt step="num" ltr style={{ flex: 1 }}>
                        {formatWeight(s.weightKg, unit)} × {s.reps}
                      </Txt>
                    </View>
                  </View>
                ))}
                <Btn kind="ghost" small label="UNDO LAST SET" onPress={undoLast} />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Btn
                kind="line"
                small
                label="ADD A LIFT"
                onPress={() => setPicking(true)}
              />
              <Btn
                kind="line"
                small
                label={timer.remaining === null ? 'REST' : 'SEE REST'}
                onPress={() => {
                  if (timer.remaining === null) timer.start(DEFAULT_REST_SECONDS)
                  setShowRest(true)
                }}
              />
            </View>
          </>
        )}
      </ScrollView>

      {current !== null && (
        <CommitBar
          label={commitLabel}
          disabled={weightKg === null || reps <= 0}
          onCommit={() => {
            commit(current, weightKg, reps, 'normal')
            timer.start(DEFAULT_REST_SECONDS)
            // THE TAKEOVER LINE. Uncommenting makes rest cover the screen on
            // every commit — and makes a repeat set cost two taps, which is
            // GATE U2. Ameen's call, same as on the web.
            //   setShowRest(true)
          }}
        />
      )}

      {showRest && (
        <RestCanvas
          timer={timer}
          onDismiss={() => setShowRest(false)}
          nextLabel={name === null ? null : `${name} — set ${done.length + 1}`}
        />
      )}
    </View>
  )
}

/** `7,120 LBS` — the session's running total, in the meta voice. */
function sessionVolumeLabel(kg: number, unit: 'lbs' | 'kg'): string {
  return `${Math.round(toDisplayWeight(kg, unit)).toLocaleString()} ${unit.toUpperCase()}`
}

/** The ghost's reason, as the handoff's arrow plus a word. */
function ghostChip(kind: string, cause: string): string {
  const arrow = kind === 'raise' ? '▲' : kind === 'ease' ? '↓' : '→'
  const why =
    cause === 'progression'
      ? 'EVERY REP LAST TIME'
      : cause === 'under-plan'
        ? 'EASED AFTER A SHORT SET'
        : cause === 'readiness'
          ? 'LIGHT TODAY'
          : 'HOLD'
  return `${arrow} ${why}`
}
