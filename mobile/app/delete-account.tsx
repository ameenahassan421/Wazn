/**
 * Delete the account. The one screen in the app whose job is to be slow.
 *
 * ── WHY A SCREEN, WHEN THE REPO'S DESTRUCTIVE PATTERN IS `Alert` ────────────
 * `routine/[id].tsx:262` deletes a routine through the platform `Alert`, and
 * its comment argues the case well: a destructive confirm is where a lifter's
 * muscle memory should be the OS's, and `Alert` is RTL-correct and
 * screen-reader-correct for free. That reasoning is right about a ROUTINE,
 * which is one row the user can rebuild in a minute.
 *
 * It does not carry to an account. This takes every workout, every PR, the
 * body log and the crew, permanently, and `Alert.prompt` — the only variant
 * that can take typed input — is iOS-only, so a typed gate inside an Alert
 * would simply not exist on Android. A screen is what makes the typed
 * confirmation possible on both platforms, and the friction is the feature
 * here rather than a cost.
 *
 * What is NOT free by leaving `Alert` behind, and is therefore handled by
 * hand below: RTL correctness and the screen-reader labels.
 *
 * ── NO SECOND COLOUR ────────────────────────────────────────────────────────
 * There is no danger token in this system and this screen does not invent one.
 * `CLAUDE.md`: one accent, ember, and nothing else is coloured. The weight
 * comes from the copy, the typed gate and the `ink` button — not from red.
 * `hero` (the ember CTA with the glow) is deliberately NOT used: that glow is
 * the app's yes, and spending it on an irreversible delete would teach the
 * wrong reflex on every other screen.
 */

import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'

import { Btn } from '@/components/ui/Btn'
import { Field } from '@/components/ui/Field'
import { Screen } from '@/components/ui/Screen'
import { Txt } from '@/design/Txt'
import { useLocale } from '@/hooks/use-locale'
import { deleteAccount } from '@/services/auth'

export default function DeleteAccountScreen() {
  const { t } = useLocale()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * Compared case-insensitively against the LOCALISED word, after trimming.
   *
   * An Arabic build asks for حذف, not DELETE — a gate the user cannot read is
   * not a stricter gate, it is a locked door. `services/auth.ts` sends the
   * fixed `DELETE` sentinel to the server, so the API contract does not move
   * with the device language.
   */
  const word = t('settings.delete.word')
  const armed = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase()

  function onDelete(): void {
    if (!armed || busy) return
    setBusy(true)
    setError(null)
    deleteAccount()
      // On success nothing navigates here. The root guard in `_layout.tsx`
      // swaps the stack the moment the session clears, exactly as it does on
      // sign-out, and `busy` stays true so the button cannot be pressed twice
      // in the frames before that happens.
      .catch(() => {
        setBusy(false)
        setError(t('settings.delete.error'))
      })
  }

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

      {/* No `flex: 1` on this heading. The obvious build flexes the title and
          it is wrong in Arabic: the flexed Text swallows the row's free space
          without putting its content on the start edge, so the title floats
          mid-row. `routine/[id].tsx` documents the same trap at its header. */}
      <Txt step="title" style={{ marginTop: 8 }}>
        {t('settings.delete.heading')}
      </Txt>

      <Txt step="body" ink="muted" style={{ marginTop: 12 }}>
        {t('settings.delete.body')}
      </Txt>

      <View style={{ marginTop: 28 }}>
        <Field
          label={t('settings.delete.prompt')}
          value={typed}
          onChangeText={(next) => {
            setTyped(next)
            if (error !== null) setError(null)
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={onDelete}
        />
      </View>

      {error === null ? null : (
        <Txt step="body" ink="muted" style={{ marginTop: 12 }}>
          {error}
        </Txt>
      )}

      {/* Keep first, delete second. The safe action is the one a thumb finds
          on the way down, and it is the one that is always enabled. */}
      <Btn
        kind="line"
        full
        label={t('settings.delete.cancel')}
        style={{ marginTop: 28 }}
        onPress={() => router.back()}
      />
      <Btn
        kind="ink"
        full
        disabled={!armed || busy}
        label={busy ? t('settings.delete.working') : t('settings.delete.action')}
        style={{ marginTop: 12 }}
        onPress={onDelete}
      />
    </Screen>
  )
}
