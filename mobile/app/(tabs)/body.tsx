import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'

import {
  fromDisplayWeight,
  palette,
  radius,
  space,
  toDisplayWeight,
} from '@wazn/domain'

import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Spark } from '@/components/ui/Spark'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { Txt, Kick } from '@/design/Txt'
import { TYPE } from '@/design/type'
import { useBody } from '@/hooks/use-body'
import { useLocale } from '@/hooks/use-locale'
import { useUnit } from '@/hooks/use-unit'

/**
 * Body — weigh-ins.
 *
 * ── IT USED TO BE AN INSTRUCTION WITH NOTHING BEHIND IT ─────────────────────
 * This screen was 24 lines whose entire content was "Log a weigh-in to start
 * the second chart." There was no input, no read, and no write path anywhere
 * in the native app. Same shape as the workout board before it had an exercise
 * picker: the app telling somebody to do a thing it had not built.
 *
 * ── A FIELD, NOT A STEPPER ──────────────────────────────────────────────────
 * The workout board dials weight with ±2.5 keys because a working set moves in
 * plate increments from a known previous. Body weight does not: the first
 * reading is 82.4 from nothing, and reaching it by tap is absurd. It is a
 * numeric field, seeded with the last reading so the common case — a tenth
 * either way — is an edit rather than an entry.
 *
 * ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
 * The chart. `body.empty` promises "the second chart" and this draws numbers
 * instead, because a sparkline is shared work with Progress and belongs in
 * `components/ui/` where both can read it — not hand-rolled twice. Protein and
 * measurements are in `src/lib/body.ts` and in migration 0027 and have no
 * surface here yet either. All three are named in WAZN_PLAN 7.0 rather than
 * implied by an empty space.
 */
export default function BodyScreen() {
  const { t } = useLocale()
  const { unit, ready } = useUnit()
  const { width } = useWindowDimensions()
  const { loading, error, series, latestKg, averageKg, steady, logWeight } = useBody()

  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (!ready || loading) return <Screen />

  if (error !== null) {
    return (
      <Screen>
        <Header />
        <Kick style={{ marginBottom: 14 }}>{t('nav.body')}</Kick>
        <Empty line={error} />
      </Screen>
    )
  }

  // Seeded from the last reading, so the usual edit is one character. `draft`
  // stays null until the lifter touches it, which is how the field follows a
  // fresh weigh-in landing from elsewhere without fighting them mid-type.
  const shown =
    draft ?? (latestKg === null ? '' : String(toDisplayWeight(latestKg, unit)))

  async function save() {
    const entered = Number(shown)
    const kg = fromDisplayWeight(entered, unit)
    // The table's own bounds (0027: `> 0 and < 500`), checked here so the
    // failure is a sentence rather than a constraint violation.
    if (!Number.isFinite(entered) || kg <= 20 || kg >= 500) {
      setSaveError(t('body.invalid'))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await logWeight(kg)
      setDraft(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('body.invalid'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <Screen>
        <Header />
        <Kick style={{ marginBottom: 14 }}>{t('nav.body')}</Kick>

        {/* The reading, as the screen's one figure. Ink rather than white:
            it is the answer, and everything under it is how it was reached. */}
        <Card tone="ink" style={{ padding: 18, marginBottom: 12 }}>
          <Kick ink="onInkMuted">
            {latestKg === null ? t('body.first') : t('body.today')}
          </Kick>
          {/* No figure at all before the first reading. A `—` at Sora 800 54
              is a solid bar the width of two digits: it reads as a redaction,
              not as an absence. The card is the prompt until there is a
              number to be the answer. */}
          {latestKg === null ? (
            <Txt step="label" ink="onInkBody" style={{ marginTop: 8 }}>
              {t('body.empty')}
            </Txt>
          ) : (
            <Txt step="mega" ink="onInk" ltr style={{ marginTop: 8 }}>
              {String(toDisplayWeight(latestKg, unit))}
              <Txt step="num" ink="onInkMuted" ltr>
                {` ${unit}`}
              </Txt>
            </Txt>
          )}
          {averageKg !== null && (
            <Txt step="label" ink="onInkMuted" ltr style={{ marginTop: 6 }}>
              {t('body.average', {
                n: String(toDisplayWeight(averageKg, unit)),
                unit,
              })}
            </Txt>
          )}
          {steady && (
            <Txt step="label" ink="onInkBody" style={{ marginTop: 2 }}>
              {t('body.steady')}
            </Txt>
          )}
        </Card>

        {/* The chart `body.empty` has been promising. Width is the screen
            minus both gutters and both card paddings — measured rather than
            guessed, because an SVG wider than its card clips silently. */}
        {series.length > 0 && (
          <Card style={{ marginBottom: 12, gap: 10 }}>
            <Kick>{t('body.weight')}</Kick>
            <Spark
              values={series.map((point) => toDisplayWeight(point.kg, unit))}
              width={width - space.gutter * 2 - space.cardPad * 2}
              label={(value) => String(value)}
              range={(low, high) => t('body.range', { low, high, unit })}
              emptyLine={t('body.one_reading')}
            />
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <Kick>{t('body.log_weigh_in')}</Kick>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              value={shown}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              accessibilityLabel={t('body.log_weigh_in')}
              placeholder={unit === 'kg' ? '82.4' : '181.5'}
              placeholderTextColor={palette.muted}
              style={{
                flex: 1,
                height: space.touch,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: palette.paper,
                borderWidth: 1,
                borderColor: palette.ring,
                color: palette.ink,
                fontFamily: TYPE.body.fontFamily,
                fontSize: 16,
              }}
            />
            <Txt step="label" ink="muted">
              {unit}
            </Txt>
            <Btn
              kind="ink"
              label={t('body.save')}
              disabled={saving || shown.trim() === ''}
              onPress={() => void save()}
            />
          </View>
          {saveError !== null && (
            <Txt step="label" ink="accentSoft" accessibilityRole="alert">
              {saveError}
            </Txt>
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  )
}
