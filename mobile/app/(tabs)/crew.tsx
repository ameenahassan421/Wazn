import { useCallback, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { palette, radius, space } from '@wazn/domain'

import { Card, Rule } from '@/components/ui/Surface'
import { Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { tick } from '@/services/haptics'
import {
  TARGET_MAX,
  TARGET_MIN,
  fetchBoard,
  setWeeklyTarget,
  type BoardRow,
} from '@/services/crew'
import { supabaseConfigError } from '@/services/supabase'

/**
 * Screen — Crew. The Week Board.
 *
 * ── IT WORKS AT n=1, WHICH IS THE ENTIRE POINT OF S0 ────────────────────────
 * `docs/FRIENDS_PLAN.md` F6: "the empty state is the product, not a
 * placeholder". With no crew this is the same board with one row, showing this
 * week against the lifter's own four-week average. It is real, it is theirs,
 * and it is never empty.
 *
 * This replaced a 24-line stub whose only string was hardcoded English
 * ("A leaderboard of one. Invite someone to chase.") sitting outside the
 * catalogue, so the one screen about other people was the one screen that could
 * not be read in Arabic.
 *
 * Production on 2026-08-22: nine profiles, ONE follow row. The solo board is
 * not the degenerate case, it is the only case that exists.
 *
 * ── RANKED ON RELIABILITY, AND THE ROW SAYS SO IN WORDS ─────────────────────
 * `week_board()` orders on adherence and caps it at 2. That cap is a SORT KEY
 * and is deliberately never rendered: a row reading "2.00" tells a lifter
 * nothing, where "6 of 3 this week" tells them exactly where they stand. The
 * bar is the only place the ratio appears, and it is a picture rather than a
 * number.
 */

/** 0 to 1, for the bar. Uncapped adherence would let one big week run the fill
 *  off the end of the card; the SQL cap at 2 is for ordering, this is for
 *  pixels, and they are different jobs done in different places. */
function fill(row: BoardRow): number {
  const goal = row.weeklyTarget ?? (row.avgSessions4w > 0 ? row.avgSessions4w : 0)
  if (goal <= 0) return 0
  return Math.max(0, Math.min(1, row.sessionsThisWeek / goal))
}

function BoardRowView({ row, first }: { row: BoardRow; first: boolean }) {
  const { t } = useLocale()
  const goal = row.weeklyTarget
  const name = row.isMe
    ? t('crew.you')
    : (row.displayName ?? row.username ?? t('crew.someone'))

  return (
    <View>
      {!first && <Rule inset={space.cardPad} />}
      <View style={{ paddingHorizontal: space.cardPad, paddingVertical: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Txt step="title" style={{ flex: 1 }} numberOfLines={1}>
            {name}
          </Txt>
          {/* Tabular, and `ltr` so "6 of 3" does not reorder in Arabic: it is a
              figure pair, not a sentence. */}
          <Txt step="num" ltr>
            {goal === null
              ? String(row.sessionsThisWeek)
              : t('crew.of', {
                  done: String(row.sessionsThisWeek),
                  goal: String(goal),
                })}
          </Txt>
        </View>

        {/* The bar. `ring` track, ink fill, ember ONLY when the target is met,
            so the accent marks an achievement rather than decorating a row. */}
        <View
          style={{
            height: 6,
            borderRadius: radius.chip / 2,
            backgroundColor: palette.ring,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${fill(row) * 100}%`,
              height: 6,
              borderRadius: radius.chip / 2,
              backgroundColor:
                goal !== null && row.sessionsThisWeek >= goal
                  ? palette.accent
                  : palette.muted,
            }}
          />
        </View>

        <Txt step="caption" ink="muted">
          {t('crew.average', { avg: row.avgSessions4w.toFixed(1) })}
        </Txt>
      </View>
    </View>
  )
}

/** The target stepper. Same 34px keys as the routine editor's, for the same
 *  reason: a list-row control, not a board control. */
function TargetStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const key = {
    width: 34,
    height: 34,
    borderRadius: radius.ctl,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.ring,
    alignItems: 'center',
    justifyContent: 'center',
  } as const
  const slop = Math.round((space.touch - 34) / 2)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="−"
        hitSlop={slop}
        disabled={value <= TARGET_MIN}
        onPress={() => {
          tick()
          onChange(value - 1)
        }}
        // Static, never a style callback. See `Btn.tsx`.
        style={[key, { opacity: value <= TARGET_MIN ? 0.3 : 1 }]}
      >
        <Txt step="pill">−</Txt>
      </Pressable>
      <Txt step="num" ltr style={{ minWidth: 34, textAlign: 'center' }}>
        {String(value)}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+"
        hitSlop={slop}
        disabled={value >= TARGET_MAX}
        onPress={() => {
          tick()
          onChange(value + 1)
        }}
        style={[key, { opacity: value >= TARGET_MAX ? 0.3 : 1 }]}
      >
        <Txt step="pill">+</Txt>
      </Pressable>
    </View>
  )
}

export default function CrewScreen() {
  const { t } = useLocale()
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [error, setError] = useState<string | null>(
    supabaseConfigError === null ? null : t('crew.error'),
  )
  /** The last target write failed and the number on screen was put back. */
  const [targetError, setTargetError] = useState(false)

  /*
   * On focus, not on mount. Finishing a workout changes this week's count, and
   * the board is a tab the lifter returns to rather than a screen they open
   * once. Previous rows are kept while the refetch is in flight, so coming back
   * does not blank the card. Same posture as Plan.
   */
  useFocusEffect(
    useCallback(() => {
      if (supabaseConfigError !== null) return
      let live = true
      void fetchBoard()
        .then((next) => {
          if (live) setRows(next)
        })
        .catch(() => {
          if (live) setError(t('crew.error'))
        })
      return () => {
        live = false
      }
      // `t` is stable per locale; refetching on a language change is not wanted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const me = rows?.find((r) => r.isMe) ?? null
  const target = me?.weeklyTarget ?? 3

  /*
   * Written through, then reflected locally, rather than refetching the board.
   * The target is the only thing on this screen the lifter can change, and a
   * round trip per tap on a stepper would make it lag behind the thumb.
   *
   * ── A FAILED WRITE PUTS THE NUMBER BACK, AND SAYS SO ──────────────────────
   * This was `.catch(() => {})`. The optimistic number stayed on screen, the
   * server kept the old one, and the next focus quietly replaced it: the lifter
   * sets 5, sees 5, comes back to the tab later and it is 3 again with nothing
   * to explain why. A control that appears to work and does not is the failure
   * mode this repo has hit most often, and it is the reason
   * `silent-failure-hunter` exists.
   *
   * So the revert happens immediately, next to the action that caused it, and
   * carries a line. Reverting without saying anything would be the same defect
   * with faster timing.
   */
  function changeTarget(next: number) {
    if (me === null) return
    const previous = me.weeklyTarget
    const clamped = Math.min(TARGET_MAX, Math.max(TARGET_MIN, next))
    setRows((current) =>
      current === null
        ? current
        : current.map((r) => (r.isMe ? { ...r, weeklyTarget: clamped } : r)),
    )
    setTargetError(false)
    void setWeeklyTarget(clamped).catch(() => {
      setRows((current) =>
        current === null
          ? current
          : current.map((r) => (r.isMe ? { ...r, weeklyTarget: previous } : r)),
      )
      setTargetError(true)
    })
  }

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('crew.kicker')}</Kick>

      <View style={{ gap: 12 }}>
        {error !== null ? (
          <Card>
            <Txt step="body">{error}</Txt>
          </Card>
        ) : rows === null ? (
          /* A blank frame on the right ground, not a spinner. One round trip. */
          <View style={{ height: 140 }} />
        ) : (
          <>
            <Card bare style={{ overflow: 'hidden' }}>
              {rows.map((r, i) => (
                <BoardRowView key={r.userId} row={r} first={i === 0} />
              ))}
            </Card>

            {me !== null && (
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Txt step="body" style={{ flex: 1 }}>
                    {t('crew.target')}
                  </Txt>
                  <TargetStepper value={target} onChange={changeTarget} />
                </View>
                {/* The one sentence that explains the ranking, on the screen
                    the ranking happens. F2's decision is invisible otherwise:
                    a lifter cannot tell adherence from volume by looking. */}
                <Txt step="caption" ink="muted">
                  {targetError ? t('crew.target.failed') : t('crew.target.note')}
                </Txt>
              </Card>
            )}

            {rows.length === 1 && (
              /* Not an `Empty` card. The board above is real and full, so a
                 64px ring glyph announcing an absence would contradict the
                 screen it sits under. F6: the invite is an addition to a
                 working screen, never the price of entry to a blank one. */
              <Txt step="caption" ink="muted" style={{ marginTop: 2 }}>
                {t('crew.alone')}
              </Txt>
            )}
          </>
        )}
      </View>
    </Screen>
  )
}
