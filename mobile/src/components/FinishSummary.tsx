import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, space, toDisplayWeight, type Unit } from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Plate } from '@/components/ui/Plate'
import { Card } from '@/components/ui/Surface'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'

/**
 * Finish, against `docs/design/prototype/source.html` — the screen labelled
 * "Finish". The last of the four the prototype draws.
 *
 * ── WHAT IS CLAIMED HERE IS ONLY WHAT CAN BE PROVED ─────────────────────────
 * The prototype closes with three things this build cannot yet say:
 *
 *   "workout 47"    a lifetime count. No query produces it.
 *   "New PR"        needs this session's best set compared against every
 *                   previous one. `exercise_bests` and migration 0009's record
 *                   trigger do that server-side; native reads neither.
 *   the debrief     a coach sentence. `ghost-reason` is not wired here.
 *
 * The ember card is kept and given the claim that IS provable: this session's
 * working volume against the last session's, which the live store already
 * holds as `targetKg` because the board chases it. "Beat last session" is a
 * smaller thing to say than "New PR" and it is true, which is the trade this
 * repo makes every time.
 *
 * ── AND ONE BUTTON, NOT TWO ─────────────────────────────────────────────────
 * The prototype pairs "Share card" with "Done". There is no share surface on
 * native — no image composer, no share sheet call — so the button would open
 * nothing. A control that does nothing is the defect this codebase keeps
 * finding in its own screenshots; "Done" goes full width until the card exists.
 */

/** One tile. Figure above label, the prototype's 22/11.5 pair. */
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <Card small style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 16 }}>
      <Txt step="num" ltr numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      <Txt step="caption" ink="muted" style={{ marginTop: 3 }}>
        {label}
      </Txt>
    </Card>
  )
}

export interface FinishRow {
  exercise: string
  setNumber: number
  weightKg: number | null
  reps: number | null
}

export function FinishSummary({
  elapsed,
  volumeKg,
  targetKg,
  rows,
  unit,
  onDone,
}: {
  elapsed: string
  volumeKg: number
  /** The last session's working volume. Null on day one. */
  targetKg: number | null
  rows: FinishRow[]
  unit: Unit
  onDone: () => void
}) {
  const insets = useSafeAreaInsets()
  const { t, locale } = useLocale()

  const shownVolume = Math.round(toDisplayWeight(volumeKg, unit))
  const beat = targetKg !== null && targetKg > 0 && volumeKg > targetKg
  const delta = beat ? Math.round(toDisplayWeight(volumeKg - (targetKg ?? 0), unit)) : 0

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper, paddingTop: insets.top }}>
      <View
        style={{ paddingTop: 26, paddingBottom: 18, paddingHorizontal: space.gutter }}
      >
        <Txt step="label" ink="muted" style={{ marginBottom: 8 }}>
          {new Date().toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', {
            weekday: 'long',
          })}
        </Txt>
        <Txt step="hero">{t('finish.title')}</Txt>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          gap: 12,
          paddingBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile value={elapsed} label={t('finish.duration')} />
          <Tile
            value={shownVolume.toLocaleString()}
            label={t('finish.volume_lifted', { unit })}
          />
          <Tile
            value={String(rows.length)}
            label={t(rows.length === 1 ? 'finish.set.one' : 'finish.set.other')}
          />
        </View>

        {beat && (
          <View
            style={{
              backgroundColor: palette.accentWash,
              borderRadius: 20,
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {/* The `full` plate — collars and all. It is the earned variant and
                this is the only screen allowed to use it. */}
            <Plate size={44} variant="full" />
            <View style={{ flex: 1 }}>
              {/* `accentSoft`, not `accent`. This is 12px text and raw ember is
                  3.51:1 on paper; the prototype sets it in `accent` and that
                  fails AA. See WAZN_PLAN 7.0. */}
              <Kick ink="accentSoft" style={{ marginBottom: 4 }}>
                {t('finish.beat_last')}
              </Kick>
              <Txt step="title" ltr>
                {t('finish.beat_last.detail', { delta: String(delta), unit })}
              </Txt>
            </View>
          </View>
        )}

        {rows.length > 0 && (
          <Card style={{ paddingVertical: 14, paddingHorizontal: 18, gap: 8 }}>
            {rows.map((row) => (
              <View
                key={`${row.exercise}-${row.setNumber}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Txt step="data" numberOfLines={1} style={{ flex: 1 }}>
                  {`${row.exercise} · ${t('finish.set_n', { n: String(row.setNumber) })}`}
                </Txt>
                <Txt step="data" ink="muted" ltr>
                  {row.weightKg === null
                    ? `${row.reps ?? 0}`
                    : `${toDisplayWeight(row.weightKg, unit)} × ${row.reps ?? 0}`}
                </Txt>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <View
        style={{
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 30),
          paddingHorizontal: space.gutter,
        }}
      >
        <Btn
          kind="ink"
          full
          label={t('finish.done')}
          onPress={onDone}
          style={{ height: 56 }}
        />
      </View>
    </View>
  )
}
