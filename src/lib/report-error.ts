import { supabase } from './supabase'

/**
 * Fire-and-forget crash reporting into our own database.
 *
 * Before this, a crash in production was completely invisible — `grep` found
 * no error boundary, no `window.onerror`, and no error service anywhere in
 * `src/`; `@vercel/analytics` counts page views (`docs/INFRASTRUCTURE_AUDIT.md`
 * §5-I5). The only way a broken screen surfaced was a user mentioning it, and
 * three defects had already reached production in a single day.
 *
 * Deliberately not a third-party service. A pre-beta product with one
 * developer does not need Sentry's dashboard or its bill; it needs to know
 * that something threw. `client_errors` is a table we already own, under RLS,
 * with no processor to name in the privacy policy.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **Never throw, never block.** Reporting runs after the boundary has
 *     already rendered. A failed report must be invisible.
 *  2. **Never send anything identifying.** See `safePath()` — the obvious
 *     implementation of "which page was it on" would have exfiltrated invite
 *     tokens and auth tokens straight into a table.
 */

/**
 * A render loop that throws would otherwise insert a row per attempt. Two
 * brakes: identical reports are sent once, and a session sends at most this
 * many in total. A crash reporter that can DoS your own database is a second
 * outage, not a diagnosis.
 */
const MAX_PER_SESSION = 5
const seen = new Set<string>()
let sent = 0

/**
 * The path, with the query string and hash removed.
 *
 * Not a detail. Wazn's invite links carry a token in the query
 * (`?invite=…`), and Supabase's OAuth and recovery redirects land with an
 * access token in the hash. `location.href` would have written both into a
 * table, turning a crash report into a credential leak. The pathname alone
 * answers "which screen" and carries nothing.
 */
function safePath(): string {
  try {
    return window.location.pathname.slice(0, 200)
  } catch {
    return ''
  }
}

/** One line per frame, capped — enough to place the crash, not a core dump. */
function trim(value: string | undefined, max: number): string | null {
  if (!value) return null
  return value.trim().slice(0, max) || null
}

export interface ErrorReport {
  error: unknown
  /** Which boundary caught it — 'root', or the tab name. */
  boundary: string
  /** React's component stack, when the caller is an error boundary. */
  componentStack?: string
}

/**
 * Record that something threw. Returns a promise that never rejects; callers
 * are free to ignore it entirely.
 */
export async function reportError({
  error,
  boundary,
  componentStack,
}: ErrorReport): Promise<void> {
  try {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? 'unknown error')

    const key = `${boundary}|${message}`
    if (seen.has(key) || sent >= MAX_PER_SESSION) return
    seen.add(key)
    sent += 1

    // Signed out there is no `auth.uid()` for the row to belong to, and the
    // insert policy would refuse it. The auth screen is also the one place a
    // crash is visible to the person who can report it out loud.
    const { data } = await supabase.auth.getSession()
    if (!data.session) return

    await supabase.from('client_errors').insert({
      message: message.slice(0, 500),
      boundary: boundary.slice(0, 40),
      component_stack: trim(componentStack, 2000),
      stack: trim(error instanceof Error ? error.stack : undefined, 2000),
      path: safePath(),
    })
  } catch {
    // Reporting a failure to report is not a thing this app needs to do.
  }
}

/** Test seam. Session-scoped state would otherwise leak between cases. */
export function resetReportingForTests(): void {
  seen.clear()
  sent = 0
}
