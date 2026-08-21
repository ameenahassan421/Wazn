import { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native'
import type { TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { maskEmail, palette, space } from '@wazn/domain'

import { Txt, Kick, type InkRole } from '@/design/Txt'
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
 * ── WHICH REFERENCE THIS IS BUILT AGAINST ───────────────────────────────────
 * `docs/design/v5-momentum/design/Onboarding.html`, `AuthScreen` at :21 and
 * `CodeScreen` at :62. NOT `Wazn v5.html` — that file is the six-tab app and
 * contains no auth screen at all. On 2026-08-20 this screen was reported as
 * matching v5 after being compared against the file that does not contain it,
 * and five real mismatches survived the check. Open the named file.
 *
 * ── FOUR WAYS IN, AND ONE OF THEM CANNOT WORK YET ───────────────────────────
 * Email-or-username + password, and the 6-digit code, both work. Google is
 * DRAWN as v5's hero because the screen has a hole in it otherwise, and says
 * plainly on press that it arrives with the store build. Apple joins it in the
 * iOS build the same day Google works there (App Store rule).
 *
 * A button that fails silently would be the defect; a button that explains
 * itself is not. When the OAuth client lands, only `onGoogle` changes.
 *
 * ── NEVER A MAGIC LINK, AND THE FOOTER SAYS SO ──────────────────────────────
 * Not decoration. People have been trained by other apps to go looking in
 * their inbox for a link, and telling them plainly that a code is coming
 * saves a support round trip.
 */

type Stage =
  /** Identifier + password. `mode` is v5's one toggle: the button label, the
   *  password placeholder and the first link all read off it. */
  | { name: 'credentials'; mode: 'signin' | 'signup' }
  /** Six digits, after a code was sent. */
  | { name: 'code'; sentTo: string }

const RESEND_SECONDS = 42

/**
 * The auth headline, off the ramp.
 *
 * v5 sets it as `T.title` at 22 on screen 01 and 20 on screen 02, sentence
 * case rather than the step's uppercase (`Onboarding.html:24`, `:75`). The
 * ramp's `title` is 17, which is the size a LABEL wants and reads as a caption
 * under a 34px wordmark. `lineHeight` and `letterSpacing` are recomputed
 * because both are absolute pixels in RN: overriding `fontSize` alone leaves a
 * 22px line in a 20px box.
 */
function Lede({ size, children }: { size: number; children: string }) {
  return (
    <Txt
      step="title"
      style={{
        fontSize: size,
        lineHeight: Math.round(size * 1.2),
        letterSpacing: size * 0.01,
        textTransform: 'none',
      }}
    >
      {children}
    </Txt>
  )
}

/**
 * One of the ways onward under the primary button.
 *
 * v5 puts all three in a single centred wrapping row in sentence case
 * (`Onboarding.html:41-46`), not as stacked buttons: they are alternatives to
 * the action above, and three more full-width controls would each read as
 * loud as the one that matters. `Btn kind="ghost"` cannot do this — it sets
 * the `title` step, which is uppercase.
 */
function LinkBtn({
  label,
  ink = 'accentSoft',
  step = 'label',
  disabled,
  onPress,
}: {
  label: string
  ink?: InkRole
  step?: 'label' | 'meta'
  disabled?: boolean
  onPress: () => void
}) {
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      hitSlop={10}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      // Static, never `({ pressed }) => ...` — see `Btn.tsx`.
      style={{
        paddingVertical: 6,
        paddingHorizontal: 4,
        opacity: pressed ? 0.6 : 1,
      }}
    >
      <Txt step={step} ink={disabled === true ? 'faint' : ink}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** The `·` between them, in `faint` so it separates without competing. */
function Dot({ step = 'label' }: { step?: 'label' | 'meta' }) {
  return (
    <Txt step={step} ink="faint">
      ·
    </Txt>
  )
}

/** v5's Google mark: an ink disc with an ember G, sized to sit in a 56px
 *  hero without touching its cap height (`Onboarding.html:27`). */
function GoogleDisc() {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: palette.accentInk,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt step="fig" ink="accent" style={{ fontSize: 15, lineHeight: 17 }} ltr>
        G
      </Txt>
    </View>
  )
}

export default function SignIn() {
  const insets = useSafeAreaInsets()
  const { t } = useLocale()
  const passwordRef = useRef<TextInput>(null)

  const [stage, setStage] = useState<Stage>({ name: 'credentials', mode: 'signin' })
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

  function toCodeStage() {
    setResendIn(RESEND_SECONDS)
    setStage({ name: 'code', sentTo: identifier })
  }

  const onSendCode = () => run(() => requestCode(identifier), toCodeStage)

  /**
   * The primary button never greys out.
   *
   * v5 draws SIGN IN at full strength on first paint, and it is the better
   * behaviour as well as the drawn one: a disabled control does not say WHY it
   * is disabled, so the empty-field cases are checked here and answered in
   * words. `busy` is still a real block — a second tap mid-request is a second
   * request.
   */
  function onSubmit(mode: 'signin' | 'signup') {
    if (busy) return
    if (identifier.trim() === '') {
      setError(t('auth.signin.error.empty_ident'))
      return
    }
    if (password === '') {
      setError(t('auth.signin.error.empty_pass'))
      return
    }
    if (mode === 'signup') {
      void run(() => signUpWithPassword(identifier, password), toCodeStage)
      return
    }
    void run(() => signInWithPassword(identifier, password))
  }

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
        {stage.name === 'credentials' ? (
          <>
            {/* One block, not three siblings: v5 binds the wordmark, the
                headline and the promise together at 12 and 6, then puts the
                screen's 18 between that block and everything below it. */}
            <View style={{ marginBottom: 6 }}>
              {/* 34 per screen 01. This was `step="hero"`, which carries
                  uppercase at 50, so the first screen of the app read WAZN. */}
              <Wordmark size={34} />
              <View style={{ marginTop: 12 }}>
                <Lede size={22}>{t('auth.tagline')}</Lede>
              </View>
              <Txt step="label" ink="muted" style={{ marginTop: 6 }}>
                {t('auth.tagline.sub')}
              </Txt>
            </View>

            <Btn
              kind="hero"
              full
              style={{ height: 56 }}
              leading={<GoogleDisc />}
              label={t('auth.google')}
              onPress={() => setError(t('auth.google.pending'))}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
              <Kick>{t('auth.or')}</Kick>
              <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
            </View>

            <View style={{ gap: 10 }}>
              <Field
                hideLabel
                label={t('auth.email_or_username')}
                placeholder={t('auth.placeholder.identifier')}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />

              <Field
                hideLabel
                ref={passwordRef}
                label={t('auth.password')}
                placeholder={t(
                  stage.mode === 'signup'
                    ? 'auth.placeholder.password.signup'
                    : 'auth.placeholder.password.signin',
                )}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                textContentType="password"
                autoComplete={
                  stage.mode === 'signup' ? 'new-password' : 'current-password'
                }
                returnKeyType="go"
                onSubmitEditing={() => onSubmit(stage.mode)}
              />

              {error !== null && (
                <Txt step="label" ink="accentSoft" accessibilityRole="alert">
                  {error}
                </Txt>
              )}

              <Btn
                kind="ink"
                full
                label={t(
                  busy
                    ? stage.mode === 'signup'
                      ? 'auth.signup.busy'
                      : 'auth.signin.busy'
                    : stage.mode === 'signup'
                      ? 'auth.signup'
                      : 'auth.signin',
                )}
                onPress={() => onSubmit(stage.mode)}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <LinkBtn
                label={t(
                  stage.mode === 'signup'
                    ? 'auth.signup.has_account'
                    : 'auth.signup.link',
                )}
                onPress={() => {
                  setError(null)
                  setStage({
                    name: 'credentials',
                    mode: stage.mode === 'signup' ? 'signin' : 'signup',
                  })
                }}
              />
              <Dot />
              <LinkBtn
                label={t('auth.code.path.short')}
                disabled={busy}
                onPress={() => void onSendCode()}
              />
              <Dot />
              {/* `muted`, a tier below the other two. Recovery is a path you
                  take when something has gone wrong, not an invitation. */}
              <LinkBtn
                label={t('auth.forgot')}
                ink="muted"
                onPress={() => setError(t('auth.code.path'))}
              />
            </View>

            {/* v5 draws this with a `→` into an import screen. There is no
                import screen on any platform yet — the Hevy path is
                `scripts/import_hevy.ts`, run by hand — so the card carries the
                copy and not the arrow. An arrow that goes nowhere is the same
                defect as a button that does nothing. */}
            <Card style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 3 }}>
              <Txt step="label">{t('auth.hevy.cta')}</Txt>
              {/* v5 sets this at `T.meta` 10 — mono, caps, and NO tracking.
                  `Kick` is the same face at the same size with 0.14em on it,
                  which pushes this line onto a second row. */}
              <Txt step="meta" ink="faint" style={{ fontSize: 10, lineHeight: 12 }}>
                {t('auth.hevy.cta.sub').toUpperCase()}
              </Txt>
            </Card>

            <Txt step="nano" ink="faint" style={{ textAlign: 'center' }}>
              {`${t('auth.privacy.link')} · ${t('auth.footer.note')}`}
            </Txt>
          </>
        ) : (
          <>
            <View>
              <Wordmark size={26} />
              <View style={{ marginTop: 14 }}>
                <Lede size={20}>{t('auth.code.head')}</Lede>
              </View>
              {/* Masked, and only ever after the server accepted the request:
                  enough to recognise your own address, not enough to learn
                  someone else's. A username shows nothing at all — resolving
                  it here is exactly what the Edge Function exists to
                  prevent. */}
              <Txt step="label" ink="muted" style={{ marginTop: 6 }} ltr>
                {stage.sentTo.includes('@')
                  ? t('auth.code.otw', { address: maskEmail(stage.sentTo) })
                  : t('auth.code.notice.username', { username: stage.sentTo })}
              </Txt>
            </View>

            <CodeInput value={code} onChange={setCode} autoFocus />

            {error !== null && (
              <Txt step="label" ink="accentSoft" accessibilityRole="alert">
                {error}
              </Txt>
            )}

            {/* Ember once all six are in, cream-on-ink before. The kind
                CHANGES, which is v5's way of saying the action became
                available rather than just enabled. */}
            <Btn
              kind={code.length === 6 ? 'hero' : 'ink'}
              full
              style={{ height: 54 }}
              label={t(busy ? 'auth.code.verify.busy' : 'auth.code.verify.short')}
              disabled={busy || code.length < 6}
              onPress={() => void run(() => verifyCode(stage.sentTo, code))}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <LinkBtn
                step="meta"
                label={
                  resendIn > 0
                    ? `${t('auth.code.resend')} · 0:${String(resendIn).padStart(2, '0')}`
                    : t('auth.code.resend')
                }
                disabled={busy || resendIn > 0}
                onPress={() => void onSendCode()}
              />
              <Dot step="meta" />
              <LinkBtn
                step="meta"
                label={t('auth.back')}
                onPress={() => {
                  setCode('')
                  setError(null)
                  setStage({ name: 'credentials', mode: 'signin' })
                }}
              />
            </View>

            {/* The no-oracle note. The screen cannot tell you whether that
                account exists, and saying so out loud is kinder than letting
                someone retype a typo six times. */}
            <Txt step="nano" ink="faint" style={{ textAlign: 'center' }}>
              {t('auth.code.no_oracle')}
            </Txt>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
