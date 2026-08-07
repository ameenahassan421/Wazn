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
import { Wordmark } from './Wordmark'

/**
 * Four ways in, one screen (Ameen's auth decisions, 2026-08-07 — see
 * DECISIONS.md and docs/auth-social-setup.md):
 *
 *   Google → email-or-username + password → "email me a code" → (Apple at 4B)
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
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
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
        throw new Error(`Google sign-in did not start — ${oauthError.message}`)
      }
    })
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault()
    const ident = classifyIdentifier(identifier)
    if (ident.kind === 'invalid') {
      setError('Enter your email or username.')
      return
    }
    if (password.length === 0) {
      setError('Enter your password, or use "Email me a code" below.')
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
              ? 'Invalid credentials. Check the email and password, or reset the password below.'
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
      setError('Enter a full email address, like you@example.com.')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(`The password needs at least ${MIN_PASSWORD} characters.`)
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
        setNotice(`Code sent to ${address}. It expires in 1 hour.`)
        setView('confirm')
      }
    })
  }

  function submitConfirm(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setError('The code is 6 digits. Check the email and re-enter it.')
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
            ? 'That code expired. Request a new one.'
            : 'That code is not valid. Re-enter the 6 digits from the newest email. If you already have an account with this address, sign in instead.',
        )
      }
    })
  }

  function submitCodeRequest(event: FormEvent) {
    event.preventDefault()
    const ident = classifyIdentifier(identifier)
    if (ident.kind === 'invalid') {
      setError('Enter your email or username.')
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
              ? 'Too many codes requested. Wait 60 seconds and try again.'
              : `Could not send the code — ${sendError.message}`,
          )
        }
        setNotice(`Code sent to ${ident.value}. It expires in 1 hour.`)
      } else {
        // Identical response whether the username exists or not — the
        // function swallows everything. The sentence has to hedge for the
        // same reason.
        await requestCodeForUsername(ident.value)
        setNotice(
          `If @${ident.value} has an account, a code is on its way to its email.`,
        )
      }
      setView('code-verify')
    })
  }

  function submitCodeVerify(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setError('The code is 6 digits. Check the email and re-enter it.')
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
              ? 'That code expired. Request a new one.'
              : 'That code is not valid. Re-enter the 6 digits from the newest email.',
          )
        }
      } else if (ident.kind === 'username') {
        await verifyCodeForUsername(ident.value, code)
      } else {
        throw new Error('Start over — enter your email or username first.')
      }
    })
  }

  function submitResetRequest(event: FormEvent) {
    event.preventDefault()
    const address = normalizeEmail(email)
    if (!address.includes('@')) {
      setError('Enter the email address on the account.')
      return
    }
    void run(async () => {
      // Errors are not surfaced distinctly: "this address has no account" is
      // exactly what a reset flow must not reveal.
      await supabase.auth.resetPasswordForEmail(address).catch(() => undefined)
      setNotice(`If ${address} has an account, a reset code is on its way.`)
      setView('reset-verify')
    })
  }

  function submitResetVerify(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setError('The code is 6 digits. Check the email and re-enter it.')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(`The new password needs at least ${MIN_PASSWORD} characters.`)
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
            ? 'That code expired. Request a new one.'
            : 'That code is not valid. Re-enter the 6 digits from the newest email.',
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-10">
      {/* The wordmark, not plain text: the sign-in screen is the first thing
          anyone sees, and it should look like the app behind it. */}
      <h1>
        <Wordmark height={56} className="text-text" />
      </h1>
      {inviter && <p className="kicker mt-4">{nameOf(inviter)} invited you</p>}
      <p className="mt-4 text-sm text-muted">Log a set in under thirty seconds.</p>
      {/* On the one screen where somebody hands over an email, and nowhere
          else. A privacy link buried in a settings menu is a link written for
          an app store rather than for a reader. */}
      <p className="mt-2 text-[11px] text-muted">
        Your training is private by default.{' '}
        <a href="/privacy" className="text-accent underline underline-offset-2">
          What Wazn stores
        </a>
      </p>

      {view === 'signin' && (
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="ring-edge press flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-surface text-[16px] font-medium disabled:opacity-45"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <div className="mt-2 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] uppercase tracking-widest text-muted">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submitPassword} className="flex flex-col gap-3">
            <label htmlFor="identifier" className="kicker">
              Email or username
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
              placeholder="you@example.com"
              className={inputClass}
            />
            <label htmlFor="password" className="kicker">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <button type="button" onClick={() => go('signup')} className={linkClass}>
              Create an account
            </button>
            <button
              type="button"
              onClick={() => go('reset-request')}
              className={linkClass}
            >
              Forgot password?
            </button>
          </div>
          <button
            type="button"
            onClick={() => go('code-request')}
            className={`${linkClass} text-start`}
          >
            Email me a code instead — no password needed
          </button>
        </div>
      )}

      {view === 'signup' && (
        <form onSubmit={submitSignUp} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="kicker">
            Email
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
            placeholder="you@example.com"
            className={inputClass}
          />
          <label htmlFor="new-password" className="kicker">
            Password — at least {MIN_PASSWORD} characters
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <button type="button" onClick={() => go('signin')} className={linkClass}>
            I already have an account
          </button>
        </form>
      )}

      {view === 'confirm' && (
        <form onSubmit={submitConfirm} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="kicker">
            6-digit code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={codeClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Verifying…' : 'Confirm and sign in'}
          </button>
          <button type="button" onClick={() => go('signup')} className={linkClass}>
            Use a different email
          </button>
        </form>
      )}

      {view === 'code-request' && (
        <form onSubmit={submitCodeRequest} className="mt-8 flex flex-col gap-3">
          <label htmlFor="identifier" className="kicker">
            Email or username
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
            placeholder="you@example.com"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <button type="button" onClick={() => go('signin')} className={linkClass}>
            Back to sign in
          </button>
        </form>
      )}

      {view === 'code-verify' && (
        <form onSubmit={submitCodeVerify} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="kicker">
            6-digit code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={codeClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Verifying…' : 'Verify and sign in'}
          </button>
          <button
            type="button"
            onClick={() => go('code-request')}
            className={linkClass}
          >
            Use a different email or username
          </button>
        </form>
      )}

      {view === 'reset-request' && (
        <form onSubmit={submitResetRequest} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="kicker">
            Email on the account
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
            placeholder="you@example.com"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Sending…' : 'Send reset code'}
          </button>
          <button type="button" onClick={() => go('signin')} className={linkClass}>
            Back to sign in
          </button>
        </form>
      )}

      {view === 'reset-verify' && (
        <form onSubmit={submitResetVerify} className="mt-8 flex flex-col gap-3">
          <label htmlFor="code" className="kicker">
            6-digit reset code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={codeClass}
          />
          <label htmlFor="new-password" className="kicker">
            New password — at least {MIN_PASSWORD} characters
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Resetting…' : 'Set password and sign in'}
          </button>
          <button
            type="button"
            onClick={() => go('reset-request')}
            className={linkClass}
          >
            Use a different email
          </button>
        </form>
      )}

      {notice && !error && <p className="mt-4 text-sm text-muted">{notice}</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-accent">
          {error}
        </p>
      )}
    </main>
  )
}
