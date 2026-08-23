import { useState } from 'react'
import { I18nManager, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { useRouter } from 'expo-router'

import type { CoachMode, Locale, ThemeChoice, Unit } from '@wazn/domain'
import {
  COACH_MODES,
  COACH_VOLUMES,
  MODE_BEHAVIOUR,
  isModeReady,
  radius,
  space,
} from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Btn, ChipBtn, ChipRow } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { Chip } from '@/components/ui/Chip'
import { useCoach } from '@/hooks/use-coach'
import { Screen } from '@/components/ui/Screen'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { signOut } from '@/services/auth'
import { usePalette, useTheme } from '@/hooks/use-theme'
import { AUTH_ENABLED } from './_layout'

/**
 * Screen 17 — Settings. Reached from the header avatar, and from nowhere
 * else: it is the rarest screen in the app by design, which is also why it
 * has no tab.
 *
 * Only the unit preference is wired. The coach-volume dial, the data-source
 * toggles and export need the account tables, and a toggle that flips and
 * changes nothing is worse than one that is not there yet.
 */
const UNITS: readonly { key: Unit; label: string }[] = [
  { key: 'lbs', label: 'lbs' },
  { key: 'kg', label: 'kg' },
]

/**
 * The two languages, each named in its own script.
 *
 * `settings.language.en` is `EN` and `settings.language.ar` is `العربية` in
 * BOTH locales, deliberately: a picker that renders every option in the
 * reader's current script is unreadable to the one person who needs it, the
 * one looking for the language they are about to switch TO.
 */
const LOCALES: readonly { key: Locale; labelKey: string }[] = [
  { key: 'en', labelKey: 'settings.language.en' },
  { key: 'ar', labelKey: 'settings.language.ar' },
]

/**
 * System first, and it is the default.
 *
 * Three options rather than a two-state switch, because "follow my phone" is
 * a different answer from "light" and collapsing it loses the only one that
 * changes with the time of day. A binary toggle has to pick a side the moment
 * it is drawn, which silently opts the lifter out of their own OS setting.
 *
 * Order is System, Light, Dark and not alphabetical: it reads as the default
 * followed by the two overrides, which is the shape of the decision.
 */
const THEMES: readonly { key: ThemeChoice; labelKey: string }[] = [
  { key: 'system', labelKey: 'settings.theme.system' },
  { key: 'light', labelKey: 'settings.theme.light' },
  { key: 'dark', labelKey: 'settings.theme.dark' },
]

/**
 * A settings row that goes somewhere.
 *
 * The chevron is a rotated square rather than an icon-set glyph, for the same
 * reason the tab marks are: this app draws its own chrome from a plate, a bar
 * and a disc, and one imported arrow would be the only foreign shape in it.
 * `scaleX` against `I18nManager` rather than a second rotation constant,
 * because a chevron is the one mark here that MUST point the other way in
 * Arabic.
 */
function DoorRow({ label, onPress }: { label: string; onPress: () => void }) {
  const palette = usePalette()
  const [down, setDown] = useState(false)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      // Static, never `({ pressed }) => ...` — see `Btn.tsx`.
      style={{
        padding: space.cardPad,
        minHeight: space.touch,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: down ? 0.6 : 1,
      }}
    >
      <Txt step="body">{label}</Txt>
      {/*
        The chevron, and it pointed UP in Arabic until 2026-08-22.
        `borderEndWidth` is logical: it is already the LEFT border on an RTL
        build, so the square arrives with its top and left edges drawn and the
        `scaleX: -1` that was here flipped it a second time. Two mirrors and a
        clockwise rotation left the corner pointing at the ceiling, on both
        rows of the More card, on a screen that had only ever been looked at
        in English.
        One flip, not two: the border stays logical and the ROTATION carries
        the direction. Top+end rotated +45 points at the end edge either way.
      */}
      <View
        style={{
          width: 8,
          height: 8,
          borderTopWidth: 2,
          borderEndWidth: 2,
          borderColor: palette.muted,
          transform: [{ rotate: I18nManager.isRTL ? '-45deg' : '45deg' }],
        }}
      />
    </Pressable>
  )
}

/**
 * One mode card.
 *
 * The active one takes a 2px ember ring and an "Active" chip; v5 §15 specifies
 * `0 0 0 2px em` and this is that, as a border rather than a shadow, because
 * React Native has no ring and a shadow would lift the card off the paper.
 * `dashed` is meet prep's undated state, and it is the only dashed border in
 * the app.
 */
function ModeCard({
  mode,
  active,
  dashed,
  detail,
  onPress,
}: {
  mode: CoachMode
  active: boolean
  dashed: boolean
  /** The right-hand label: "Active", "Set meet date", "6 wk out". */
  detail: string | null
  onPress: (() => void) | null
}) {
  const palette = usePalette()
  const { t } = useLocale()
  const [pressed, setPressed] = useState(false)
  const behaviour = MODE_BEHAVIOUR[mode]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: onPress === null }}
      disabled={onPress === null}
      // Never a `style` callback. `eslint.config.js` fails the build on it and
      // CLAUDE.md records why: it was silently dropped once and rendered every
      // button in this app invisible for three days.
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress ?? undefined}
      style={{
        borderRadius: radius.card,
        padding: space.cardPad,
        backgroundColor: dashed ? 'transparent' : palette.card,
        /*
         * No border at all when dashed, because React Native cannot draw one.
         *
         * This was `borderStyle: dashed ? 'dashed' : 'solid'`, and iOS logs
         * `Unsupported dashed / dotted border style` and silently falls back
         * to SOLID for any dashed border on a rounded box. So the one visual
         * cue distinguishing "meet prep needs a date" from an ordinary
         * selectable mode did not exist: it rendered as a plain solid card
         * with a transparent fill.
         *
         * The dashes are drawn below as an SVG `Rect`, which honours
         * `strokeDasharray` the way `Spark.tsx` has all along.
         */
        borderWidth: dashed ? 0 : active ? 2 : 1.5,
        borderColor: active ? palette.accent : palette.ring,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      {/* The dashed edge, drawn rather than declared. `rx` matches
          `radius.card` so it traces the same corner the solid variant has, and
          the 1.5 inset keeps a 1.5-wide stroke inside its own box instead of
          clipping half of it against the edge. */}
      {dashed && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Rect
              x={0.75}
              y={0.75}
              width="100%"
              height="100%"
              rx={radius.card}
              fill="none"
              stroke={active ? palette.accent : palette.ring}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          </Svg>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt step="cta" style={{ flex: 1 }}>
          {t(behaviour.titleKey)}
        </Txt>
        {detail !== null && <Chip>{detail}</Chip>}
      </View>
      <Txt step="label" ink="muted" style={{ marginTop: 4 }}>
        {t(behaviour.bodyKey)}
      </Txt>
    </Pressable>
  )
}

export default function Settings() {
  const router = useRouter()
  const { locale, setLocale, t } = useLocale()
  const { unit, setUnit } = useUnit()
  const { choice, setChoice } = useTheme()
  const { volume, setVolume, mode, setMode, speaks } = useCoach()

  return (
    <Screen>
      <View style={{ height: 56, justifyContent: 'center' }}>
        <Btn
          kind="ghost"
          small
          label={`← ${t('settings.back')}`}
          onPress={() => router.back()}
        />
      </View>

      {/* ── The coach ─────────────────────────────────────────────────────
          The dial existed as a stored preference and two gates for exactly one
          commit before this: `use-coach` shipped, the board honoured it, and
          nothing let a lifter change it. A gate nobody can reach is not a
          feature.

          **And the MODE selector, since 2026-08-22.** This comment used to
          argue the opposite: that a mode belongs "on the Coach tab beside what
          it changes" and that Settings is where a lifter would never look for
          it. `docs/FRIENDS_PLAN.md` Part 3B retires the Coach tab, so half of
          that argument no longer has a place to point at, and the other half
          was already weak. A mode is a PREFERENCE. It changes how the ghosts
          behave tomorrow, it is set once and left, and it sits beside the
          volume dial which is the same kind of thing. */}
      <Kick style={{ marginBottom: 10 }}>{t('settings.coach')}</Kick>
      <Card bare style={{ marginBottom: space.gutter }}>
        <View style={{ padding: space.cardPad, gap: 10 }}>
          <Txt step="body">{t('settings.coach.volume')}</Txt>
          <ChipRow>
            {COACH_VOLUMES.map((v) => (
              <ChipBtn
                key={v}
                label={t(`settings.coach.volume.${v}`)}
                selected={volume === v}
                onPress={() => setVolume(v)}
              />
            ))}
          </ChipRow>
          {/* `label`, not `meta`. Mono is this system's MACHINE voice — set
              counts, timestamps, plate maths — and a four-line paragraph in it
              is a v5 leftover that reads like a terminal. Prose is Hanken. */}
          <Txt step="label" ink="muted">
            {t('settings.coach.note')}
          </Txt>
        </View>

        {/* ── Mode ────────────────────────────────────────────────────────
            Below the dial and behind the same gate. A mode is only meaningful
            while the coach is allowed to act on it, so under Quiet or Off it
            is not a choice worth offering. */}
        {speaks && (
          <>
            <Rule />
            <View style={{ padding: space.cardPad, gap: 10 }}>
              <Txt step="body">{t('mode.kicker')}</Txt>
              {COACH_MODES.map((id) => {
                /* No meet date is stored on native yet, so `isModeReady` is
                   the whole gate: true for the two modes that need nothing,
                   false for meet prep until a date exists. Meet prep renders
                   dashed and reads "Set meet date", which is a labelled
                   precondition rather than a dead control. Selecting it with
                   no date would make `ghost-reason` REFUSE to seed, silently
                   stopping ghosts a lifter relies on with no way back. */
                const ready = isModeReady(id, null)
                return (
                  <ModeCard
                    key={id}
                    mode={id}
                    active={mode === id}
                    dashed={!ready}
                    detail={
                      !ready
                        ? t('mode.set_date')
                        : mode === id
                          ? t('mode.active')
                          : null
                    }
                    onPress={ready ? () => setMode(id) : null}
                  />
                )
              })}
            </View>
          </>
        )}
      </Card>

      {/* ── The two screens that came off the tab bar ────────────────────
          Body and Friends lost their tabs on 2026-08-21 when the bar went from
          six to four (`docs/FRIENDS_PLAN.md` Part 3B: Body held two rows in
          production and a sixth of the navigation). Off the bar with no door is
          not "dissolved", it is deleted-without-deleting, and native has no
          harness that would have caught it — `npm run shots` checks the WEB
          app's doors. So they get one here until Progress absorbs the body
          chart and Crew earns the bar back at S1. */}
      <Kick style={{ marginBottom: 10 }}>{t('settings.more')}</Kick>
      <Card bare style={{ marginBottom: 20 }}>
        <DoorRow label={t('nav.body')} onPress={() => router.push('/body')} />
        <Rule />
      </Card>

      {/* Was the literal 'PREFERENCES', which `Kick` uppercases anyway. Caught
          on a simulator with the app in Arabic, sitting between المزيد and
          الوحدات — two translated headings with an English one between them.
          Same class as the notification copy a peer audit found the same
          evening: strings that were typed rather than looked up. */}
      <Kick style={{ marginBottom: 10 }}>{t('settings.prefs')}</Kick>
      <Card bare>
        <View style={{ padding: space.cardPad, gap: 10 }}>
          <Txt step="body">{t('settings.units')}</Txt>
          {/* Display only. Weight is stored in kilograms and nothing this
              toggle does reaches the database. */}
          <ChipRow>
            {UNITS.map((u) => (
              <ChipBtn
                key={u.key}
                label={u.label}
                selected={unit === u.key}
                onPress={() => setUnit(u.key)}
              />
            ))}
          </ChipRow>
          <Txt step="label" ink="muted">
            {t('settings.units.note')}
          </Txt>
        </View>
        <Rule />
        {/* Switching to Arabic translates every string on the next render.
            The LAYOUT does not mirror until the bundle reloads, because
            `I18nManager.forceRTL` only applies to views built after it is
            set. `use-locale.tsx` explains why nothing here restarts the app
            to hide that. */}
        <View style={{ padding: space.cardPad, gap: 10 }}>
          <Txt step="body">{t('settings.language')}</Txt>
          <ChipRow>
            {LOCALES.map((l) => (
              <ChipBtn
                key={l.key}
                label={t(l.labelKey)}
                selected={locale === l.key}
                onPress={() => setLocale(l.key)}
              />
            ))}
          </ChipRow>
        </View>
        <Rule />
        {/* The ground. Applies on the tap with no reload, unlike the language
            row above it: a palette is read at render and `I18nManager` is not.
            Stored as the CHOICE, so picking System keeps following the phone
            rather than freezing whatever the phone said at that moment. */}
        <View style={{ padding: space.cardPad, gap: 10 }}>
          <Txt step="body">{t('settings.theme')}</Txt>
          <ChipRow>
            {THEMES.map((th) => (
              <ChipBtn
                key={th.key}
                label={t(th.labelKey)}
                selected={choice === th.key}
                onPress={() => setChoice(th.key)}
              />
            ))}
          </ChipRow>
        </View>
        <Rule />
        <View style={{ padding: space.cardPad }}>
          <Txt step="meta" ink="muted" ltr>
            WAZN 0.1.0 · NATIVE
          </Txt>
        </View>
      </Card>

      {/* Hidden while auth is off (`AUTH_ENABLED` in `app/_layout.tsx`, Ameen
          2026-08-20). A sign-out button with no session to end would clear
          nothing and swap to a stack that is not mounted — a control that
          looks live and does nothing, which is the exact defect class this
          repo keeps finding. The code stays; only the button is gone.

          When it comes back: no confirmation dialog. Signing out is reversible
          in ten seconds and the offline queue survives it —
          `reconcileDeviceUser` is what clears a device, and it runs on a
          DIFFERENT user signing in, not on sign-out. A modal here would be
          theatre. */}
      {AUTH_ENABLED ? (
        <Btn
          kind="line"
          full
          label={t('settings.signout')}
          style={{ marginTop: 18 }}
          onPress={() => {
            // The root guard swaps the stack the moment the session clears, so
            // there is nothing to navigate to by hand.
            void signOut()
          }}
        />
      ) : null}
    </Screen>
  )
}
