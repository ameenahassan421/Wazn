import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, space, toDisplayWeight, type Unit } from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Plate } from '@/components/ui/Plate'
import { Card } from '@/components/ui/Surface'
import { Txt, Kick } from '@/design/Txt'
import { useCoachLine } from '@/hooks/use-coach-line'
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
 *
 * **The debrief was the third, and it is here now.** `session_debrief()` is
 * the same RLS-scoped RPC the web reads, and `debriefSkeleton` the same
 * composer — both crossed into `@wazn/domain` on 2026-08-21. It says one thing
 * about the session's anchor lift and it is deliberately silent about volume,
 * sets and duration, which are on this screen already, in larger type, three
 * centimetres above it. Repeating them is the coach proving it can read.
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
  workoutId,
  sealed,
  onDone,
}: {
  elapsed: string
  volumeKg: number
  /** The last session's working volume. Null on day one. */
  targetKg: number | null
  rows: FinishRow[]
  unit: Unit
  /** Null before the workout row exists — an offline session still queuing. */
  workoutId: string | null
  /** `ended_at` has landed. Until it has, `session_debrief()` cannot see this
   *  workout at all; see `live-workout.ts`. */
  sealed: boolean
  onDone: () => void
}) {
  const insets = useSafeAreaInsets()
  const { t, locale } = useLocale()

  /**
   * Asked for only once the row is sealed, and null the whole time it is not.
   * There is no spinner and no "generating…" — the card is simply absent until
   * there is a true sentence for it, which on a first-ever session and on a
   * phone with no signal is the whole time.
   */
  const debrief = useCoachLine(
    workoutId !== null && sealed ? { surface: 'debrief', workoutId } : null,
  )

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

        {/* `tone="wash"` rather than the three literals it used to inline.
            Identical pixels — `wash` IS `palette.accentWash`, `radius.card` IS
            20 and `space.cardPad` IS 18 — and it makes the ember card the only
            selector of a tone that was otherwise dead in `Surface.tsx`. A
            variant nothing selects and a surface that hand-rolls it are the
            same defect seen from two ends. */}
        {beat && (
          <Card
            tone="wash"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
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
          </Card>
        )}

        {/* ── The debrief ──────────────────────────────────────────────────
            Under the ember card and above the receipt: it comments on the
            session, so it follows the claim and precedes the evidence. Plain
            white, no accent. The ember card is this screen's one hero and a
            second coloured surface would split it. */}
        {debrief !== null && (
          <Card style={{ paddingVertical: 16, paddingHorizontal: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Plate size={30} variant="hub" color={palette.ink} />
              <View style={{ flex: 1 }}>
                <Kick style={{ marginBottom: 5 }}>{t('coach.kicker')}</Kick>
                <Txt step="body">{debrief}</Txt>
              </View>
            </View>
          </Card>
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
