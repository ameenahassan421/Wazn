import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { peekInviteCode } from '../lib/invite'
import { nameOf, resolveInvite, type Inviter } from '../lib/social'
import { classifyIdentifier, normalizeEmail } from '../lib/auth-identity'
import {
  passwordSignInForUsername,
  requestCodeForUsername,
  verifyCodeForUsername,
} from '../lib/auth-alias'
import { useLocale } from '../lib/locale-context'
import { Wordmark } from './Wordmark'

/**
 * Four ways in, one screen (Ameen's auth decisions, 2026-08-07 — see
 * DECISIONS.md and docs/auth-social-setup.md):
 *
 *   Google -> email-or-username + password -> "email me a code" -> (Apple at 4B)
 *
 * The identifier fields accept a username anywhere they accept an email; a
 * username is resolved server-side by the auth-alias function so no email is
 * ever revealed by typing someone's handle. Recovery is code-based — the
 * never-a-magic-link rule extends to reset links, which break in the same
 * wrong-browser ways sign-in links did.
 */

type View =
  | 'signin' // Google + identifier/password — the front door
  | 'signup' // email + new password
  | 'confirm' // 6-digit signup confirmation
  | 'code-request' // identifier for the passwordless path
  | 'code-verify' // 6-digit sign-in code
  | 'reset-request' // email for password recovery
  | 'reset-verify' // recovery code + new password

const MIN_PASSWORD = 8

const inputClass =
  'h-14 w-full rounded-lg border border-line bg-surface px-4 text-start text-lg outline-none placeholder:text-muted focus:border-accent'

const codeClass =
  'tnum h-16 w-full rounded-lg border border-line bg-surface px-4 text-start text-3xl tracking-[0.35em] outline-none placeholder:text-muted focus:border-accent'

/** Google's four-colour G — required branding, and the one exception to the
    single-accent rule (a trademark is not a palette choice). */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function AuthScreen() {
  const [view, setView] = useState<View>('signin')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('') // signup + reset always need a real address
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [inviter, setInviter] = useState<Inviter | null>(null)
  const { locale, setLocale, t } = useLocale()

  // Naming the person who invited you is most of why an invite link works, and
  // it has to happen here — before there is an account, let alone a session.
  // `resolve_invite` is granted to `anon` for exactly this sentence; see
  // migration 0011. The code is only peeked at, not consumed: it is spent
  // after sign-in, when there is a session to follow with.
  useEffect(() => {
    const code = peekInviteCode()
    if (!code) return
    let active = true
    void resolveInvite(code).then((found) => {
      if (active) setInviter(found)
    })
    return () => {
      active = false
    }
  }, [])

  const toggleLocale = () => setLocale(locale === 'en' ? 'ar' : 'en')

  function go(next: View) {
    setView(next)
    setError(null)
    setNotice(null)
    setCode('')
    if (next === 'signin' || next === 'signup') setPassword('')
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.error.fallback'))
    } finally {
      setBusy(false)
    }
  }

  function signInWithGoogle() {
    void run(async () => {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      // On success the browser navigates away; only a failure lands here.
      if (oauthError) {
        throw new Error(t('auth.google.error', { message: oauthError.message }))
      }
    })
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault()
    const ident = classifyIdentifier(identifier)
    if (ident.kind === 'invalid') {
      setError(t('auth.signin.error.empty_ident'))
      return
    }
    if (password.length === 0) {
      setError(t('auth.signin.error.empty_pass'))
      return
    }
    void run(async () => {
      if (ident.kind === 'email') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: ident.value,
          password,
        })
        if (signInError) {
          throw new Error(
            /invalid login credentials/i.test(signInError.message)
              ? t('auth.signin.error.invalid')
              : signInError.message,
          )
        }
      } else {
        await passwordSignInForUsername(ident.value, password)
      }
    })
  }

  function submitSignUp(event: FormEvent) {
    event.preventDefault()
    const address = normalizeEmail(email)
    if (!address.includes('@')) {
      setError(t('auth.signup.error.email'))
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(t('auth.signup.error.password.length', { min: String(MIN_PASSWORD) }))
      return
    }
    void run(async () => {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: address,
        password,
      })
      if (signUpError) throw new Error(signUpError.message)
      // Session means email confirmation is off; otherwise a code is on its way.
      if (!data.session) {
        setNotice(t('auth.signup.notice.code_sent', { address }))
        setView('confirm')
      }
    })
  }

  function submitConfirm(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setError(t('auth.confirm.error.length'))
      return
    }
    void run(async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizeEmail(email),
        token: code,
        type: 'signup',
      })
      if (verifyError) {
        throw new Error(
          /expired/i.test(verifyError.message)
            ? t('auth.confirm.error.expired')
            : t('auth.confirm.error.invalid'),
        )
      }
    })
  }

  function submitCodeRequest(event: FormEvent) {
    event.preventDefault()
    const ident = classifyIdentifier(identifier)
    if (ident.kind === 'invalid') {
      setError(t('auth.signin.error.empty_ident'))
      return
    }
    void run(async () => {
      if (ident.kind === 'email') {
        const { error: sendError } = await supabase.auth.signInWithOtp({
          email: ident.value,
          options: { shouldCreateUser: true },
        })
        if (sendError) {
          throw new Error(
            /rate|seconds|limit/i.test(sendError.message)
              ? t('auth.code.error.rate')
              : t('auth.code.send.error', { message: sendError.message }),
          )
        }
        setNotice(t('auth.code.notice.sent', { address: ident.value }))
      } else {
        // Identical response whether the username exists or not — the
        // function swallows everything. The sentence has to hedge for the
        // same reason.
        await requestCodeForUsername(ident.value)
        setNotice(t('auth.code.notice.username', { username: ident.value }))
      }
      setView('code-verify')
    })
  }

  function submitCodeVerify(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setError(t('auth.confirm.error.length'))
      return
    }
    const ident = classifyIdentifier(identifier)
    void run(async () => {
      if (ident.kind === 'email') {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: ident.value,
          token: code,
          type: 'email',
        })
        if (verifyError) {
          throw new Error(
            /expired/i.test(verifyError.message)
              ? t('auth.code.verify.error.expired')
              : t('auth.code.verify.error.invalid'),
          )
        }
      } else if (ident.kind === 'username') {
        await verifyCodeForUsername(ident.value, code)
      } else {
        throw new Error(t('auth.code.verify.error.start_over'))
      }
    })
  }

  function submitResetRequest(event: FormEvent) {
    event.preventDefault()
    const address = normalizeEmail(email)
    if (!address.includes('@')) {
      setError(t('auth.reset.error.email'))
      return
    }
    void run(async () => {
      // Errors are not surfaced distinctly: "this address has no account" is
      // exactly what a reset flow must not reveal.
      await supabase.auth.resetPasswordForEmail(address).catch(() => undefined)
      setNotice(t('auth.reset.notice.sent', { address }))
      setView('reset-verify')
    })
  }

  function submitResetVerify(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setError(t('auth.reset.error.length'))
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(t('auth.reset.error.password.length', { min: String(MIN_PASSWORD) }))
      return
    }
    void run(async () => {
      const address = normalizeEmail(email)
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: address,
        token: code,
        type: 'recovery',
      })
      if (verifyError) {
        throw new Error(
          /expired/i.test(verifyError.message)
            ? t('auth.reset.error.expired')
            : t('auth.reset.error.invalid'),
        )
      }
      // The recovery verify signs the user in; the app swaps screens on the
      // session. The password write races that swap on purpose — it needs no
      // UI, and the length was already checked above.
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error(updateError.message)
    })
  }

  const linkClass = 'h-12 text-sm text-muted underline underline-offset-4'

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-10">
      {/* The wordmark, not plain text: the sign-in screen is the first thing
          anyone sees, and it should look like the app behind it. */}
      <h1>
        <Wordmark height={26} className="text-text" />
      </h1>
      {inviter && <p className="kicker mt-4">{nameOf(inviter)} invited you</p>}

      {/* ── The v3 AuthHero (designs/AuthHero.html) ────────────────────────
          The front page is the selling surface, so it says what the app does
          rather than what it is. Three parts, in the mock's order: the kicker,
          the promise, and the demo that proves it.

          The mock is a two-column 1080px layout — copy and live demo on the
          left, the auth card on the right. This app's auth surface is a 430px
          phone column and always has been, so the two columns become two
          stacked blocks. That is a layout consequence of the frame, not a
          redesign: every string, figure and row of the demo is the mock's.

          It is drawn on the flip ground rather than by forcing the dark theme.
          The mock is dark-first because dark was the world when it was drawn;
          this app shipped paper as the default on 2026-08-12, and overriding
          a reader's chosen theme on the first screen they see would be the
          app disagreeing with itself before they are even signed in. */}
      <p className="kicker mt-6 text-accent-300">{t('auth.hero.kicker')}</p>
      <h2 className="font-display mt-3 text-[30px] leading-[1.1] font-semibold tracking-[-0.015em] text-balance">
        {t('auth.hero.headline')}
      </h2>
      <p className="mt-3 text-[15px] leading-[1.6] text-muted">{t('auth.hero.body')}</p>

      <AuthDemo />

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {['seeded', 'rest', 'forecasts'].map((key) => (
          <li
            key={key}
            className="meta-mono flex items-center gap-2 text-[11px] tracking-[0.1em] text-muted uppercase"
          >
            <span
              aria-hidden="true"
              className="block h-[7px] w-[7px] bg-accent"
              style={{ borderRadius: 2 }}
            />
            {t(`auth.hero.${key}`)}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted">{t('auth.subhead')}</p>
      {/* On the one screen where somebody hands over an email, and nowhere
          else. A privacy link buried in a settings menu is a link written for
          an app store rather than for a reader. */}
      <p className="mt-2 text-[11px] text-muted">
        {t('auth.privacy.body')}{' '}
        <a href="/privacy" className="text-accent-300 underline underline-offset-2">
          {t('auth.privacy.link')}
        </a>
      </p>
      {/* A statement, not a control. The import needs a session to write
          anything, so a button here could only ever take you to the sign-in
          you are already looking at — and the thing worth saying before
          somebody signs up is that switching does not cost them their
          history. */}
      <p className="mt-1 text-[11px] text-muted">{t('auth.hevy.hint')}</p>

      {view === 'signin' && (
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="ring-edge press flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-surface text-[16px] font-medium disabled:opacity-45"
          >
            <GoogleMark />
            {t('auth.google')}
          </button>

          <div className="mt-2 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] uppercase tracking-widest text-muted">
              {t('auth.or')}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submitPassword} className="flex flex-col gap-3">
            <label htmlFor="identifier" className="kicker">
              {t('auth.email_or_username')}
            </label>
            <input
              id="identifier"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t('auth.placeholder.email')}
              className={inputClass}
            />
            <label htmlFor="password" className="kicker">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.placeholder.password')}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
            >
              {busy ? t('auth.signin.busy') : t('auth.signin')}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <button type="button" onClick={() => go('signup')} className={linkClass}>
              {t('auth.signup.link')}
            </button>
            <button
              type="button"
              onClick={() => go('reset-request')}
              className={linkClass}
            >
              {t('auth.forgot')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => go('code-request')}
            className={`${linkClass} text-start`}
          >
            {t('auth.code.path')}
          </button>
        </div>
      )}

      {view === 'signup' && (
        <form onSubmit={submitSignUp} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="kicker">
            {t('auth.signup.email')}
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.placeholder.email')}
            className={inputClass}
          />
          <label htmlFor="new-password" className="kicker">
            {t('auth.signup.password.label', { min: String(MIN_PASSWORD) })}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.placeholder.password')}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? t('auth.signup.busy') : t('auth.signup')}
          </button>
          <button type="button" onClick={() => go('signin')} className={linkClass}>
            {t('auth.signup.has_account')}
          </button>
        </form>
      )}

      {view === 'confirm' && (
        <form onSubmit={submitConfirm} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="kicker">
            {t('auth.confirm.code_label')}
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder={t('auth.placeholder.code')}
            className={codeClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? t('auth.confirm.busy') : t('auth.confirm')}
          </button>
          <button type="button" onClick={() => go('signup')} className={linkClass}>
            {t('auth.confirm.different_email')}
          </button>
        </form>
      )}

      {view === 'code-request' && (
        <form onSubmit={submitCodeRequest} className="mt-8 flex flex-col gap-3">
          <label htmlFor="identifier" className="kicker">
            {t('auth.email_or_username')}
          </label>
          <input
            id="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('auth.placeholder.email')}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? t('auth.code.send.busy') : t('auth.code.send')}
          </button>
          <button type="button" onClick={() => go('signin')} className={linkClass}>
            {t('auth.code.back')}
          </button>
        </form>
      )}

      {view === 'code-verify' && (
        <form onSubmit={submitCodeVerify} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="kicker">
            {t('auth.confirm.code_label')}
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder={t('auth.placeholder.code')}
            className={codeClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? t('auth.code.verify.busy') : t('auth.code.verify')}
          </button>
          <button
            type="button"
            onClick={() => go('code-request')}
            className={linkClass}
          >
            {t('auth.code.verify.different')}
          </button>
        </form>
      )}

      {view === 'reset-request' && (
        <form onSubmit={submitResetRequest} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="kicker">
            {t('auth.reset.email_label')}
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.placeholder.email')}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? t('auth.reset.send.busy') : t('auth.reset.send')}
          </button>
          <button type="button" onClick={() => go('signin')} className={linkClass}>
            {t('auth.code.back')}
          </button>
        </form>
      )}

      {view === 'reset-verify' && (
        <form onSubmit={submitResetVerify} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="kicker">
            {t('auth.reset.code_label')}
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder={t('auth.placeholder.code')}
            className={codeClass}
          />
          <label htmlFor="new-password" className="kicker">
            {t('auth.reset.password.label', { min: String(MIN_PASSWORD) })}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.placeholder.password')}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? t('auth.reset.apply.busy') : t('auth.reset.apply')}
          </button>
          <button
            type="button"
            onClick={() => go('reset-request')}
            className={linkClass}
          >
            {t('auth.reset.different_email')}
          </button>
        </form>
      )}

      {notice && !error && <p className="mt-4 text-sm text-muted">{notice}</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-accent-300">
          {error}
        </p>
      )}

      {/* At the bottom: reachable without competing with the primary sign-in
          action, and matching the convention of language selectors that live
          outside the form flow. An Arabic speaker can switch before ever
          signing in, because LocaleProvider is mounted above the auth gate
          (App.tsx wraps AuthScreen in LocaleProvider). */}
      <div className="ms-auto mt-8">
        <button
          type="button"
          onClick={toggleLocale}
          aria-label={t('toggle.locale.name')}
          className="flex h-12 items-center px-1"
        >
          <span className="btn-base btn-secondary tnum h-[34px] min-w-[52px] px-3 text-sm">
            {t('toggle.locale.label')}
          </span>
        </button>
      </div>
    </main>
  )
}

/**
 * The live set-commit demo from `designs/AuthHero.html`.
 *
 * Four rows of a bench block: two committed, one that commits itself on a
 * loop, one ghost. It is the app's own board anatomy — index, figure, reason,
 * check — at the size the mock draws it, because the most honest thing the
 * front page can show is the thing the app actually is.
 *
 * ── WHY IT IS HAND-DRAWN AND NOT `WorkoutOverview` ──────────────────────────
 * The real board needs a workout, a plan, a previous session and a unit
 * context, and there is no session here to give it one. Rendering it against
 * a fake would mean a fixture on the sign-in screen that has to be kept in
 * step with a component nobody would remember to check. This is four static
 * rows; it cannot drift because it is not pretending to be live.
 *
 * The animation is CSS only, `both`-filled, and collapses under
 * `prefers-reduced-motion` with the rest of the app's motion (index.css) — so
 * a reader who has asked for stillness gets a committed row rather than a
 * flickering one.
 */
function AuthDemo() {
  const { t } = useLocale()
  const rows = [
    { n: '1', value: '100 × 8', reason: '▲ +2.5', accent: true, state: 'done' },
    { n: '2', value: '102.5 × 8', reason: '↺ 100 × 8', accent: false, state: 'done' },
    {
      n: '3',
      value: '102.5 × 8',
      reason: '↑ 102.5 — 8/8 last time',
      accent: true,
      state: 'live',
    },
    { n: '4', value: '102.5 × 8', reason: '', accent: false, state: 'ghost' },
  ] as const

  return (
    <section
      aria-label={t('auth.hero.demo')}
      className="mt-6 overflow-hidden"
      style={{
        background: 'var(--flip-bg)',
        color: 'var(--flip-text)',
        borderRadius: 'var(--radius-panel)',
      }}
    >
      <div className="flex flex-col gap-[3px] px-[18px] pt-4 pb-2.5">
        <p className="font-display text-[17px] font-semibold">
          {t('auth.hero.demo.exercise')}
        </p>
        <p
          className="meta-mono text-[11px]"
          style={{ color: 'color-mix(in srgb, var(--flip-text) 55%, transparent)' }}
        >
          2 / 4 · {t('overview.coach_adjusted')}
        </p>
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.n}
            className="grid items-center px-[18px]"
            style={{
              gridTemplateColumns: '30px 1fr auto 40px',
              columnGap: 12,
              height: 50,
              borderTop:
                row.state === 'ghost'
                  ? '1px dashed color-mix(in srgb, var(--flip-text) 14%, transparent)'
                  : '1px solid color-mix(in srgb, var(--flip-text) 9%, transparent)',
            }}
          >
            <span
              dir="ltr"
              className="tnum font-mono text-[11px]"
              style={{
                color:
                  row.state === 'ghost'
                    ? 'color-mix(in srgb, var(--flip-text) 32%, transparent)'
                    : 'color-mix(in srgb, var(--flip-text) 55%, transparent)',
              }}
            >
              {row.n}
            </span>
            <span
              dir="ltr"
              className={`font-display tnum truncate text-[20px] font-medium ${
                row.state === 'live' ? 'auth-demo-value' : ''
              }`}
              style={
                row.state === 'ghost'
                  ? { color: 'color-mix(in srgb, var(--flip-text) 32%, transparent)' }
                  : undefined
              }
            >
              {row.value}
            </span>
            <span
              dir="ltr"
              className="tnum truncate font-mono text-[11px]"
              style={{
                color: row.accent
                  ? 'var(--color-accent-700)'
                  : 'color-mix(in srgb, var(--flip-text) 55%, transparent)',
              }}
            >
              {row.reason}
            </span>
            {row.state === 'done' ? (
              <span
                aria-hidden="true"
                className="justify-self-end text-[14px] font-bold text-accent-ink"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'var(--color-accent)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                ✓
              </span>
            ) : (
              <span
                aria-hidden="true"
                className={`justify-self-end ${
                  row.state === 'live' ? 'auth-demo-check' : ''
                }`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border:
                    '1.5px solid color-mix(in srgb, var(--flip-text) 22%, transparent)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {row.state === 'live' && (
                  <span className="auth-demo-glyph text-[14px] font-bold text-accent-ink">
                    ✓
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div
        className="flex flex-wrap items-center gap-2.5 px-[18px] py-3"
        style={{
          borderTop: '1px solid color-mix(in srgb, var(--flip-text) 9%, transparent)',
        }}
      >
        <span className="text-[13px]">{t('auth.hero.forecast')}</span>
        <span
          dir="ltr"
          className="chip-data tnum"
          style={{
            backgroundColor: 'rgba(232, 73, 29, 0.14)',
            color: 'var(--color-accent-700)',
          }}
        >
          e1RM 112.5 ▲ 2.5 / 4 wk
        </span>
      </div>
    </section>
  )
}
