import { Suspense, useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { browserStorage } from './lib/checkpoint'
import { reconcileDeviceUser } from './lib/device-reset'
import { lazyScreen } from './lib/lazy-screen'
import { supabaseConfigError } from './lib/supabase'
import { useAuth } from '@wazn/core/use-auth'
import { useBackLayer } from './lib/use-back'
import { LocaleProvider, useLocale } from './lib/locale-context'
import { ThemeProvider } from './lib/theme-context'
import { UnitProvider } from './lib/unit-context'
import { CoachProvider } from './lib/coach-context'
import { TabBar } from './components/TabBar'
import type { TabKey } from './components/TabBar'
import { fetchMyProfile } from './lib/social'
import { AuthScreen } from './components/AuthScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { LogScreen } from './screens/LogScreen'
import { takeInviteCode } from './lib/invite'
import { resolveInvite } from './lib/social'
import type { Inviter } from './lib/social'
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

// Settings is lazy because it is the rarest screen in the app by design: it
// holds preferences a person sets once. It is also the only lazy screen a
// brand-new account is likely to open, which is why it is small.
const SettingsScreen = lazyScreen(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)

// Body is lazy for the reason Progress is: it draws charts, and a lifter who
// has never logged a weigh-in — which is every lifter on their first day —
// never downloads it.
const BodyScreen = lazyScreen(() =>
  import('./screens/BodyScreen').then((m) => ({ default: m.BodyScreen })),
)

/**
 * Where you are.
 *
 * ── THE TAB BAR CAME BACK, AND THE DOORS STAYED ─────────────────────────────
 * The five-tab bar was retired on 2026-08-13 (the audit's S2, "five equal tabs
 * for five unequal jobs") and replaced with doors — cards that are themselves
 * the way into the screen they summarise. Design v3.0 reverses that and grows
 * the bar to SIX: `Log · History · Progress · Body · Coach · Friends`. Ameen
 * confirmed the handoff wins (2026-08-14).
 *
 * What did NOT happen is the doors going away. The Last PR card still opens
 * Progress, the coach card still opens Coach, the header avatar still opens
 * Settings, and Friends keeps its row in Settings as well as gaining a tab.
 * Two things follow from that: nobody who learned the app last week has lost
 * their route, and the two harnesses that navigate by pressing real controls
 * still pass without being rewritten around the bar.
 *
 * `settings` is the one view with no tab, deliberately: it is the rarest
 * screen in the app by design and the avatar is where a person looks for it.
 */
export type View =
  'log' | 'history' | 'progress' | 'body' | 'coach' | 'friends' | 'settings'

/**
 * The lazy-screen fallback, as its own component so `t()` runs INSIDE
 * LocaleProvider. Calling it from App would resolve against the default
 * context and print the raw key.
 */
function ScreenFallback() {
  const { t } = useLocale()
  return <p className="py-10 text-body text-muted">{t('chrome.loading')}</p>
}

export default function App() {
  const { loading, session, userId } = useAuth()
  const [tab, setTab] = useState<View>('log')
  /**
   * Which view the Log screen opens on when we go there.
   *
   * Set explicitly at every navigation site rather than cleared afterwards,
   * so there is no stale intent to leak: going home from anywhere means the
   * board, and the empty-history screen's "Start a workout" means the picker.
   * That button used to be the only place in the app whose label promised
   * something its press did not do.
   */
  /**
   * True while Progress has a lift's detail page covering it.
   *
   * Only ever read while `tab === 'progress'`, so a stale `true` left behind
   * by an unmount cannot strand another screen without a back chevron. That
   * is the whole reason it is checked against the tab rather than trusted on
   * its own — a screen with no way out is worse than the duplicate chevron
   * this removes.
   */
  const [progressSubView, setProgressSubView] = useState(false)

  /**
   * Whoever invited this person, if they arrived through a /join link.
   *
   * Resolved HERE because `takeInviteCode()` consumes the code and every
   * screen in this app unmounts when you leave it. Owned by LogScreen, the
   * offer was taken on the first home render and gone the moment you opened
   * History — the same class of bug as the first-run screen replaying, and
   * for the same reason. App mounts once per session.
   */
  const [inviter, setInviter] = useState<Inviter | null>(null)
  useEffect(() => {
    const code = takeInviteCode()
    if (!code) return
    let live = true
    void resolveInvite(code).then((found) => {
      if (live) setInviter(found)
    })
    return () => {
      live = false
    }
  }, [])
  const [logView, setLogView] = useState<'overview' | 'picker' | 'import'>('overview')
  const openLog = (view: 'overview' | 'picker' | 'import' = 'overview') => {
    setLogView(view)
    setTab('log')
  }
  /**
   * The header's monogram. Fetched here rather than inside the header so the
   * one request serves both the chip and the Settings screen behind it.
   *
   * The fetched name carries the id it belongs to, and the effect never
   * clears state on its own — a different account simply stops matching, so
   * the previous person's initial is inert rather than needing to be wiped.
   * That is the pattern CLAUDE.md's state-handling section requires:
   * `setState` inside an effect is what the lint rule forbids, and a "clear
   * it on sign-out" effect is exactly the shape that broke the set auto-fill.
   */
  const [profile, setProfile] = useState<{
    userId: string
    username: string | null
  } | null>(null)
  const name = profile?.userId === userId ? profile.username : null

  useEffect(() => {
    if (!userId) return
    let live = true
    void fetchMyProfile(userId)
      .then((p) => {
        if (live) setProfile({ userId, username: p?.username ?? null })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [userId])

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

  // Android back from any secondary screen returns home instead of closing
  // the app. It backs up the header's chevron rather than replacing it: iOS
  // has no system back gesture to fall back on.
  useBackLayer(tab !== 'log', () => openLog())

  if (supabaseConfigError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5">
        <p role="alert" className="text-body text-accent-300">
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
      <ThemeProvider>
        <LocaleProvider>
          <AuthScreen />
        </LocaleProvider>
      </ThemeProvider>
    )
  }

  // The Log tab carries the mark; the others carry their name.
  // Settings draws its own title beside its own back chevron, so the header
  // stays on the mark there rather than saying the same word twice.
  // A screen showing a sub-view carries its own title, so the header stands
  // down and shows the mark — the same reason Settings has no header title.
  const titleKey =
    tab === 'progress' && progressSubView
      ? null
      : tab === 'history'
        ? 'nav.history'
        : tab === 'progress'
          ? 'nav.progress'
          : tab === 'coach'
            ? 'nav.coach'
            : tab === 'friends'
              ? 'nav.friends'
              : // Body draws its own title beside its own LOG WEIGH-IN chip,
                // like Settings does — so the header stays on the mark rather
                // than saying the same word twice.
                null

  return (
    // Two boundaries. The inner one is keyed to the tab, so a crashed screen
    // recovers by switching tabs and coming back — no reload, and an
    // in-progress workout survives it. The outer one exists because the
    // header and tab bar can throw too, and a boundary inside `main` cannot
    // catch its own chrome. See components/ErrorBoundary.tsx.
    <ErrorBoundary boundary="root">
      <ThemeProvider userId={userId}>
        <LocaleProvider userId={userId}>
          <UnitProvider userId={userId}>
            <CoachProvider userId={userId}>
              <Header
                titleKey={titleKey}
                name={name}
                onBack={
                  tab === 'log' || (tab === 'progress' && progressSubView)
                    ? undefined
                    : () => openLog()
                }
                onOpenSettings={() => setTab('settings')}
              />
              {/* The bottom padding matches the sticky clusters' `bottom` value
                exactly. That is not a coincidence to preserve by accident: a
                sticky element stops drifting at the end of a scroll precisely
                when its natural resting place equals the offset it sticks at,
                and the two hand-tuned negative margins this replaces existed
                because the old `pb-28` was clearing a tab bar instead. */}
              <main
                className="mx-auto w-full max-w-[430px] px-[18px]"
                // Clear the six-tab bar, plus the 10px every sticky cluster's
                // correction is derived against. One expression, named once —
                // see `--tab-space` in index.css.
                style={{ paddingBottom: 'calc(var(--tab-space) + 10px)' }}
              >
                <ErrorBoundary boundary={tab} resetKey={tab}>
                  {tab === 'log' && (
                    <LogScreen
                      initialView={logView}
                      inviter={inviter}
                      userId={userId}
                      onOpenCoach={() => setTab('coach')}
                      onOpenHistory={() => setTab('history')}
                      onOpenProgress={() => setTab('progress')}
                    />
                  )}
                  {tab === 'history' && (
                    <HistoryScreen onStart={() => openLog('picker')} />
                  )}
                  {tab === 'progress' && (
                    <Suspense fallback={<ScreenFallback />}>
                      <ProgressScreen
                        onOpenCoach={() => setTab('coach')}
                        onStart={() => openLog('picker')}
                        onSubView={setProgressSubView}
                      />
                    </Suspense>
                  )}
                  {tab === 'coach' && (
                    <Suspense fallback={<ScreenFallback />}>
                      {/* Saving generated routines sends you to Log, where routines
                    live — the thing you just made is one tap from being
                    started. */}
                      <CoachScreen onRoutinesSaved={() => openLog()} />
                    </Suspense>
                  )}
                  {tab === 'friends' && (
                    <Suspense fallback={<ScreenFallback />}>
                      <FriendsScreen userId={userId} />
                    </Suspense>
                  )}
                  {tab === 'body' && (
                    <Suspense fallback={<ScreenFallback />}>
                      <BodyScreen />
                    </Suspense>
                  )}
                  {tab === 'settings' && (
                    <Suspense fallback={<ScreenFallback />}>
                      <SettingsScreen
                        userId={userId}
                        email={session?.user.email ?? null}
                        joinedAt={session?.user.created_at ?? null}
                        onFriends={() => setTab('friends')}
                        onImport={() => openLog('import')}
                      />
                    </Suspense>
                  )}
                </ErrorBoundary>
              </main>
              {/* Settings has no tab — it is the avatar's screen — so the bar
                shows nothing as current while it is open rather than
                highlighting a place the reader is not. */}
              <TabBar
                active={tab === 'settings' ? null : (tab as TabKey)}
                onSelect={(next) => {
                  if (next === 'log') openLog()
                  else setTab(next)
                }}
              />
              <Analytics />
            </CoachProvider>
          </UnitProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
