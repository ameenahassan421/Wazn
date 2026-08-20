import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import type { TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { maskEmail, palette, space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Wordmark } from '@/components/ui/Wordmark'
import { Btn } from '@/components/ui/Btn'
import { CodeInput, Field } from '@/components/ui/Field'
import { Card } from '@/components/ui/Surface'
import { useLocale } from '@/hooks/use-locale'
import {
  requestCode,
  signInWithPassword,
  signUpWithPassword,
  verifyCode,
} from '@/services/auth'

/**
 * Screens 01 and 02 — the way in, and the code.
 *
 * ── FOUR WAYS IN, AND TWO OF THEM ARE HERE ──────────────────────────────────
 * Email-or-username + password, and the 6-digit code. Google and Apple are
 * the other two and are deliberately absent from this build rather than
 * stubbed: Google needs an OAuth client that does not exist yet, and Apple
 * needs the developer account. A dead "Continue with Google" button is worse
 * than no button — it teaches a first-time user that the app is broken on the
 * very first screen.
 *
 * When the client id lands, Google becomes the hero at the top of this screen
 * and Apple joins it in the iOS build the same day (App Store rule). The
 * layout leaves room for both above the divider.
 *
 * ── NEVER A MAGIC LINK, AND THE FOOTER SAYS SO ──────────────────────────────
 * Not decoration. People have been trained by other apps to go looking in
 * their inbox for a link, and telling them plainly that a code is coming
 * saves a support round trip.
 */

type Stage =
  /** Identifier + password, or a request for a code. */
  | { name: 'credentials' }
  /** Six digits, after a code was sent. */
  | { name: 'code'; sentTo: string }

const RESEND_SECONDS = 42

export default function SignIn() {
  const insets = useSafeAreaInsets()
  const { t } = useLocale()
  const passwordRef = useRef<TextInput>(null)

  const [stage, setStage] = useState<Stage>({ name: 'credentials' })
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  /**
   * The resend countdown. A plain interval rather than a deadline because it
   * is cosmetic — unlike the rest timer, nothing is lost if the app is
   * backgrounded and it drifts.
   */
  useEffect(() => {
    if (resendIn <= 0) return
    const id = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(id)
  }, [resendIn])

  /** Every action funnels through here so no path can forget to clear the
   *  error or leave the button spinning. */
  async function run(action: () => Promise<void>, after?: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      after?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.error.fallback'))
    } finally {
      setBusy(false)
    }
  }

  const onSendCode = () =>
    run(
      () => requestCode(identifier),
      () => {
        setResendIn(RESEND_SECONDS)
        setStage({ name: 'code', sentTo: identifier })
      },
    )

  return (
    <KeyboardAvoidingView
      // The whole reason this screen is native. On iOS the keyboard covers
      // the password field and the sign-in button on a small phone; `padding`
      // lifts the content instead of leaving the user to guess.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: palette.ink }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          // Auth screens use the 22px gutter, not the app's 18.
          paddingHorizontal: space.authGutter,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          gap: 18,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 34 per README screen 01. This was `step="hero"`, which carries
            uppercase at 50, so the first screen of the app read WAZN. */}
        <Wordmark size={34} />

        {stage.name === 'credentials' ? (
          <>
            {/* Sentence case, deliberately: the ramp's `title` step is
                uppercase and this line is a sentence, not a label. */}
            <Txt step="title" style={{ textTransform: 'none' }}>
              Your training, on record.
            </Txt>

            <Field
              label={t('auth.email_or_username')}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder={t('auth.placeholder.email')}
            />

            <Field
              ref={passwordRef}
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() =>
                void run(() => signInWithPassword(identifier, password))
              }
            />

            {error !== null && (
              <Txt step="label" ink="accentSoft" accessibilityRole="alert">
                {error}
              </Txt>
            )}

            <Btn
              kind="ink"
              full
              label={t(busy ? 'auth.signin.busy' : 'auth.signin')}
              disabled={busy || identifier === '' || password === ''}
              onPress={() => void run(() => signInWithPassword(identifier, password))}
            />

            <View style={{ gap: 2 }}>
              <Btn
                kind="ghost"
                small
                label="Email me a code instead"
                disabled={busy || identifier === ''}
                onPress={() => void onSendCode()}
              />
              <Btn
                kind="ghost"
                small
                label={t('auth.signup.link')}
                disabled={busy || identifier === '' || password === ''}
                onPress={() =>
                  void run(
                    () => signUpWithPassword(identifier, password),
                    () => {
                      setResendIn(RESEND_SECONDS)
                      setStage({ name: 'code', sentTo: identifier })
                    },
                  )
                }
              />
            </View>

            <Card style={{ gap: 6 }}>
              <Kick>COMING FROM HEVY?</Kick>
              <Txt step="body" ink="muted">
                Sign in first. You can bring your whole history across in one step
                afterwards.
              </Txt>
            </Card>
          </>
        ) : (
          <>
            <Txt step="title" style={{ textTransform: 'none' }}>
              Enter the six digits we sent you.
            </Txt>
            {/* Masked, and only ever after the server accepted the request:
                enough to recognise your own address, not enough to learn
                someone else's. A username shows nothing at all — resolving it
                here is exactly what the Edge Function exists to prevent. */}
            <Txt step="label" ink="muted">
              {stage.sentTo.includes('@')
                ? t('auth.code.notice.sent', { address: maskEmail(stage.sentTo) })
                : t('auth.code.notice.username', { username: stage.sentTo })}
            </Txt>

            <CodeInput value={code} onChange={setCode} autoFocus />

            {error !== null && (
              <Txt step="label" ink="accentSoft" accessibilityRole="alert">
                {error}
              </Txt>
            )}

            <Btn
              kind="ink"
              full
              label={t(busy ? 'auth.code.verify.busy' : 'auth.code.verify')}
              disabled={busy || code.length < 6}
              onPress={() => void run(() => verifyCode(stage.sentTo, code))}
            />

            <Btn
              kind="ghost"
              small
              label={
                resendIn > 0
                  ? `RESEND CODE · 0:${String(resendIn).padStart(2, '0')}`
                  : 'RESEND CODE'
              }
              disabled={busy || resendIn > 0}
              onPress={() => void onSendCode()}
            />
            <Btn
              kind="ghost"
              small
              label="← Use a password instead"
              onPress={() => {
                setCode('')
                setError(null)
                setStage({ name: 'credentials' })
              }}
            />

            {/* The no-oracle note. The screen cannot tell you whether that
                account exists, and saying so out loud is kinder than letting
                someone retype a typo six times. */}
            <Txt step="nano" ink="faint">
              A CODE IS SENT ONLY IF THAT ACCOUNT EXISTS. THIS SCREEN CANNOT TELL YOU
              WHETHER IT DOES.
            </Txt>
          </>
        )}

        <Txt step="nano" ink="faint">
          6-DIGIT CODES, NEVER MAGIC LINKS · SIGN IN WITH GOOGLE AND APPLE ARRIVE WITH
          THE STORE BUILD
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
