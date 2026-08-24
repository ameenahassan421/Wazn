import { useCallback, useState } from 'react'
import { View } from 'react-native'
import Svg, { Line as SvgLine } from 'react-native-svg'

import {
  formatEstimate,
  radius,
  recentRecords,
  sessionsPerWeek,
  space,
  toDisplayWeight,
  weeklyVolume,
  type RecordEntry,
  type Unit,
  type WeekBucket,
} from '@wazn/domain'

import { Card } from '@/components/ui/Surface'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { WeekReview } from '@/components/WeekReview'
import { HistorySection } from '@/components/HistorySection'
import { Plate } from '@/components/ui/Plate'
import { Spark } from '@/components/ui/Spark'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { fetchProgress, type ProgressData, type StrengthRow } from '@/services/progress'
import { supabaseConfigError } from '@/services/supabase'
import { useFocusEffect } from 'expo-router'
import { usePalette } from '@/hooks/use-theme'

/**
 * Screen 13 — Progress. "Am I training enough" and "am I getting stronger".
 *
 * ── WHAT IS ON IT, AND WHAT IS DELIBERATELY NOT ─────────────────────────────
 * The web equivalent is 1,449 lines and nine blocks. This is not a port of it,
 * for two reasons that are both about the app as it stands TODAY rather than
 * about effort:
 *
 * **The muscle-balance chart is not here, because it now lives on Coach.**
 * `CoachNotes` drew weekly sets per muscle against the productive band on
 * 2026-08-21. Two charts of the same numbers in one app is worse than one, and
 * the Coach tab is where the app already answers "am I neglecting legs" with a
 * sentence attached. If it should move back here, it moves rather than
 * duplicates.
 *
 * **Per-lift charts, the forecast line and the plateau card are not here
 * either.** Hevy's own structure puts per-exercise strength charts on the
 * EXERCISE page and has the dashboard link into it. Native has no exercise
 * detail screen yet, so the honest version of this screen ends at the list of
 * lifts with their estimates; the depth lands when that screen does, rather
 * than being stacked here because there is nowhere else to put it.
 *
 * ── THERE IS NO REFERENCE FOR THIS SCREEN ───────────────────────────────────
 * §6's rule: `docs/design/prototype/` covers Home, Workout, Rest and Finish,
 * and NOT this one, so this is a derivation and has to say what from. It is
 * built from three patterns already in the app: the Finish screen's figure row
 * (a large tabular number over a quiet label), `CoachNotes`'s bar-against-a-
 * track (the frequency chart is the same geometry with a different meaning),
 * and the earned ember-wash treatment, used here on the records block and
 * nowhere else on the screen, because a PR is the one thing on it worth
 * celebrating.
 */

const FREQUENCY_WEEKS = 13
const VOLUME_WEEKS = 12
/** How many lifts the list shows before it stops. See `StrengthList`. */
const LIFTS_SHOWN = 6

/** Postgres numerics arrive as strings through PostgREST. */
function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Volume is a total, not an estimate, so it snaps to something loadable — and
 * past five digits it is ABBREVIATED.
 *
 * A week's volume is six digits for anyone training seriously, and at 30px in
 * a third of a phone's width "57,770" wrapped to "57,77 / 0" on the first
 * render against real data. A number that breaks across two lines is not
 * glanceable at arm's length, which is the only thing this figure is for. The
 * exact pound count of a week's tonnage is not a number anybody acts on; the
 * comparison against other weeks is, and the chart below carries that.
 */
function formatVolume(kg: number, unit: Unit): string {
  const display = Math.round(toDisplayWeight(kg, unit))
  if (display < 10000) return display.toLocaleString()
  return `${(Math.round(display / 100) / 10).toLocaleString()}k`
}

/**
 * A large tabular figure over a quiet label, the pairing this app uses wherever
 * a number is the point. Same shape as the Finish screen's summary row.
 */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt step="fig" ltr>
        {value}
      </Txt>
      <Txt step="caption" ink="muted">
        {label}
      </Txt>
    </View>
  )
}

/**
 * Sessions per week, one bar a week, with the average as a reference line.
 *
 * Bars rather than a line because the quantity is a COUNT: three sessions and
 * four sessions are two discrete facts, and a line between them draws 3.5,
 * which is not a week anybody had. The empty weeks are drawn as empty rather
 * than skipped, because a gap is the entire point of this chart.
 */
function Frequency({ weeks }: { weeks: WeekBucket[] }) {
  const palette = usePalette()
  const { t } = useLocale()
  const total = weeks.reduce((sum, w) => sum + w.sessions, 0)
  const peak = Math.max(1, ...weeks.map((w) => w.sessions))
  const avg = weeks.length > 0 ? total / weeks.length : 0
  const H = 64

  return (
    <Card style={{ gap: 10 }}>
      <Kick>{t('progress.frequency.title')}</Kick>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 5,
          height: H,
        }}
      >
        {weeks.map((week, i) => {
          const isLast = i === weeks.length - 1
          return (
            <View
              key={week.start.toISOString()}
              style={{
                flex: 1,
                // A zero-session week still draws a 2px seat, so the row reads
                // as a timeline with a hole in it rather than as a chart that
                // starts late. Without it an eight-week gap is indistinguishable
                // from an account that is eight weeks younger.
                height: Math.max(2, (week.sessions / peak) * H),
                borderRadius: radius.pill,
                // The current week is the only ember bar: it is the one the
                // lifter can still change. Everything behind it is history and
                // history is ink.
                backgroundColor:
                  week.sessions === 0
                    ? palette.ring
                    : isLast
                      ? palette.accent
                      : palette.muted,
              }}
            />
          )
        })}
        {/* The average, as the dashed reference the caption has always
            promised. The first version of this chart printed "dashed line is
            the average" under bars with no line on them, copy inherited from
            the web screen, which draws one. A caption that describes a mark
            that is not there is the same defect as a comment describing code
            that does not run.

            ── AND THE SECOND VERSION WAS THE SAME DEFECT AGAIN ──────────────
            This was a zero-height View with `borderStyle: 'dashed'`, and the
            comment here asserted that was "the whole implementation; no SVG
            needed". iOS disagrees. React Native logs
            `Unsupported dashed / dotted border style` and falls back to SOLID
            whenever it cannot draw the dashes, which for a one-sided border on
            a zero-height box is always. So the caption promised a dashed line
            and the screen drew a solid one: a third pass at the same class of
            bug the two comments above are congratulating themselves for
            fixing. Caught 2026-08-22 by reading the LogBox warning behind
            "Open debugger to view warnings" instead of ignoring it.

            `Spark.tsx` had the working pattern the whole time, one directory
            over: an SVG `Line` with `strokeDasharray="3 4"`, which is honoured
            on both platforms. Same dash rhythm here so the two charts agree.

            Drawn AFTER the bars, so it sits over them. Behind them it was
            legible only in the gaps between weeks, which is exactly where a
            reader is not looking: the comparison the line exists for is
            bar-against-line, and it has to cross the bars to make it. */}
        {avg > 0 && (
          <View
            style={{
              position: 'absolute',
              start: 0,
              end: 0,
              bottom: (avg / peak) * H,
              height: 1,
            }}
          >
            <Svg width="100%" height={1}>
              <SvgLine
                x1="0"
                y1="0.5"
                x2="100%"
                y2="0.5"
                // `muted`, not a ring token. The rings are 6% and 12% ink,
                // which vanish against white at 1px, drawn once and invisible.
                // A reference line carries the same weight as the labels that
                // explain it.
                stroke={palette.muted}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
            </Svg>
          </View>
        )}
      </View>
      <Txt step="meta" ink="muted">
        {total === 0
          ? t('progress.frequency.empty_caption')
          : t('progress.frequency.caption', {
              avg: (Math.round(avg * 10) / 10).toString(),
              count: String(total),
              sessions: t(
                total === 1
                  ? 'progress.frequency.session'
                  : 'progress.frequency.sessions',
              ),
            })}
      </Txt>
    </Card>
  )
}

/**
 * Records, on the ember wash.
 *
 * The one celebrated block on this screen, and the third surface in the app to
 * carry the earned treatment after Finish's beat-last-session card and the
 * Coach tab's MOVING note. `recentRecords` caps at five itself, for a reason it
 * documents: at eight rows the block pushed everything below it off a phone.
 */
function Records({ entries, unit }: { entries: RecordEntry[]; unit: Unit }) {
  const { t } = useLocale()
  if (entries.length === 0) return null

  return (
    <Card tone="wash" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Plate size={22} variant="full" />
        <Kick ink="accentSoft" style={{ flex: 1 }}>
          {t('progress.records.title')}
        </Kick>
      </View>
      <View style={{ gap: 10 }}>
        {/* The index is in the key because nothing else here is unique.
            `at` is the WORKOUT's `started_at`, shared by every set in it, so
            two flagged sets of one lift in one session collide on
            exercise+at+kind — which they did, on the first render against real
            data (2026-08-08, "both"). Weight and reps do not save it either:
            two identical top sets are exactly the case that produces two
            records. */}
        {entries.map((entry, i) => (
          <View
            key={`${entry.exercise_id}-${entry.at}-${entry.kind}-${i}`}
            style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Txt step="label" numberOfLines={1}>
                {entry.name}
              </Txt>
              <Txt step="caption" ink="muted">
                {t(`progress.record.${entry.kind}`)}
              </Txt>
            </View>
            <Txt step="num" ink="accent" ltr>
              {`${formatEstimate(entry.weight_kg, unit)} × ${entry.reps}`}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  )
}

/**
 * The lifts, by estimated 1RM, heaviest first.
 *
 * `recent_e1rm_kg` against `previous_e1rm_kg` is the only delta shown, and it
 * is shown as a direction rather than a percentage: a lifter wants to know
 * which way the lift is going, and a percentage on an ESTIMATE implies a
 * precision the estimate does not have.
 *
 * Capped at six with the remainder counted in words rather than truncated
 * silently — the same rule the volume chart follows on the Coach tab.
 */
function StrengthList({ rows, unit }: { rows: StrengthRow[]; unit: Unit }) {
  const { t } = useLocale()
  const ranked = [...rows]
    .filter((r) => num(r.best_e1rm_kg) > 0)
    .sort((a, b) => num(b.best_e1rm_kg) - num(a.best_e1rm_kg))
  const shown = ranked.slice(0, LIFTS_SHOWN)
  const hidden = ranked.length - shown.length

  return (
    <Card style={{ gap: 12 }}>
      <Kick>{t('progress.strength.title')}</Kick>
      {shown.length === 0 ? (
        <Txt step="label" ink="muted">
          {t('progress.balance.empty')}
        </Txt>
      ) : (
        <View style={{ gap: 12 }}>
          {shown.map((row) => {
            const recent = num(row.recent_e1rm_kg)
            const previous = num(row.previous_e1rm_kg)
            const delta = recent > 0 && previous > 0 ? recent - previous : 0
            return (
              <View
                key={row.exercise_id}
                style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}
              >
                <Txt step="label" style={{ flex: 1 }} numberOfLines={1}>
                  {row.name}
                </Txt>
                {delta !== 0 && (
                  <Txt step="meta" ink={delta > 0 ? 'accentSoft' : 'muted'} ltr>
                    {`${delta > 0 ? '+' : '−'}${formatEstimate(Math.abs(delta), unit)}`}
                  </Txt>
                )}
                <Txt step="num" ltr>
                  {formatEstimate(num(row.best_e1rm_kg), unit)}
                </Txt>
              </View>
            )
          })}
          {/* States the remainder; does NOT promise a tap.
              This read "Show all 108" on the first render against real data,
              borrowed from the web screen where it IS a control. Copy that
              names an affordance the screen does not have is the same defect
              as the caption that described a dashed line nobody had drawn.
              Depth per lift belongs on the exercise page, which native does
              not have yet — so the honest version counts what is not shown. */}
          {hidden > 0 && (
            <Txt step="meta" ink="muted">
              {t('progress.strength.more', { count: String(hidden) })}
            </Txt>
          )}
        </View>
      )}
    </Card>
  )
}

export default function ProgressScreen() {
  const { t } = useLocale()
  const { unit } = useUnit()
  const [data, setData] = useState<ProgressData | null>(null)
  /*
   * Seeded from `supabaseConfigError` rather than corrected by the effect.
   *
   * It is a module constant decided at import time, so "the client is not
   * configured" is knowable during the first render and setting it from inside
   * an effect is both a wasted render and the exact cascading-setState the
   * lint rule forbids (see CLAUDE.md, "State handling").
   */
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(
    supabaseConfigError !== null ? 'failed' : 'loading',
  )
  /** Measured, not assumed: the Spark needs a pixel width and the card's inner
   *  box is the screen minus two gutters and two card pads. */
  const [chartWidth, setChartWidth] = useState(0)

  /*
   * On focus, not on mount, which is the posture `crew.tsx` states and `plan.tsx`
   * shares: "the board is a tab the lifter returns to rather than a screen they
   * open once". Progress was the one returned-to tab still fetching once, and
   * folding History in is what made that a defect rather than a preference. A
   * lifter who opened Progress, trained, and came back through the History
   * circle saw the session they had just finished missing from the list, the
   * ten-week grid and the total.
   *
   * `data` is only replaced on success, so the previous read stays on screen
   * while the new one is in flight and coming back never blanks the screen.
   */
  useFocusEffect(
    useCallback(() => {
      if (supabaseConfigError !== null) return
      let active = true
      void fetchProgress()
        .then((next) => {
          if (!active) return
          setData(next)
          setState('ready')
        })
        .catch(() => {
          if (active) setState('failed')
        })
      return () => {
        active = false
      }
    }, []),
  )

  const sessions = data?.sessions ?? []
  const weeks = sessionsPerWeek(sessions, FREQUENCY_WEEKS)
  const volume = weeklyVolume(sessions, VOLUME_WEEKS)
  const records = recentRecords(data?.records ?? [], (id) => data?.nameById.get(id))

  // This week is the LAST bucket of the same series the chart draws, rather
  // than a separate query with its own idea of when a week starts. Two answers
  // to "how many sessions this week" on one screen is how they drift apart.
  const thisWeekSessions = weeks.at(-1)?.sessions ?? 0
  const thisWeekVolume = volume.at(-1)?.volumeKg ?? 0

  /*
   * ONE shell, four bodies, and the review is outside all of them.
   *
   * This screen had four separate `return (<Screen>...)` blocks, each
   * repeating the header and the kicker. That was survivable while they all
   * showed the same three lines of chrome. It stopped being survivable when
   * the week review moved here: the review is its own two reads on its own
   * cadence and owes `fetchProgress` nothing, so hanging it inside the
   * branches would have hidden the coach's entire reading of the week behind
   * a failed sessions query, which is the exact defect §12 exists to prevent
   * and the exact one this component was extracted to fix.
   */
  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('nav.progress')}</Kick>

      {/* The week in review, first. `docs/FRIENDS_PLAN.md` Part 3B: its four
          sections are adherence, volume, plateaus and wins, and every one of
          those is a Progress question the coach happens to phrase in a
          sentence. It renders nothing at all when the coach is silenced. */}
      <WeekReview />

      {/*
        Three strings, and all three were wrong before the merge put a second
        loading card directly above them.

        `progress.loading` is NEW. This branch said `t('coach.loading')`, which
        was harmless while Progress had no coach on it and is not any more:
        `WeekReview` renders that exact string one card up, so a cold open drew
        the same kicker twice in two stacked cards and read as a bug.

        `progress.error.load` used to READ 'Loading your progress'. It renders
        in the FAILED branch, so a read that died announced itself as one still
        in flight, permanently. The key was right and the sentence was a
        loading sentence.

        `progress.empty` replaces `progress.balance.empty`, which is the
        muscle-balance chart's absence copy standing in for the whole screen's
        day-one state. The real one is specified in LAUNCH.md and already in
        the catalogue.
      */}
      {state === 'loading' ? (
        <Card>
          <Kick>{t('progress.loading')}</Kick>
        </Card>
      ) : state === 'failed' ? (
        <Empty line={t('progress.error.load')} />
      ) : sessions.length === 0 ? (
        <Empty line={t('progress.empty')} />
      ) : (
        <View style={{ gap: 12 }}>
          {/* ── This week ────────────────────────────────────────────────
            Three figures, the screen's answer to "how am I doing" before
            any chart is read. */}
          <Card style={{ gap: 12 }}>
            <Kick>{t('progress.this_week')}</Kick>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Figure value={String(thisWeekSessions)} label={t('progress.sessions')} />
              <Figure
                value={formatVolume(thisWeekVolume, unit)}
                label={`${t('progress.volume')} · ${unit}`}
              />
              <Figure
                value={String(data?.streakWeeks ?? 0)}
                label={`${t('progress.streak')} · ${t('progress.wk')}`}
              />
            </View>
          </Card>

          <Frequency weeks={weeks} />

          {/* ── Volume trend ─────────────────────────────────────────────
            `Spark` is the app's one line chart and it is already tested;
            `sparkGeometry` places the points in the shared domain. */}
          <Card
            style={{ gap: 10 }}
            onLayout={(e) =>
              setChartWidth(e.nativeEvent.layout.width - space.cardPad * 2)
            }
          >
            <Kick>
              {t('progress.volume.heading', {
                span: `${VOLUME_WEEKS} ${t('progress.wk')}`,
              })}
            </Kick>
            {chartWidth > 0 && (
              <Spark
                values={volume.map((w) => w.volumeKg)}
                width={chartWidth}
                label={(value) => `${formatVolume(value, unit)} ${unit}`}
                range={(low, high) => `${low} – ${high}`}
                emptyLine={t('progress.frequency.empty_caption')}
              />
            )}
          </Card>

          <Records entries={records} unit={unit} />

          <StrengthList rows={data?.strength ?? []} unit={unit} />
        </View>
      )}

      {/* History, folded in. `docs/FRIENDS_PLAN.md` Part 3B: "what did I do"
          and "am I getting stronger" are the same question at two zoom levels,
          so the retrospective belongs in one place.

          OUTSIDE the branch above on purpose, and this is the whole reason it
          is a component rather than inlined JSX. `useHistory` is its own read
          on its own cadence; putting it inside would hide the ten-week grid
          and every session row behind a failed `fetchProgress`, which is the
          §12 defect the Coach merge fixed one level down and would have
          reintroduced one level up.

          The fast door survives: the circle beside Start on Train comes
          straight here, which the audit called the one piece of navigation
          worth keeping as furniture. */}
      <HistorySection quiet={state === 'failed' || sessions.length === 0} />
    </Screen>
  )
}
