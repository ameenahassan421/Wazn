import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { CHECK_INS, formatVolume, palette, space, type CheckIn } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Card } from '@/components/ui/Surface'
import { ChipBtn, ChipRow, HeroBtn } from '@/components/ui/Btn'
import { Header } from '@/components/ui/Header'
import { Plate } from '@/components/ui/Plate'
import { Screen } from '@/components/ui/Screen'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { useHome } from '@/hooks/use-home'

/**
 * Home, against `docs/design/prototype/source.html` — the screen labelled
 * "Home", which the prototype draws in full.
 *
 * ── WHAT THE PROTOTYPE PUTS HERE, IN ORDER ──────────────────────────────────
 * A header (mark, streak chip, avatar), a two-line greeting under a small
 * meta line, a coach card, an ink "Up next" card, and one ember CTA pinned at
 * the bottom. Five things. That is the whole screen, and the restraint is the
 * design: everything competing with "start" was taken OUT.
 *
 * ── WHAT WAS REMOVED, AND WHY IT COST NOTHING ───────────────────────────────
 * The v5 Home carried three stat tiles, a rank card and a plan manifest.
 * **None of them was ever wired on native.** `use-home.ts` returns
 * `{...DAY_ONE, username, target, routineName, daysRested}` and nothing else,
 * so `stats` stayed `{ streak: '—', thisWeek: '—', sessions: '—' }`, `plan`
 * stayed `[]` and `rank` stayed `null` on every render this app has ever done.
 * The tiles rendered three em-dashes; the plan and rank rendered nothing.
 * Removing them deleted placeholder chrome, not a feature — and they come
 * back the day the queries do, in this language.
 *
 * ── WHAT IS NOT DRAWN, BECAUSE THERE IS NO DATA FOR IT ──────────────────────
 * The prototype's header carries a `12 wk` chip and its meta line reads
 * "Tuesday · week 12 · 3 of 4 done". Neither the training-week count nor the
 * plan progress exists in any query this app makes. They are omitted rather
 * than faked: this repo's standing rule is that an absence is honest and a
 * fabricated figure on a screen whose whole job is to be trusted with numbers
 * is not. Same reason the coach card renders only when `brief` is non-null.
 *
 * ── WHERE THE NUMBER TO BEAT WENT ───────────────────────────────────────────
 * v5 gave it a card of its own — `BEAT 4,320 KG` at hero scale. The prototype
 * has no such card, and inventing one would be the reskin this migration
 * exists to avoid. It moves into the Up next card's third line, which is the
 * slot that answers "what am I about to do". Section 1's number survives; the
 * card it used to live in does not.
 */

/** The three taps, in the shared domain's own order, so the row cannot drift
 *  from the union `computeReadiness` scores. Values are catalogue keys, not
 *  labels: this screen owns which check-in is offered, `src/lib/i18n.ts` owns
 *  what it is called in each locale. */
const CHECK_IN_KEY: Record<CheckIn, string> = {
  fresh: 'checkin.fresh',
  normal: 'checkin.normal',
  drained: 'checkin.drained',
}

/** The local weekday, spelled out. `toLocaleDateString` rather than a table:
 *  the app already ships an Arabic locale and a hand-rolled list of seven
 *  English strings would be the one place that does not translate. */
function weekday(locale: string): string {
  return new Date().toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', {
    weekday: 'long',
  })
}

export default function LogHome() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const { unit, ready: unitReady } = useUnit()
  const home = useHome()

  // Waiting on the stored unit rather than rendering a figure and correcting
  // it: flipping 225 to 102 one frame after paint is worse than a blank frame.
  if (!unitReady || home.loading) {
    return <Screen scroll={false} />
  }

  const dayOne = home.target === null

  return (
    <Screen gutter={space.gutter}>
      <Header name={home.username} />

      {/* ── The greeting ───────────────────────────────────────────────────
          26 above and 18 below, the prototype's own. The meta line is what is
          TRUE today; the hero line is who you are and what you are here for. */}
      <View style={{ paddingTop: 26, paddingBottom: 18 }}>
        <Txt step="label" ink="muted" style={{ marginBottom: 8 }}>
          {dayOne || home.daysRested === null
            ? weekday(locale)
            : `${weekday(locale)} · ${
                home.daysRested === 0
                  ? t('today.rested_today')
                  : t('today.rested', { days: String(home.daysRested) })
              }`}
        </Txt>
        {/* `{routine}, {name}.` — the prototype's "Push day, Ameen." With no
            username there is no second line rather than an invented vocative:
            "Push day, lifter." is a worse greeting than none. */}
        <Txt step="hero">
          {dayOne ? t('today.welcome') : home.routineName}
          {home.username !== null ? `,\n${home.username}.` : '.'}
        </Txt>
      </View>

      <View style={{ gap: 12 }}>
        {/* ── The coach ────────────────────────────────────────────────────
            The hub plate at 30, and the sentence beside it. Renders only when
            there IS a sentence, and an empty coach card is a promise the
            screen cannot keep — so `useCoachLine` returns null in all three
            cases that matter: nothing true to say, the dial off Full, and the
            model dark. Never a placeholder, never a spinner. The line it does
            return is drawn from SQL and upgraded in place if a phrased one
            arrives; the card never re-lays-out around a loading state. */}
        {home.brief !== null && (
          <Card style={{ paddingVertical: 16, paddingHorizontal: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Plate size={30} variant="hub" color={palette.ink} />
              <View style={{ flex: 1 }}>
                <Kick style={{ marginBottom: 5 }}>{t('coach.kicker')}</Kick>
                <Txt step="body">{home.brief.line}</Txt>
              </View>
            </View>
          </Card>
        )}

        {/* ── Up next ──────────────────────────────────────────────────────
            The one ink surface on this screen. It is the NEXT thing rather
            than the current thing, and the inversion is how the prototype
            says so without a heading that explains it. */}
        <Card tone="ink" style={{ padding: 18 }}>
          <Kick ink="onInkMuted">{t('today.up_next')}</Kick>
          <Txt step="num" ink="onInk" style={{ marginTop: 8, marginBottom: 4 }}>
            {dayOne ? t('today.first_workout') : home.routineName}
          </Txt>
          <Txt step="label" ink="onInkMuted" ltr>
            {/* Not `log.start_first` — that is the button's own words, and a
                card that restates the button underneath it says nothing. */}
            {dayOne
              ? t('history.empty')
              : `${t('today.beat')} ${formatVolume(home.target ?? 0, unit)} ${unit}`}
          </Txt>
        </Card>

        {/* ── The check-in ─────────────────────────────────────────────────
            Not in the prototype, and kept because unlike the tiles it is
            LIVE: it reads and writes `daily_checkins`, and it is the one
            readiness input this app has that does not need a wearable. Below
            the fold of the two cards, because it is an input, not an answer.
            Never blocking — an unanswered check-in reads as Normal silently,
            which is why there is no "skip" and no confirmation. */}
        <View style={{ gap: 10, paddingTop: 2 }}>
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
      </View>

      {/* ── The one action ───────────────────────────────────────────────────
          58 tall, ember, glowing, with the plate as its glyph. The prototype
          pins it to the bottom of a fixed-height column; this screen scrolls,
          so it sits after the content instead. That is a real difference and
          the alternative is worse: a CTA absolutely positioned over a scroll
          view covers the last card on a small phone. */}
      <View style={{ paddingTop: 14, paddingBottom: 12 }}>
        <HeroBtn
          label={t('today.start_workout')}
          leading={<Plate size={20} color={palette.onInk} />}
          onPress={() => router.push('/session/new')}
        />
      </View>
    </Screen>
  )
}
