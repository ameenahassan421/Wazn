import { View } from 'react-native'

import {
  radius,
  space,
  formatEstimate,
  muscleLabel,
  reviewBandScale,
  type ReviewBlock,
  type Unit,
} from '@wazn/domain'

import { Card, Rule } from '@/components/ui/Surface'
import { Plate } from '@/components/ui/Plate'
import { Txt, Kick } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { usePalette } from '@/hooks/use-theme'

/**
 * The week's findings, as figures rather than as paragraphs.
 *
 * ── WHAT WAS WRONG WITH THE VERSION THIS REPLACES ───────────────────────────
 * Four identical white boxes, each holding a numbered kicker, a sentence in
 * body type, and a chip. It rendered correctly and it was dead on the page,
 * for two reasons that are worth separating.
 *
 * **Every number was buried in prose.** "Iso-Lateral Chest Press (Machine)
 * rose 52.7 lbs, from 107.4 to 160.1 lbs estimated 1RM" is a real achievement
 * set in 14.5px running text, indistinguishable at arm's length from the three
 * findings above it. This app's whole visual grammar is large tabular figures;
 * the one screen that exists to report figures was the one screen not using
 * them.
 *
 * **And all four read as bad news.** Zero sessions, zero working sets, three
 * lifts stalled, and then, in the same grey box, in the same type, in fourth
 * position, a 52.7 lb gain. `wellness-app-design`'s retention rule is that the
 * app "celebrates, not scolds", and a layout that cannot tell a win from a
 * failure is scolding four times and celebrating never.
 *
 * ── SO EACH SECTION GETS THE TREATMENT ITS DATA EARNS ───────────────────────
 * Same five sections, same order, every week. That predictability is the Edge
 * Function's own contract (`_shared/review-contract.ts`) and nothing here
 * reorders it. What changes is that a section now looks like what it is:
 *
 *   **Turning up** — eight dots for eight weeks, filled where trained. The
 *   figure is sessions this week; the dots are the context that stops one bad
 *   week reading as a verdict.
 *   **Volume** — a bar per muscle against the productive band, which is the
 *   one chart a strength tracker owes its user ("am I neglecting legs") and
 *   the one this app already had the numbers for.
 *   **Stalled** — the lift, and the estimate's move across the window.
 *   **Moving** — the ember wash card and the `full` plate. That treatment is
 *   reserved for earned things and lives on exactly one other surface, the
 *   Finish screen's beat-last-session card. This is the second, and it is the
 *   reason the section stops disappearing into the three above it.
 *
 * ── EVERY FIGURE HERE IS COMPUTED, NONE IS PHRASED ──────────────────────────
 * These come from `weekly_review()`, the RPC, not from the model. The model's
 * sentence still renders under each one at label size, doing the job it is
 * good at: saying what the figure MEANS. The figure says what it IS. If the
 * model is dark, the numbers are all still here, which is §12's requirement
 * discharged by construction rather than by a fallback.
 *
 * ── AND NONE OF THE CHROME IS ENGLISH ───────────────────────────────────────
 * Every fixed string goes through `t()`, including the ones that read like
 * units ("sets a week"). The first draft passed the four section names in as a
 * prop and then hardcoded three labels beside the numbers, which is the same
 * bug wearing a prop: a screen is localised or it is not.
 */

/*
 * Every weight on this screen is an e1RM or a change in one, so every one of
 * them goes through `formatEstimate` and NOT `toDisplayWeight`. That function
 * snaps to the nearest loadable plate, which is right for a weight you rack
 * and wrong here: it printed a 155.6 lb estimate as 156 while the Progress
 * screen printed 155.6, and `units.ts` spells out why that gap is dangerous —
 * a reader who learns the coach's figures are approximate is a reader who
 * cannot spot a real fabrication. The first draft of this file hand-rolled its
 * own rounding and reintroduced exactly that.
 */

/**
 * The shell every note shares: the mono index, the section kicker, whatever
 * figure or chart the section brings, and the model's sentence underneath.
 *
 * The sentence is LAST and it is `label`, not `body`. It used to lead, at body
 * size, which made four sections look like four paragraphs. A reader scanning
 * this tab wants the number; the sentence is there for the one they stop on.
 */
function Note({
  index,
  kicker,
  children,
  line,
}: {
  index: number
  kicker: string
  children: React.ReactNode
  line: string | null
}) {
  return (
    <View style={{ padding: space.cardPad, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {/* Mono, doing the one job mono is for on this system: counting. */}
        <Txt step="meta" ink="muted" ltr>
          {String(index).padStart(2, '0')}
        </Txt>
        <Kick style={{ flex: 1 }}>{kicker}</Kick>
      </View>
      {children}
      {line !== null && (
        <Txt step="label" ink="muted">
          {line}
        </Txt>
      )}
    </View>
  )
}

/**
 * A figure and its unit, the pairing this app uses everywhere a number is the
 * point. `fig` is 30px and tabular; the label beside it is deliberately much
 * quieter, per the gym-legibility rule that unit labels stay lighter than
 * values.
 *
 * The VALUE carries `ltr` and the label does not. A bare run of digits in an
 * RTL paragraph is the case that renders backwards; a number embedded in a
 * sentence is handled correctly by the bidi algorithm and forcing `ltr` on the
 * sentence would flip the Arabic instead.
 */
function Figure({
  value,
  label,
  tone = 'ink',
}: {
  value: string
  label: string
  tone?: 'ink' | 'accent'
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <Txt step="fig" ink={tone === 'accent' ? 'accent' : 'ink'} ltr>
        {value}
      </Txt>
      <Txt step="label" ink="muted" style={{ flex: 1 }}>
        {label}
      </Txt>
    </View>
  )
}

/**
 * Eight weeks, one dot each, filled where the lifter trained.
 *
 * `weeks_trained_of_8` is a COUNT, not a pattern. The RPC counts distinct
 * `date_trunc('week', ...)` values and does not say WHICH weeks, so the dots
 * fill from the start and this is a proportion drawn as dots rather than a
 * timeline. That is an honest reading of the number and the reason there are
 * no week labels under it: a labelled axis would claim an ordering the data
 * does not carry.
 */
function WeekDots({ trained, of }: { trained: number; of: number }) {
  const palette = usePalette()
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: of }, (_, i) => (
        <View
          key={i}
          style={{
            width: 18,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: i < trained ? palette.accent : palette.ring,
          }}
        />
      ))}
    </View>
  )
}

/** How many muscles the volume chart draws. See `Bands` for why it is a cap
 *  on the LOWEST rather than a sample. */
const BANDS_SHOWN = 6

/**
 * Weekly sets per muscle against the productive band.
 *
 * The band is drawn as a wash behind the track rather than as two tick marks,
 * because the question this chart answers is "am I inside it", and a filled
 * region answers that pre-attentively where a pair of lines needs reading.
 *
 * The track runs to `max * 1.25` so a muscle at the top of the band does not
 * touch the end and read as capped. Ember means inside the band; everything
 * else is ink at low emphasis. That is the accent doing semantic work, which
 * is the only work it is allowed to do.
 *
 * **The cap is not a sample.** `weekly_review()` returns up to 12 muscles
 * already sorted by sets ASCENDING, so the six drawn are the six LEAST
 * trained, which is the half of the distribution the section exists to
 * surface. A muscle dropped off the end is a muscle doing more volume than
 * all six shown. The count of hidden rows is printed under the chart rather
 * than left implicit.
 */
function Bands({
  bands,
  range,
}: {
  bands: ReviewBlock['bands']
  range: [number, number]
}) {
  const palette = usePalette()
  const { t, locale } = useLocale()
  const [low, high] = range
  const { shown, hidden, ceiling } = reviewBandScale(bands, range, BANDS_SHOWN)
  /** A percentage of the track. Typed as RN's own `%${number}` template so
   *  `width` and `start` accept it — a bare `string` does not satisfy
   *  `DimensionValue`, which is the compiler catching a real class of bug
   *  (`'50'` and `'50%'` are not the same layout). */
  const pct = (n: number): `${number}%` =>
    `${Math.min(100, Math.round((n / ceiling) * 1000) / 10)}%`

  return (
    <View style={{ gap: 8 }}>
      {shown.map((band) => (
        <View key={band.muscle} style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            {/* `muscle` is the raw enum off the column — 'biceps', 'glutes'.
                `muscleLabel` is the existing localised table for exactly
                these values, and without it the chart rendered lowercase
                English labels in both locales while every other muscle name
                in the app was translated. */}
            <Txt step="label" style={{ flex: 1 }} numberOfLines={1}>
              {muscleLabel(locale, band.muscle)}
            </Txt>
            <Txt step="meta" ink={band.status === 'in' ? 'accentSoft' : 'muted'} ltr>
              {String(band.sets)}
            </Txt>
          </View>
          <View
            style={{
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: palette.ring,
              overflow: 'hidden',
            }}
          >
            {/* The productive band, behind the value. `start` and `width` as
                percentages so it survives any container width, and `start`
                rather than `left` because this app grows an Arabic locale. */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                start: pct(low),
                width: pct(high - low),
                backgroundColor: palette.accentWash,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                start: 0,
                width: pct(band.sets),
                borderRadius: radius.pill,
                // Ember only when the muscle is inside the band. Out of it
                // the bar is `muted` — present and readable, but not claiming
                // the one hue this system reserves for the thing that is
                // right. There is no `inkSoft`; the first draft invented one.
                backgroundColor: band.status === 'in' ? palette.accent : palette.muted,
              }}
            />
          </View>
        </View>
      ))}
      <Txt step="meta" ink="muted">
        {t('coach.review.figure.band_target', {
          low: String(low),
          high: String(high),
        })}
        {hidden > 0
          ? ' · ' + t('coach.review.figure.band_more', { count: String(hidden) })
          : ''}
      </Txt>
    </View>
  )
}

/* ── The four notes ───────────────────────────────────────────────────────── */

export function CoachNotes({
  block,
  lines,
  unit,
}: {
  /** Null while the RPC is in flight or unavailable: the notes then render
   *  from the model's sentences alone, which is the old behaviour and still a
   *  correct one. */
  block: ReviewBlock | null
  /** The model's sentence per section key, or null where it said nothing. */
  lines: Record<string, string | null>
  unit: Unit
}) {
  const palette = usePalette()
  const { t } = useLocale()
  const a = block?.adherence ?? null
  const plateau = block?.plateaus?.[0] ?? null
  const win = block?.wins?.[0] ?? null

  return (
    <View style={{ gap: 12 }}>
      <Card
        bare
        style={{ borderStartWidth: 3, borderStartColor: palette.accent, gap: 0 }}
      >
        <Note
          index={1}
          kicker={t('coach.review.section.adherence')}
          line={lines.adherence}
        >
          {a !== null && (
            <>
              <Figure
                value={String(a.sessions_this_week)}
                label={t('coach.review.figure.sessions', {
                  avg: String(a.avg_sessions_per_week_8w),
                })}
              />
              <WeekDots trained={a.weeks_trained_of_8} of={8} />
            </>
          )}
        </Note>

        <Rule inset={space.cardPad} />

        <Note index={2} kicker={t('coach.review.section.bands')} line={lines.bands}>
          {block !== null && block.bands.length > 0 && (
            <Bands bands={block.bands} range={block.productive_range} />
          )}
        </Note>

        <Rule inset={space.cardPad} />

        <Note
          index={3}
          kicker={t('coach.review.section.plateaus')}
          line={lines.plateaus}
        >
          {plateau !== null && (
            <>
              <Txt step="cta" numberOfLines={1}>
                {plateau.exercise}
              </Txt>
              {/* The SLOPE, not the endpoints.
                  The first draft drew `first_e1rm → last_e1rm` and a real
                  account rendered "STALLED · 140 → 156", a 16 lb RISE
                  presented as a plateau. Both figures were accurate and the
                  pairing was a lie: `weekly_review()` selects a plateau on
                  `regr_slope(e1rm, n) <= 0`, the trend across every session,
                  and a lift that peaks mid-window can climb between its first
                  session and its last while trending flat. So the figure is
                  now the quantity the filter actually tests. It is negative
                  or zero by construction, which is the section's whole
                  claim. */}
              <Figure
                value={formatEstimate(plateau.slope_per_session, unit)}
                label={t('coach.review.figure.plateau_slope', {
                  unit,
                  sessions: String(plateau.sessions),
                })}
              />
            </>
          )}
        </Note>
      </Card>

      {/* ── Moving ───────────────────────────────────────────────────────
          Out of the rail card and onto the ember wash, with the `full`
          plate. That pairing is this system's earned treatment and it has
          lived on exactly one surface until now — Finish's beat-last-session
          card. A win reported in the same grey box as three failures is a win
          the reader never sees, and "celebrates, not scolds" is a layout
          decision before it is a copy decision. */}
      {win !== null ? (
        <Card
          tone="wash"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <Plate size={44} variant="full" />
          <View style={{ flex: 1, gap: 3 }}>
            <Kick ink="accentSoft">{t('coach.review.section.wins')}</Kick>
            <Txt step="fig" ink="accent" ltr>
              {`+${formatEstimate(win.gain, unit)} ${unit}`}
            </Txt>
            <Txt step="label" numberOfLines={2}>
              {`${win.exercise} · ${formatEstimate(win.e1rm_before, unit)} → ${formatEstimate(win.e1rm_28d, unit)}`}
            </Txt>
          </View>
        </Card>
      ) : (
        lines.wins !== null && (
          <Card bare style={{ borderStartWidth: 3, borderStartColor: palette.accent }}>
            <Note index={4} kicker={t('coach.review.section.wins')} line={lines.wins}>
              {null}
            </Note>
          </Card>
        )
      )}
    </View>
  )
}
