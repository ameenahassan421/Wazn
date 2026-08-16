import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase, supabaseConfigError } from '@/services/supabase'

/**
 * Who is signed in.
 *
 * ── `loading` IS NOT A COSMETIC FLAG ────────────────────────────────────────
 * Reading a persisted session means a keychain round trip, so on the first
 * frame the answer to "is anyone signed in" is genuinely unknown. Treating
 * unknown as "no" would bounce every returning lifter to the sign-in screen
 * for a few hundred milliseconds before bouncing them back — which on a phone
 * reads as the app having logged you out.
 *
 * So there are three states, not two, and the route guard in
 * `app/_layout.tsx` renders nothing at all while this is true.
 *
 * ── ONE LISTENER, NOT A POLL ────────────────────────────────────────────────
 * `onAuthStateChange` fires for sign-in, sign-out, token refresh and the
 * initial restore. `getSession` is called once alongside it because the
 * listener's INITIAL_SESSION event is not guaranteed to arrive before the
 * first render on every platform, and a guard that waits forever is worse
 * than one that asks twice.
 */
export function useAuth(): {
  loading: boolean
  session: Session | null
  userId: string | null
} {
  const [session, setSession] = useState<Session | null>(null)
  /**
   * Seeded from the config, not corrected by an effect. A build with no
   * Supabase configuration can never produce a session, so "loading" is
   * already false on the first render — and `react-hooks` v7 forbids the
   * synchronous `setState` inside an effect that the obvious version needs.
   * `supabaseConfigError` is a module constant, so this can never go stale.
   */
  const [loading, setLoading] = useState(supabaseConfigError === null)

  useEffect(() => {
    if (supabaseConfigError !== null) return

    let live = true

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!live) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        // An unreadable keychain is a signed-out device, not a broken app.
        if (live) setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!live) return
      setSession(next)
      setLoading(false)
    })

    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { loading, session, userId: session?.user.id ?? null }
}
