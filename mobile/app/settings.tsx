import { View } from 'react-native'
import { useRouter } from 'expo-router'

import type { Locale, Unit } from '@wazn/domain'
import { space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Btn, ChipBtn, ChipRow } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { Screen } from '@/components/ui/Screen'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'
import { signOut } from '@/services/auth'

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

export default function Settings() {
  const router = useRouter()
  const { locale, setLocale, t } = useLocale()
  const { unit, setUnit } = useUnit()

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

      <Kick style={{ marginBottom: 10 }}>PREFERENCES</Kick>
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
          <Txt step="meta" ink="faint">
            Display only. Every weight is stored in kilograms.
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
          <Txt step="meta" ink="faint" ltr>
            WAZN 0.1.0 · NATIVE
          </Txt>
        </View>
      </Card>

      {/* No confirmation dialog. Signing out is reversible in ten seconds and
          the offline queue survives it — `reconcileDeviceUser` is what clears
          a device, and it runs on a DIFFERENT user signing in, not on sign-out.
          A modal here would be theatre. */}
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
    </Screen>
  )
}
