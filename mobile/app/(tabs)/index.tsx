import { useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { formatVolume, partOfDay, palette, radius, space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Card, Rule } from '@/components/ui/Surface'
import { CoachLine } from '@/components/ui/Chip'
import { ChipBtn, ChipRow, HeroBtn } from '@/components/ui/Btn'
import { Fill } from '@/components/ui/Fill'
import { Header } from '@/components/ui/Header'
import { Empty, Screen, StatTile } from '@/components/ui/Screen'
import { useUnit } from '@/hooks/use-unit'
import { useHome, type Readiness } from '@/hooks/use-home'

/**
 * Screen 06 — Home (Log, idle). The hunt.
 *
 * ── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
 * It answers one question before a lifter has touched anything: what would
 * make today count. Not "here is your data" — a target, phrased as a number to
 * beat, with the reason underneath it. Everything else on the screen is
 * secondary to `BEAT {volume}` and the button under it.
 *
 * The order is the handoff's and it is not arbitrary: check-in first (it is
 * one tap and it changes the target), then the target, then the earned states
 * — rank, streak, duel — then the plan. Evidence after the ask.
 */

const READINESS: readonly { key: Readiness; label: string }[] = [
  { key: 'fresh', label: 'Fresh' },
  { key: 'normal', label: 'Normal' },
  { key: 'drained', label: 'Drained' },
]

const PART_OF_DAY: Record<ReturnType<typeof partOfDay>, string> = {
  morning: 'THIS MORNING',
  afternoon: 'THIS AFTERNOON',
  evening: 'TONIGHT',
}

export default function LogHome() {
  const router = useRouter()
  const { unit, ready: unitReady } = useUnit()
  const home = useHome()

  /**
   * The check-in. Local, and never blocking: skipped reads as Normal
   * silently, which is why there is no "skip" and no confirmation. One tap,
   * never a modal — a question the app asks must never be a gate.
   */
  const [readiness, setReadiness] = useState<Readiness | null>(null)

  // Waiting on the stored unit rather than rendering a figure and correcting
  // it: flipping 225 to 102 one frame after paint is worse than a blank frame.
  if (!unitReady || home.loading) {
    return <Screen scroll={false} />
  }

  return (
    <Screen>
      <Header name={home.username} />

      {/* ── The check-in ─────────────────────────────────────────────────── */}
      <View style={{ marginTop: 4, marginBottom: 18, gap: 10 }}>
        <Kick>HOW LOADED?</Kick>
        <ChipRow>
          {READINESS.map((r) => (
            <ChipBtn
              key={r.key}
              label={r.label}
              selected={readiness === r.key}
              onPress={() => setReadiness(r.key)}
            />
          ))}
        </ChipRow>
      </View>

      {/* ── The hunt card ────────────────────────────────────────────────── */}
      {home.target === null ? (
        // Day one. LAUNCH.md's copy verbatim, and one button — not a target,
        // because "BEAT 0" is not a goal and a fabricated one is worse.
        <Empty line="Start your first workout.">
          <HeroBtn
            label="START A WORKOUT"
            onPress={() => router.push('/session/new')}
          />
        </Empty>
      ) : (
        <Card style={{ gap: 12 }}>
          <Kick ink="accentSoft">
            {PART_OF_DAY[partOfDay(new Date())]} · {home.routineName.toUpperCase()}
          </Kick>
          <Txt step="hero" ltr>
            BEAT{'\n'}
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
            label="START THE HUNT"
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
        <StatTile label="STREAK" value={home.stats.streak} />
        <StatTile label="THIS WEEK" value={home.stats.thisWeek} />
        <StatTile label="SESSIONS" value={home.stats.sessions} />
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
                <Txt step="meta" ink="muted" ltr>
                  {row.sets} SETS
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
