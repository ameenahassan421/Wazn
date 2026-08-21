import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Txt, Kick } from '@/design/Txt'
import { Btn } from '@/components/ui/Btn'
import { Screen } from '@/components/ui/Screen'
import { useAuth } from '@/hooks/use-auth'
import { useLocale } from '@/hooks/use-locale'
import { supabase } from '@/services/supabase'
import { holdPendingInvite } from '@/services/pending-invite'

/**
 * `wazn.app/join/<code>` — the invite door.
 *
 * ── WHY THIS ROUTE HAD TO EXIST BEFORE ANY OTHER FIX ────────────────────────
 * `app.config.ts` claims `applinks:wazn.app` and an Android intent filter for
 * `https://wazn.app/join`. Claiming a domain means the OS stops opening those
 * URLs in a browser and hands them to this app instead — so with the claim in
 * place and no route to receive it, a real invite link landed on `+not-found`.
 * That is strictly worse than not claiming the domain at all, because without
 * the claim the link would have opened the working web page. The claim shipped
 * first; this is the other half of it.
 *
 * ── OUTSIDE THE AUTH GUARD, DELIBERATELY ────────────────────────────────────
 * An invite is how somebody arrives BEFORE they have an account. Bouncing
 * them to a bare sign-in screen loses both the code and the reason they
 * tapped, so the code is held on the device and the screen says who sent it
 * while they sign up.
 */

/** Mirrors `resolveInvite` in `src/lib/social.ts` — same RPC, same shape.
 *  Not shared, because it needs a Supabase client and those differ. */
async function resolveInvite(
  code: string,
): Promise<{ username: string | null; display_name: string | null } | null> {
  const { data, error } = await supabase.rpc('resolve_invite', { p_code: code })
  if (error) return null
  const rows = (data ?? []) as {
    username: string | null
    display_name: string | null
  }[]
  return rows[0] ?? null
}

/** What to call someone, in the order the data is likely to be there. */
function nameOf(p: { username: string | null; display_name: string | null }): string {
  if (p.display_name?.trim()) return p.display_name.trim()
  if (p.username) return `@${p.username}`
  return 'Someone'
}

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const router = useRouter()
  const { t } = useLocale()
  const { loading, userId } = useAuth()

  const [inviter, setInviter] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  /**
   * Derived during render, not set by the effect. A route reached with no
   * code has nothing to look up, so it is already resolved on the first
   * frame — and setting that synchronously inside the effect is the pattern
   * `react-hooks` v7 rejects.
   */
  const hasCode = typeof code === 'string' && code !== ''
  const resolved = !hasCode || checked

  useEffect(() => {
    if (!hasCode) return
    let live = true

    // Held before it is resolved: if the network is down on the tap, the
    // invite still survives to the next launch. Losing an invite to a dead
    // radio is the failure this ordering exists to prevent.
    void holdPendingInvite(code)

    void resolveInvite(code)
      .then((found) => {
        if (!live) return
        setInviter(found === null ? null : nameOf(found))
        setChecked(true)
      })
      .catch(() => {
        if (live) setChecked(true)
      })

    return () => {
      live = false
    }
  }, [code, hasCode])

  if (loading || !resolved) return <Screen scroll={false} />

  const signedIn = userId !== null

  return (
    <Screen scroll={false} style={{ justifyContent: 'center', gap: 14 }}>
      <Kick ink="accentSoft">{t('welcome.invited.heading')}</Kick>

      {inviter !== null ? (
        <Txt step="fig">{inviter} wants you on the board.</Txt>
      ) : (
        // A code that does not resolve is not an error worth a red screen —
        // it is usually an old link. The door still opens.
        //
        // This carried `style={{ textTransform: 'none' }}`, overriding an
        // uppercase that the `title` step stopped applying when v5 was
        // retired: a no-op guarding against a system that no longer exists.
        <Txt step="title">That invite has expired.</Txt>
      )}

      <Txt step="body" ink="muted">
        {signedIn
          ? 'Open Friends to follow them back.'
          : 'Make an account and they will be waiting on your Friends tab.'}
      </Txt>

      <Btn
        kind="hero"
        full
        label={signedIn ? t('invite.open_app') : t('auth.signup.link')}
        onPress={() => router.replace(signedIn ? '/' : '/sign-in')}
      />
    </Screen>
  )
}
