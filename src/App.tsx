import { Suspense, useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { browserStorage } from './lib/checkpoint'
import { reconcileDeviceUser } from './lib/device-reset'
import { lazyScreen } from './lib/lazy-screen'
import { supabaseConfigError } from './lib/supabase'
import { useAuth } from './lib/use-auth'
import { useBackLayer } from './lib/use-back'
import { LocaleProvider, useLocale } from './lib/locale-context'
import { UnitProvider } from './lib/unit-context'
import { AuthScreen } from './components/AuthScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import type { Tab } from './components/TabBar'
import { LogScreen } from './screens/LogScreen'
import { HistoryScreen } from './screens/HistoryScreen'

// All three go through `lazyScreen`, not `lazy`. A deploy retires the hashed
// chunk an already-open page is about to ask for, and these three tabs — and
// only these three — died on it. See lib/lazy-screen.ts.

// The Log screen is the hot path mid-workout, so Progress loads on demand.
const ProgressScreen = lazyScreen(() =>
  import('./screens/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
)

// Friends is lazy for the same reason Progress is, plus one of its own: a
// brand-new user has nobody to follow, so the most common first session never
// downloads this at all.
const FriendsScreen = lazyScreen(() =>
  import('./screens/FriendsScreen').then((m) => ({ default: m.FriendsScreen })),
)

// Coach is lazy for the same reason: a brand-new account has nothing for it to
// read, so the first session never downloads it.
const CoachScreen = lazyScreen(() =>
  import('./screens/CoachScreen').then((m) => ({ default: m.CoachScreen })),
)

/**
 * The lazy-screen fallback, as its own component so `t()` runs INSIDE
 * LocaleProvider. Calling it from App would resolve against the default
 * context and print the raw key.
 */
function ScreenFallback() {
  const { t } = useLocale()
  return <p className="py-10 text-sm text-muted">{t('chrome.loading')}</p>
}

export default function App() {
  const { loading, userId } = useAuth()
  const [tab, setTab] = useState<Tab>('log')

  /**
   * A different person on this phone gets a blank device.
   *
   * U3b keeps training data locally — an IndexedDB cache and write queue, the
   * workout checkpoint, and the service worker's cache of Supabase reads. The
   * first two refuse to answer anyone but their owner; the third cannot, since
   * the Cache API keys on URL and these responses differ only by an auth
   * header. This is what closes it. Not on sign-out: signing back in as
   * yourself with a set still queued must not lose the set.
   */
  useEffect(() => {
    void reconcileDeviceUser(userId, browserStorage())
  }, [userId])

  // Android back from History or Progress returns to Log — the home tab —
  // instead of closing the app, matching what a bottom tab bar promises.
  useBackLayer(tab !== 'log', () => setTab('log'))

  if (supabaseConfigError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5">
        <p role="alert" className="text-sm text-accent">
          {supabaseConfigError}
        </p>
      </main>
    )
  }

  if (loading) {
    return <div className="min-h-dvh bg-ink" />
  }

  if (!userId) {
    // LocaleProvider wraps AuthScreen so the pre-auth surface can offer the
    // language toggle — a signed-out user has no Header to put it in.
    return (
      <LocaleProvider>
        <AuthScreen />
      </LocaleProvider>
    )
  }

  // The Log tab carries the mark; the others carry their name.
  const titleKey =
    tab === 'history'
      ? 'nav.history'
      : tab === 'progress'
        ? 'nav.progress'
        : tab === 'coach'
          ? 'nav.coach'
          : tab === 'friends'
            ? 'nav.friends'
            : null

  return (
    // Two boundaries. The inner one is keyed to the tab, so a crashed screen
    // recovers by switching tabs and coming back — no reload, and an
    // in-progress workout survives it. The outer one exists because the
    // header and tab bar can throw too, and a boundary inside `main` cannot
    // catch its own chrome. See components/ErrorBoundary.tsx.
    <ErrorBoundary boundary="root">
      <LocaleProvider userId={userId}>
        <UnitProvider userId={userId}>
          <Header titleKey={titleKey} />
          <main className="mx-auto w-full max-w-[430px] px-[18px] pb-28">
            <ErrorBoundary boundary={tab} resetKey={tab}>
              {tab === 'log' && (
                <LogScreen userId={userId} onOpenCoach={() => setTab('coach')} />
              )}
              {tab === 'history' && <HistoryScreen />}
              {tab === 'progress' && (
                <Suspense fallback={<ScreenFallback />}>
                  <ProgressScreen onOpenCoach={() => setTab('coach')} />
                </Suspense>
              )}
              {tab === 'coach' && (
                <Suspense fallback={<ScreenFallback />}>
                  {/* Saving generated routines sends you to Log, where routines
                    live — the thing you just made is one tap from being
                    started. */}
                  <CoachScreen onRoutinesSaved={() => setTab('log')} />
                </Suspense>
              )}
              {tab === 'friends' && (
                <Suspense fallback={<ScreenFallback />}>
                  <FriendsScreen userId={userId} />
                </Suspense>
              )}
            </ErrorBoundary>
          </main>
          <TabBar active={tab} onChange={setTab} />
          <Analytics />
        </UnitProvider>
      </LocaleProvider>
    </ErrorBoundary>
  )
}
