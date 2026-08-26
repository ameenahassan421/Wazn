import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'

import { space, toDisplayWeight } from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Spark } from '@/components/ui/Spark'
import { Txt, Kick } from '@/design/Txt'
import { useBody } from '@/hooks/use-body'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'

/**
 * Body weight, as one card on Progress.
 *
 * ── WHY IT IS HERE, AGAINST AN EARLIER DECISION ─────────────────────────────
 * The plan has always said body weight becomes one card beside the strength
 * list. On 2026-08-22 that was refused on the data: `body_weights` holds ONE
 * row across all nine accounts and zero on Ameen's, so the card would be a
 * permanent empty state on the screen whose whole job is evidence of getting
 * stronger. Ameen overrode that on 2026-08-25. The override is right for a
 * reason the earlier note missed: the ONLY door to the Body screen in the
 * whole app is a row in Settings (`settings.tsx:327`), so the app was asking
 * for weigh-ins nowhere and then concluding that nobody had logged any.
 *
 * A card that renders empty is a defect. A card that renders empty AND is the
 * door to the screen that fills it is the fix for what made it empty.
 *
 * ── SO THE EMPTY STATE IS THE STATE WITH THE CARE IN IT ─────────────────────
 * It is the state Ameen will see on his own device. It gets the same kicker,
 * the same box and the same door as the full one; what it does not get is a
 * fabricated figure. There is no `—` where the number goes, for the reason
 * `body.tsx` already writes down: a dash at the figure step is a solid bar the
 * width of two digits, and it reads as a redaction rather than an absence.
 *
 * ── ITS OWN READ, ON ITS OWN CADENCE ────────────────────────────────────────
 * `useBody`, not a field on `fetchProgress`. Same posture as `WeekReview` and
 * `HistorySection` beside it, and for the same §12 reason: hanging a weigh-in
 * off the sessions query would hide the body chart behind a failed read of
 * something unrelated to it.
 *
 * And it refreshes on FOCUS, which `useBody` now does for every caller rather
 * than exposing a `reload` each one has to remember: Progress is a tab the
 * lifter returns to, this card stays mounted, and the door it draws leads to
 * the one screen whose purpose is to change this number — so a mount-only read
 * showed the old weight immediately after logging the new one.
 */
export function BodyCard({ quiet = false }: { quiet?: boolean }) {
  const { t } = useLocale()
  const { unit, ready } = useUnit()
  const { loading, error, series, latestKg, averageKg, steady } = useBody()
  /** Measured, not guessed: an SVG wider than its card clips silently. */
  const [chartWidth, setChartWidth] = useState(0)

  // The unit is a preference read from storage, and rendering kilos for a
  // pound account for one frame is a visible flicker on the one number this
  // card exists for.
  if (!ready || loading) return null

  /* Quiet when Progress is already drawing its own failure card. Two sentences
     answering the same question in two registers is worse than one — the rule
     `HistorySection` states for the same situation. Not quiet otherwise: a
     read that died is not the same as a lifter who has never weighed in, and
     collapsing the two is how a broken card looks like an empty one. */
  if (error !== null) {
    if (quiet) return null
    return (
      <Card style={{ marginTop: space.gutter, gap: 6 }}>
        <Kick>{t('nav.body')}</Kick>
        <Txt step="label" ink="muted">
          {error}
        </Txt>
      </Card>
    )
  }

  const door = (
    <Btn
      kind="line"
      small
      label={t('body.log_weigh_in')}
      onPress={() => router.push('/body')}
    />
  )

  if (latestKg === null) {
    // Hidden entirely on the day-one screen. A brand-new account already has
    // one empty state above this and one below it; a third is not information.
    if (quiet) return null
    return (
      <Card style={{ marginTop: space.gutter, gap: 10 }}>
        <Kick>{t('nav.body')}</Kick>
        <Txt step="label" ink="muted">
          {t('progress.body.empty')}
        </Txt>
        <View style={{ alignItems: 'flex-start' }}>{door}</View>
      </Card>
    )
  }

  /* `marginTop` on every branch rather than a parent gap: this card renders
     OUTSIDE Progress's `gap: 12` stack, on purpose, so nothing lays it out.
     Without it the card's hairline ring sat flush against the strength list's.
     `HistorySection`, in the identical position, carries the same margin on
     all three of its branches for the same reason. */
  return (
    <Card
      style={{ marginTop: space.gutter, gap: 10 }}
      onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - space.cardPad * 2)}
    >
      <Kick>{t('body.weight')}</Kick>

      {/* The reading and the average on one baseline: the figure is what you
          weigh, the line beside it is what that has meant for a month. A
          single morning swings a kilo on water, which is why the average is
          on the card at all rather than left to the chart. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Txt step="fig" ltr>
          {String(toDisplayWeight(latestKg, unit))}
          <Txt step="num" ink="muted" ltr>
            {` ${unit}`}
          </Txt>
        </Txt>
        <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
          {averageKg !== null && (
            <Txt step="caption" ink="muted" ltr>
              {t('body.average', {
                n: String(toDisplayWeight(averageKg, unit)),
                unit,
              })}
            </Txt>
          )}
          {steady && (
            <Txt step="caption" ink="accentSoft">
              {t('body.steady')}
            </Txt>
          )}
        </View>
      </View>

      {/* `series` is windowed to twelve weeks by `useBody`, which is what makes
          the kicker's "12 wk" true — and the window is why the empty line is
          CHOSEN rather than fixed. `Spark` answers a series it cannot draw a
          trend from with a sentence; "one reading so far" is the right sentence
          for a lifter with one weigh-in and the wrong one for a lifter with
          fifty, none of them inside twelve weeks. Rendered unconditionally, so
          the second case says something instead of the card silently losing its
          chart under a kicker still promising one. */}
      {chartWidth > 0 && (
        <Spark
          values={series.map((point) => toDisplayWeight(point.kg, unit))}
          width={chartWidth}
          label={(value) => String(value)}
          range={(low, high) => t('body.range', { low, high, unit })}
          emptyLine={
            series.length === 0 ? t('body.none_recent') : t('body.one_reading')
          }
        />
      )}

      <View style={{ alignItems: 'flex-start' }}>{door}</View>
    </Card>
  )
}
