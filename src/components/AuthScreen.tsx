import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Wordmark'

type Step = 'email' | 'code'

export function AuthScreen() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address.includes('@')) {
      setError('Enter a full email address, like you@example.com.')
      return
    }

    setBusy(true)
    setError(null)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    })
    setBusy(false)

    if (sendError) {
      setError(
        /rate|seconds|limit/i.test(sendError.message)
          ? 'Too many codes requested. Wait 60 seconds and try again.'
          : `Could not send the code — ${sendError.message}`,
      )
      return
    }

    setNotice(`Code sent to ${address}. It expires in 1 hour.`)
    setStep('code')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    const token = code.trim()
    if (token.length !== 6) {
      setError('The code is 6 digits. Check the email and re-enter it.')
      return
    }

    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    })
    setBusy(false)

    if (verifyError) {
      setError(
        /expired/i.test(verifyError.message)
          ? 'That code expired. Request a new one.'
          : 'That code is not valid. Re-enter the 6 digits from the newest email.',
      )
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5 py-10">
      {/* The wordmark, not plain text: the sign-in screen is the first thing
          anyone sees, and it should look like the app behind it. */}
      <h1>
        <Wordmark height={56} className="text-text" />
      </h1>
      <p className="mt-4 text-sm text-muted">
        Log a set in under thirty seconds. Sign in with a 6-digit email code — no
        password.
      </p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-8 flex flex-col gap-3">
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
            className="h-14 w-full rounded-lg border border-line bg-surface px-4 text-start text-lg outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-base btn-hero press h-14 w-full text-[18px] disabled:opacity-45"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-8 flex flex-col gap-3">
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
            className="tnum h-16 w-full rounded-lg border border-line bg-surface px-4 text-start text-3xl tracking-[0.35em] outline-none placeholder:text-muted focus:border-accent"
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
            onClick={() => {
              setStep('email')
              setCode('')
              setError(null)
              setNotice(null)
            }}
            className="h-12 text-sm text-muted underline underline-offset-4"
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
