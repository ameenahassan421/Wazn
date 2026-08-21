import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  formatWeight,
  fromDisplayWeight,
  palette,
  radius,
  space,
  toDisplayWeight,
} from '@wazn/domain'

import { RestCanvas } from '@/components/RestCanvas'
import { Chip } from '@/components/ui/Chip'
import { Fill } from '@/components/ui/Fill'
import { Screen } from '@/components/ui/Screen'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { banked as hapticBanked, tick } from '@/services/haptics'
import {
  bankCurrentSet,
  endRest,
  finishWorkout,
  resetWorkout,
  selectBoardView,
  startWorkout,
  useLiveWorkout,
} from '@/state/live-workout'

/**
 * Screen 07, the live board. The screen the app exists for.
 *
 * ── THE SHAPE IS THE ARGUMENT ───────────────────────────────────────────────
 * Two full-bleed rows, each a 82px minus zone, the figure, and a 82px plus
 * zone, with a 70px commit bar under them. That geometry is the reason the
 * job takes 30 seconds one handed: every target is enormous and every one of
 * them sits in the bottom half of a phone, where a thumb already is. The v5
 * reference puts BOTH steppers in one row; this follows the shipped web
 * board instead and gives each its own full-width row, because a stepper pair
 * and a figure sharing 390px leaves each target under the 48px floor.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * The rest canvas, the ghost's reasoning chip and the PR moment. Each is its
 * own surface with its own rules, and this PR is the board and the commit.
 * The momentum bar IS here because it is the only thing on screen that
 * answers "am I winning", which is the question the hunt card asked on the
 * way in.
 */

const ZONE = 82

export default function LiveWorkout() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useLocale()
  const { unit, ready } = useUnit()
  const live = useLiveWorkout()
  const view = selectBoardView(live)

  /**
   * Dialled values, keyed by the set they belong to.
   *
   * Adjusted during render rather than in an effect: when the position moves
   * the seeded values ARE the answer on the first frame, and an effect that
   * set them would paint the previous set's numbers first. That is the same
   * rule `SetEntry` follows on the web.
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
    setDialled({
      key,
      weightKg: view.set?.weightKg ?? null,
      reps: view.set?.reps ?? null,
    })
  }

  useEffect(() => {
    if (live.status === 'idle') void startWorkout()
  }, [live.status])

  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    if (live.startedAt === 0) return
    const render = () => {
      const secs = Math.floor((Date.now() - live.startedAt) / 1000)
      const m = Math.floor(secs / 60)
      setElapsed(`${m}:${String(secs % 60).padStart(2, '0')}`)
    }
    render()
    const id = setInterval(render, 1000)
    return () => {
      clearInterval(id)
    }
  }, [live.startedAt])

  // The unit is a keychain-free read but still async, and a figure that flips
  // from 225 to 102 one frame after paint is worse than one blank frame.
  if (!ready) return <Screen scroll={false} />

  const weightStep = unit === 'kg' ? 2.5 : 5
  const bodyweight = view.set !== null && view.set.weightKg === null

  function step(field: 'weightKg' | 'reps', direction: 1 | -1) {
    tick()
    setDialled((d) => {
      if (field === 'reps') {
        return { ...d, reps: Math.max(1, (d.reps ?? 0) + direction) }
      }
      const shown = toDisplayWeight(d.weightKg ?? 0, unit)
      const next = Math.max(0, shown + direction * weightStep)
      return { ...d, weightKg: fromDisplayWeight(next, unit) }
    })
  }

  function bank() {
    // The haptic and the board move together, before anything is asked of the
    // network. `bankCurrentSet` is synchronous for exactly this reason: it
    // updates the board and hands the insert off unawaited.
    hapticBanked()
    bankCurrentSet(dialled.weightKg, dialled.reps)
  }

  if (view.position === null && live.status !== 'idle') {
    return (
      <Screen scroll={false} style={{ justifyContent: 'center', gap: 16 }}>
        <Txt step="title" style={{ textAlign: 'center' }}>
          EVERY SET LOGGED
        </Txt>
        <Pressable
          onPress={() => {
            void finishWorkout().then(() => {
              resetWorkout()
              router.back()
            })
          }}
          style={{
            height: 60,
            borderRadius: radius.ctl,
            backgroundColor: palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt step="title" ink="onInk">
            CLAIM THE SESSION
          </Txt>
        </Pressable>
      </Screen>
    )
  }

  const shownWeight =
    dialled.weightKg === null ? null : toDisplayWeight(dialled.weightKg, unit)
  const addedVolume =
    dialled.weightKg !== null && dialled.reps !== null
      ? `+${formatWeight(dialled.weightKg * dialled.reps, unit)} TO THE BAR`
      : `+${dialled.reps ?? 0} REPS`

  return (
    <Screen
      scroll={false}
      gutter={0}
      style={{ paddingTop: insets.top }}
      // Screen 08 vanishes on interaction, and the interaction still lands.
      // See the RestCanvas block below.
      onTouchStart={live.restEndsAt === null ? undefined : endRest}
    >
      {/* The momentum bar. Absent on day one rather than empty: an empty
          track is a claim that you have done nothing, and on a first session
          that is not true, it is just unmeasured. */}
      {view.pct !== null && (
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: 10, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Kick ink={view.recordPace ? 'accent' : 'muted'}>
              {view.recordPace ? 'RECORD PACE' : 'SESSION VOLUME'}
            </Kick>
            <View style={{ flex: 1 }} />
            <Txt step="meta" ink="muted" ltr>
              {`${formatWeight(view.banked, unit)} / ${formatWeight(live.targetKg ?? 0, unit)}`}
            </Txt>
          </View>
          <Fill pct={view.pct} brass={view.recordPace} />
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 8,
          paddingHorizontal: space.gutter,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: palette.ring,
        }}
      >
        <Txt step="meta" ink="muted" ltr>
          {elapsed}
        </Txt>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            void finishWorkout().then(() => {
              resetWorkout()
              router.back()
            })
          }}
          hitSlop={12}
        >
          <Kick>{t('log.finish')}</Kick>
        </Pressable>
      </View>

      <View
        style={{ paddingHorizontal: space.gutter, paddingTop: 18, paddingBottom: 8 }}
      >
        <Txt step="title" style={{ fontSize: 24 }}>
          {view.exercise?.name ?? ''}
        </Txt>
        <Txt step="meta" ink="muted" ltr style={{ marginTop: 6 }}>
          {`SET ${(view.position?.setIndex ?? 0) + 1} / ${view.exercise?.sets.length ?? 0}`}
          {view.set?.previousReps === null || view.set === null
            ? ''
            : ` · LAST ${view.set.previousKg === null ? '' : `${formatWeight(view.set.previousKg, unit)}×`}${view.set.previousReps}`}
        </Txt>
      </View>

      {!bodyweight && (
        <Zone
          label={unit === 'kg' ? 'KG' : 'LBS'}
          value={shownWeight ?? 0}
          mega
          onDown={() => step('weightKg', -1)}
          onUp={() => step('weightKg', 1)}
        />
      )}
      <Zone
        label={t('history.reps')}
        value={dialled.reps ?? 0}
        mega={bodyweight}
        onDown={() => step('reps', -1)}
        onUp={() => step('reps', 1)}
      />

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 12 }}>
        <Chip>{addedVolume}</Chip>
      </View>

      {/* The queue, said plainly. The wording changed on 2026-08-21 with the
          thing it describes: these sets used to be on this screen and nowhere
          else, and now they are on the phone and will be retried. "Saved on
          this phone" is a promise the store can now keep. */}
      {live.pending.length > 0 && (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 10 }}>
          <Txt step="meta" ink="muted">
            {`${live.pending.length} set${live.pending.length === 1 ? '' : 's'} saved on this phone, waiting to sync.`}
          </Txt>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={bank}
        style={{
          height: 70,
          marginBottom: insets.bottom,
          backgroundColor: palette.accent,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          // 31, over the rest canvas's 29. Without this the canvas covers the
          // commit control and GATE U2's one-tap repeat set becomes two.
          zIndex: 31,
        }}
      >
        <Txt step="title" ink="onInk" style={{ fontSize: 23, letterSpacing: 0.46 }}>
          BANK IT
        </Txt>
        <Txt step="title" ink="onInk" ltr style={{ fontSize: 23 }}>
          {bodyweight
            ? `· ${dialled.reps ?? 0}`
            : `· ${shownWeight ?? 0} × ${dialled.reps ?? 0}`}
        </Txt>
      </Pressable>

      {/* Screen 08. An overlay on the board rather than a route, so dismissing
          it costs no navigation and the board underneath never unmounts.

          It takes no touches (see RestCanvas). Dismissal is the screen's job,
          on `onTouchStart` at the root: RN bubbles touches up from whatever
          was actually pressed, so the tap that clears this canvas is the same
          tap that banks the set, opens the menu or finishes the workout. One
          tap, wherever it lands, which is what GATE U2 counts and what every
          other control needs too. */}
      {live.restEndsAt !== null && (
        <RestCanvas
          endsAt={live.restEndsAt}
          total={live.restTotal}
          nextLabel={
            view.set === null
              ? null
              : view.set.weightKg === null
                ? `${view.set.reps ?? 0} reps`
                : `${toDisplayWeight(view.set.weightKg, unit)} × ${view.set.reps ?? 0}`
          }
        />
      )}
    </Screen>
  )
}

/**
 * One full-bleed stepper row.
 *
 * The side zones are 82px and full height rather than round buttons, so the
 * target is the whole edge of the phone. A lifter with chalk on their hands
 * and a bar to get back to does not aim.
 */
function Zone({
  label,
  value,
  mega,
  onDown,
  onUp,
}: {
  label: string
  value: number
  mega: boolean
  onDown: () => void
  onUp: () => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        borderTopWidth: 1,
        borderColor: palette.ring,
      }}
    >
      <Pressable
        onPress={onDown}
        style={{
          width: ZONE,
          borderEndWidth: 1,
          borderColor: palette.ring,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt step="fig" ink="muted">
          −
        </Txt>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 4, paddingBottom: 8 }}>
        <Kick>{label}</Kick>
        <Txt step="mega" ltr style={mega ? undefined : { fontSize: 56 }}>
          {String(value)}
        </Txt>
      </View>
      <Pressable
        onPress={onUp}
        style={{
          width: ZONE,
          borderStartWidth: 1,
          borderColor: palette.ring,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt step="fig" ink="muted">
          +
        </Txt>
      </Pressable>
    </View>
  )
}
