import { useState } from 'react'
import { I18nManager, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'

import type { Locale, Unit } from '@wazn/domain'
import { COACH_VOLUMES, palette, space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Btn, ChipBtn, ChipRow } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { useCoach } from '@/hooks/use-coach'
import { Screen } from '@/components/ui/Screen'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { signOut } from '@/services/auth'
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
      <View
        style={{
          width: 8,
          height: 8,
          borderTopWidth: 2,
          borderEndWidth: 2,
          borderColor: palette.muted,
          transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }, { rotate: '45deg' }],
        }}
      />
    </Pressable>
  )
}

export default function Settings() {
  const router = useRouter()
  const { locale, setLocale, t } = useLocale()
  const { unit, setUnit } = useUnit()
  const { volume, setVolume } = useCoach()

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

          Volume, not mode. `COACH_MODES` is a lens over the same history and
          belongs on the Coach tab beside what it changes (v5 screen 15); a
          mode picker buried in Settings would be the one place a lifter never
          looks for it. */}
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
        <DoorRow label={t('nav.friends')} onPress={() => router.push('/friends')} />
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
