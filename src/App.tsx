import { lazy, Suspense, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { supabaseConfigError } from './lib/supabase'
import { useAuth } from './lib/use-auth'
import { useBackLayer } from './lib/use-back'
import { UnitProvider } from './lib/unit-context'
import { AuthScreen } from './components/AuthScreen'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import type { Tab } from './components/TabBar'
import { LogScreen } from './screens/LogScreen'
import { HistoryScreen } from './screens/HistoryScreen'

// The chart library is most of the bundle and the Log screen is the hot path
// mid-workout, so Progress loads on demand.
const ProgressScreen = lazy(() =>
  import('./screens/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
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

  // The Log tab carries the mark; the other two carry their name.
  const title =
    tab === 'history' ? 'History' : tab === 'progress' ? 'Progress' : undefined

  return (
    <UnitProvider>
      <Header title={title} />
      <main className="mx-auto w-full max-w-[430px] px-[18px] pb-28">
        {tab === 'log' && <LogScreen userId={userId} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'progress' && (
          <Suspense fallback={<p className="py-10 text-sm text-muted">Loading…</p>}>
            <ProgressScreen />
          </Suspense>
        )}
      </main>
      <TabBar active={tab} onChange={setTab} />
      <Analytics />
    </UnitProvider>
  )
}
