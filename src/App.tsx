import { lazy, Suspense, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { supabaseConfigError } from './lib/supabase'
import { useAuth } from './lib/use-auth'
import { useBackLayer } from './lib/use-back'
import { UnitProvider } from './lib/unit-context'
import { AuthScreen } from './components/AuthScreen'
import { Header } from './components/Header'
import { ScreenBoundary } from './components/ScreenBoundary'
import { TabBar } from './components/TabBar'
import type { Tab } from './components/TabBar'
import { LogScreen } from './screens/LogScreen'
import { HistoryScreen } from './screens/HistoryScreen'

// The chart library is most of the bundle and the Log screen is the hot path
// mid-workout, so Progress loads on demand.
const ProgressScreen = lazy(() =>
  import('./screens/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
)

// Friends is lazy for the same reason Progress is, plus one of its own: a
// brand-new user has nobody to follow, so the most common first session never
// downloads this at all.
const FriendsScreen = lazy(() =>
  import('./screens/FriendsScreen').then((m) => ({ default: m.FriendsScreen })),
)

// Coach is lazy for the same reason: a brand-new account has nothing for it to
// read, so the first session never downloads it.
const CoachScreen = lazy(() =>
  import('./screens/CoachScreen').then((m) => ({ default: m.CoachScreen })),
)

export default function App() {
  const { loading, userId } = useAuth()
  const [tab, setTab] = useState<Tab>('log')
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
    return <AuthScreen />
  }

  // The Log tab carries the mark; the others carry their name.
  const title =
    tab === 'history'
      ? 'History'
      : tab === 'progress'
        ? 'Progress'
        : tab === 'coach'
          ? 'Coach'
          : tab === 'friends'
            ? 'Friends'
            : undefined

  return (
    <UnitProvider>
      <Header title={title} />
      <main className="mx-auto w-full max-w-[430px] px-[18px] pb-28">
        {/* Every screen gets its own boundary, and the boundaries live inside
            <main> so the header and tab bar survive a crash and the user can
            always leave. Log is not lazy but is wrapped all the same — it is
            the screen where a black rectangle would cost the most. */}
        {tab === 'log' && (
          <ScreenBoundary
            screen="Log"
            reassurance="Every set you logged is already saved. Sets are written the moment you log them, so nothing here was lost. Try again, or reopen the tab."
          >
            <LogScreen userId={userId} onOpenCoach={() => setTab('coach')} />
          </ScreenBoundary>
        )}
        {tab === 'history' && (
          <ScreenBoundary screen="History">
            <HistoryScreen />
          </ScreenBoundary>
        )}
        {tab === 'progress' && (
          <ScreenBoundary screen="Progress">
            <Suspense fallback={<p className="py-10 text-sm text-muted">Loading…</p>}>
              <ProgressScreen onOpenCoach={() => setTab('coach')} />
            </Suspense>
          </ScreenBoundary>
        )}
        {tab === 'coach' && (
          <ScreenBoundary screen="Coach">
            <Suspense fallback={<p className="py-10 text-sm text-muted">Loading…</p>}>
              {/* Saving generated routines sends you to Log, where routines
                  live — the thing you just made is one tap from being started. */}
              <CoachScreen onRoutinesSaved={() => setTab('log')} />
            </Suspense>
          </ScreenBoundary>
        )}
        {tab === 'friends' && (
          <ScreenBoundary screen="Friends">
            <Suspense fallback={<p className="py-10 text-sm text-muted">Loading…</p>}>
              <FriendsScreen userId={userId} />
            </Suspense>
          </ScreenBoundary>
        )}
      </main>
      <TabBar active={tab} onChange={setTab} />
      <Analytics />
    </UnitProvider>
  )
}
