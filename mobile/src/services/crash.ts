/**
 * Crash reporting. Until 2026-08-23 this app had none at all.
 *
 * The asymmetry is the reason this exists: the dying web app in `src/` writes
 * failures to `client_errors` (`src/lib/report-error.ts`) and wraps its tree in
 * an `ErrorBoundary`. The Expo app, which is the one being published, had
 * neither, and `report-error` is not exported through `portable.ts` so native
 * could not have reached it anyway. A crash on a stranger's Android phone was
 * invisible forever.
 *
 * WHY SENTRY RATHER THAN REUSING `client_errors`
 *
 * `client_errors` is a Postgres table written by an authenticated client. It
 * cannot record the two failures that matter most on a phone: a crash during
 * startup, before there is a session to authorise the insert, and a native
 * crash, which kills the JavaScript runtime that would have done the writing.
 * Those are exactly the crashes a first release produces.
 *
 * WHAT IS DELIBERATELY NOT SENT
 *
 * No email, no username, no workout contents. The user id is attached because
 * "did this hit one person or everyone" is the first question of every triage,
 * and it is already a random UUID rather than anything identifying. Breadcrumbs
 * from network calls are disabled: this app talks to exactly one host and the
 * URLs carry row ids.
 */

import * as Sentry from '@sentry/react-native'
import Constants from 'expo-constants'

const dsn = (Constants.expoConfig?.extra?.sentryDsn as string | undefined) ?? ''

/** Reporting is OFF without a DSN, which is the state of every local build. */
export const crashReportingEnabled = dsn !== ''

export function initCrashReporting(): void {
  if (!crashReportingEnabled) return
  Sentry.init({
    dsn,
    // The store build is the one whose crashes matter. A developer's own stack
    // traces are already on their screen.
    enabled: !__DEV__,
    sendDefaultPii: false,
    // One host, and its paths carry row ids. The stack trace is the evidence.
    enableCaptureFailedRequests: false,
    tracesSampleRate: 0,
  })
}

/**
 * Attach the signed-in user, or clear it on sign-out.
 *
 * Called from the auth listener rather than at init, because at init there is
 * no session yet and the most interesting crashes happen before there is one.
 */
export function identifyForCrashes(userId: string | null): void {
  if (!crashReportingEnabled) return
  Sentry.setUser(userId === null ? null : { id: userId })
}

/**
 * Report something that went wrong but did not crash.
 *
 * Deliberately never throws and never rejects. Every caller is on a path that
 * matters more than the reporting does, and the repo has already shipped one
 * defect where a notification framework having a bad day could interfere with
 * banking a set (`rest-alarm.ts`). Reporting a failure must not become one.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!crashReportingEnabled) return
  try {
    Sentry.captureException(
      error,
      context === undefined ? undefined : { extra: context },
    )
  } catch {
    // Nothing to do and nowhere to say it.
  }
}
