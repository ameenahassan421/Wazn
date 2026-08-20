import { View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  CHECK_INS,
  formatVolume,
  partOfDay,
  palette,
  radius,
  space,
  trimmedPlan,
  type CheckIn,
} from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Card, Rule } from '@/components/ui/Surface'
import { CoachLine } from '@/components/ui/Chip'
import { ChipBtn, ChipRow, HeroBtn } from '@/components/ui/Btn'
import { Fill } from '@/components/ui/Fill'
import { Header } from '@/components/ui/Header'
import { Empty, Screen, StatTile } from '@/components/ui/Screen'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { useHome } from '@/hooks/use-home'

/**
 * Screen 06 — Home (Log, idle). The hunt.
 *
 * ── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
 * It answers one question before a lifter has touched anything: what would
 * make today count. Not "here is your data" — a target, phrased as a number to
 * beat, with the reason underneath it. Everything else on the screen is
 * secondary to `BEAT {volume}` and the button under it.
 *
 * The order is the handoff's and it is not arbitrary: check-in first, then
 * the target, then the earned states (rank, streak, duel), then the plan.
 * Evidence after the ask.
 *
 * The check-in does NOT change the target. It is stored and fed to the shared
 * `computeReadiness`, and what that returns shapes the plan below and the
 * session's ghosts once one starts. The target is last session's volume and
 * nothing a lifter taps here moves it: a number to beat that shrinks because
 * you said you felt tired is not a number to beat.
 */

/**
 * The three taps, in the shared domain's own order, so the row cannot drift
 * from the union that `computeReadiness` scores. The values are catalogue
 * keys, not labels: this screen owns which check-in is offered, and
 * `src/lib/i18n.ts` owns what it is called in each locale.
 */
const CHECK_IN_KEY: Record<CheckIn, string> = {
  fresh: 'checkin.fresh',
  normal: 'checkin.normal',
  drained: 'checkin.drained',
}

/** Also keys. The `kick` step uppercases, so `This morning` arrives as
 *  `THIS MORNING` without a second copy of the phrase living here. */
const PART_OF_DAY: Record<ReturnType<typeof partOfDay>, string> = {
  morning: 'today.morning',
  afternoon: 'today.afternoon',
  evening: 'today.evening',
}

export default function LogHome() {
  const router = useRouter()
  const { t } = useLocale()
  const { unit, ready: unitReady } = useUnit()
  const home = useHome()

  // Waiting on the stored unit rather than rendering a figure and correcting
  // it: flipping 225 to 102 one frame after paint is worse than a blank frame.
  if (!unitReady || home.loading) {
    return <Screen scroll={false} />
  }

  return (
    <Screen>
      <Header name={home.username} />

      {/* ── The check-in ───────────────────────────────────────────────────
          It lives in `useHome`, because it is an input to readiness rather
          than a piece of screen state. Never blocking: an unanswered check-in
          reads as Normal silently, which is why there is no "skip" and no
          confirmation. One tap, never a modal, because a question the app
          asks must never be a gate. */}
      <View style={{ marginTop: 4, marginBottom: 18, gap: 10 }}>
        <Kick>{t('checkin.kicker')}</Kick>
        <ChipRow>
          {CHECK_INS.map((state) => (
            <ChipBtn
              key={state}
              label={t(CHECK_IN_KEY[state])}
              selected={home.checkIn === state}
              onPress={() => home.setCheckIn(state)}
            />
          ))}
        </ChipRow>
      </View>

      {/* ── The hunt card ────────────────────────────────────────────────── */}
      {home.target === null ? (
        // Day one. LAUNCH.md's copy verbatim, and one button — not a target,
        // because "BEAT 0" is not a goal and a fabricated one is worse.
        <Empty line={t('log.start_first')}>
          <HeroBtn
            label={t('history.empty.cta')}
            onPress={() => router.push('/session/new')}
          />
        </Empty>
      ) : (
        <Card style={{ gap: 12 }}>
          <Kick ink="accentSoft">
            {t(PART_OF_DAY[partOfDay(new Date())])} · {home.routineName.toUpperCase()}
          </Kick>
          <Txt step="hero" ltr>
            {t('today.beat')}
            {'\n'}
            {formatVolume(home.target, unit)}
            <Txt step="num" ink="muted" ltr>
              {' '}
              {unit}
            </Txt>
          </Txt>
          {home.brief !== null && (
            <CoachLine line={home.brief.line} chip={home.brief.chip} />
          )}
          <HeroBtn
            label={t('today.start_hunt')}
            onPress={() => router.push('/session/new')}
            style={{ marginTop: 4 }}
          />
        </Card>
      )}

      {/* ── Rank ─────────────────────────────────────────────────────────────
          Brass, and one of only four places in the app allowed to be. */}
      {home.rank !== null && (
        <Card style={{ marginTop: 12, gap: 10 }}>
          <Txt step="num" ink="brassSoft">
            {home.rank.name}
          </Txt>
          <Fill pct={home.rank.pct} brass />
          <Txt step="meta" ink="muted" ltr>
            {home.rank.detail}
          </Txt>
        </Card>
      )}

      {/* ── Three tiles ──────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <StatTile label={t('home.tile.streak')} value={home.stats.streak} />
        <StatTile label={t('home.tile.week')} value={home.stats.thisWeek} />
        <StatTile label={t('progress.sessions')} value={home.stats.sessions} />
      </View>

      {/* ── The plan ─────────────────────────────────────────────────────────
          Index in mono, name in the body voice, set count as meta. A list, not
          a set of cards: it is a manifest to glance down, not six decisions. */}
      {home.plan.length > 0 && (
        <Card style={{ marginTop: 12 }} bare>
          <View style={{ padding: space.cardPad, paddingBottom: 10 }}>
            <Kick>THE PLAN</Kick>
          </View>
          {home.plan.map((row, i) => (
            <View key={row.name}>
              {i > 0 && <Rule inset={space.cardPad} />}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: space.cardPad,
                  height: space.touch,
                }}
              >
                <Txt step="meta" ink="faint" ltr>
                  {String(i + 1).padStart(2, '0')}
                </Txt>
                <Txt step="body" style={{ flex: 1 }} numberOfLines={1}>
                  {row.name}
                </Txt>
                {/* A light day is "same lifts, two fewer sets", and this
                    manifest has to agree with the board that will render the
                    same session. `committed` is 0: nothing has been logged
                    yet on an idle home. */}
                <Txt step="meta" ink="muted" ltr>
                  {trimmedPlan(row.sets, 0, home.readiness)} SETS
                </Txt>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* The duel lives here in the handoff, between the tiles and the plan.
          It is P2 and needs migration 0029 (`rank ladder + duels`), which is
          not applied — so it renders nothing rather than a placeholder. An
          empty slot is honest; a fake opponent is not. */}
      <View style={{ height: 8 }} />
      <View
        style={{
          height: 1,
          backgroundColor: 'transparent',
          borderRadius: radius.chip,
          borderColor: palette.line,
        }}
      />
    </Screen>
  )
}
