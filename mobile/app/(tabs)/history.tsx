import { useEffect, useState } from 'react'
import { View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { toDisplayWeight, type CalendarDay } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Card } from '@/components/ui/Surface'
import { Chip } from '@/components/ui/Chip'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { useHistory, type HistorySession } from '@/hooks/use-history'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { palette, space } from '@wazn/domain'

/**
 * Screen 12, History. Coach's find, the ten-week grid, session rows.
 *
 * ── WHAT THE REFERENCE DRAWS, AND WHAT IT DOES NOT ──────────────────────────
 * `docs/design/v5-momentum/design/screens_tabs.jsx` draws this screen in 37
 * lines and read-only, where the web's `HistoryScreen.tsx` is 882 with six
 * write paths. That is not a spec to drop editing: v5's own README calls P1
 * "History/Progress/Body/Coach/Friends/Settings restyles", and screen 01 says
 * outright "restyle it; do not rewrite flows". The reference draws the RESTING
 * STATE. Expanding a session to edit its sets is the web's behaviour and is
 * owed here; it is not built yet and this file does not pretend otherwise.
 *
 * ── THE GRID IS TEN WEEKS, NOT THIRTEEN ─────────────────────────────────────
 * `trainingCalendar` defaults to 13 for the web heatmap. Screen 12 specifies
 * 7 rows by 10 columns, so the hook asks for 10. The difference is the
 * design's, not a bug, and both stacks compute it from the same shared
 * function so they cannot drift.
 *
 * ── EMBER IS BINARY HERE, ON PURPOSE ────────────────────────────────────────
 * `heatStep` exists in the shared domain and the web heatmap uses five steps
 * of one hue by volume. The v5 reference does not: `have.has(d) ? em : sur2`,
 * and the spec says "ember = trained day". Followed the reference, because the
 * handoff is normative where it and the old stylesheet disagree. Flagged
 * rather than silently reconciled: if the five-step scale is wanted back, it
 * is a one-line change to `cellColour` and `heatStep` is already portable.
 */

const DISMISS_KEY = 'wazn.history.find_dismissed'

/**
 * The reference's grid: `repeat(10, 1fr)` by `repeat(7, 12px)`, gap 4.
 *
 * The columns are FRACTIONS, not squares. A first pass here drew 12x12 cells
 * because "12px cells" is how the spec reads in prose, and running the
 * reference beside it showed wide rounded bars filling the card instead. Only
 * the HEIGHT is 12. Flex does the `1fr` on native.
 */
const CELL_H = 12
const GAP = 4

function cellColour(day: CalendarDay): string {
  return day.volumeKg > 0 ? palette.accent : palette.paper
}

/** `trainingCalendar` returns days in order from a Monday. Seven to a column
 *  gives the reference's 7-row grid with weeks reading left to right. */
function toWeeks(days: CalendarDay[]): CalendarDay[][] {
  const weeks: CalendarDay[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

function SectionHead({ title, right }: { title: string; right?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Kick>{title}</Kick>
      <View style={{ flex: 1 }} />
      {right !== undefined ? (
        <Txt step="meta" ink="muted" ltr>
          {right}
        </Txt>
      ) : null}
    </View>
  )
}

function SessionRow({
  session,
  unit,
}: {
  session: HistorySession
  unit: 'lbs' | 'kg'
}) {
  // ISO `YYYY-MM-DD`, which is what the reference renders (`{s.d}` off a
  // date-keyed row). A first pass used a localised "Jul 20" and reading the
  // reference beside it showed 2026-07-20. Sliced off a LOCAL date rather than
  // `toISOString()`, which would file a 9pm session under tomorrow.
  const when = new Date(session.startedAt)
  const iso = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(
    when.getDate(),
  ).padStart(2, '0')}`
  const meta = [
    iso,
    `${session.sets} SETS`,
    session.minutes === null ? null : `${session.minutes} MIN`,
  ]
    .filter((p) => p !== null)
    .join(' · ')

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: palette.ring,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Sentence case, deliberately: a workout's name is a name, and the
            ramp's `title` step is uppercase. Same override the auth screen
            makes for the same reason. */}
        <Txt
          step="title"
          style={{ fontSize: 15, textTransform: 'none' }}
          numberOfLines={1}
        >
          {session.name}
        </Txt>
        <Txt step="meta" ink="muted" ltr style={{ marginTop: 3 }}>
          {meta}
        </Txt>
      </View>
      {session.records > 0 ? (
        <Chip>{`${session.records} PR${session.records > 1 ? 'S' : ''}`}</Chip>
      ) : null}
      <Txt step="num" ltr>
        {Math.round(toDisplayWeight(session.volumeKg, unit)).toLocaleString()}
        <Txt step="meta" ink="muted" ltr>
          {` ${unit.toUpperCase()}`}
        </Txt>
      </Txt>
    </View>
  )
}

export default function HistoryScreen() {
  const { t } = useLocale()
  const { unit, ready } = useUnit()
  const { loading, error, sessions, calendar, total, find } = useHistory()
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    void AsyncStorage.getItem(DISMISS_KEY)
      .then((v) => setDismissed(v === '1'))
      .catch(() => setDismissed(false))
  }, [])

  function dismiss() {
    setDismissed(true)
    void AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => {})
  }

  // A figure that corrects itself one frame after paint is worse than a frame
  // of ground, which is the same rule `Screen` states for the unit preference.
  if (!ready || loading || dismissed === null) return <Screen />

  if (error !== null) {
    return (
      <Screen>
        <Header />
        <Kick style={{ marginBottom: 14 }}>{t('nav.history')}</Kick>
        <Empty line={error} />
      </Screen>
    )
  }

  if (sessions.length === 0) {
    return (
      <Screen>
        <Header />
        <Kick style={{ marginBottom: 14 }}>{t('nav.history')}</Kick>
        <Empty line={t('history.empty')} />
      </Screen>
    )
  }

  const weekdayName =
    find === null
      ? null
      : // A real date that falls on that weekday, so the name is the locale's
        // rather than a hardcoded English list. 2026-08-16 is a Sunday, so
        // adding the weekday index lands on the right day.
        new Date(2026, 7, 16 + find.weekday).toLocaleDateString(undefined, {
          weekday: 'long',
        })

  return (
    <Screen>
      <Header />

      {find !== null && weekdayName !== null && !dismissed ? (
        <Card style={{ marginBottom: space.gutter, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Kick ink="accentSoft">COACH&apos;S FIND</Kick>
            <View style={{ flex: 1 }} />
            <Kick onPress={dismiss} ink="muted" suppressHighlighting>
              DISMISS
            </Kick>
          </View>
          {/* Sentence ABOVE chip, which is the opposite of the shared
              `CoachLine`. That component stacks chip-first and says why: at
              430px a chip inline with prose wraps mid-number. Here the
              reference puts the sentence first and the chip under it, and the
              handoff is normative, so this card lays itself out rather than
              bending a component three other screens rely on.

              TODO(i18n): this sentence and its chip are the only strings on
              this screen with no key in the shared catalogue. Both locales are
              owed before the Arabic pass; English-only here is a known gap,
              not an oversight.

              The reference's own copy sets an em-dash after "your day". Not
              reproduced: em-dashes never ship (CLAUDE.md), and a period is the
              same sentence. */}
          <Txt step="body">
            {`${weekdayName} is your day. More sessions land there than any other day of the week.`}
          </Txt>
          <Chip>{`${find.count} of ${find.total} sessions · ${weekdayName}s`}</Chip>
        </Card>
      ) : null}

      <View style={{ marginBottom: space.gutter }}>
        <SectionHead title="LAST 10 WEEKS" right={`${total} TOTAL`} />
        <Card style={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', gap: GAP }}>
            {toWeeks(calendar).map((week) => (
              <View key={week[0].date.toISOString()} style={{ flex: 1, gap: GAP }}>
                {week.map((day) => (
                  <View
                    key={day.date.toISOString()}
                    style={{
                      height: CELL_H,
                      borderRadius: 3,
                      backgroundColor: cellColour(day),
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View>
        <SectionHead title="SESSIONS" />
        {sessions.slice(0, 14).map((s) => (
          <SessionRow key={s.workoutId} session={s} unit={unit} />
        ))}
      </View>
    </Screen>
  )
}
