import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Txt, Kick } from '@/design/Txt'
import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Surface'
import { Screen } from '@/components/ui/Screen'
import { useAuth } from '@/hooks/use-auth'
import { useLocale } from '@/hooks/use-locale'
import { supabase } from '@/services/supabase'
import { fetchInvitePreview, type InvitePreview } from '@/services/crew'
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
  /*
   * The inviter's actual week. F6: "An invite link opens on the inviter's
   * actual week, so accepting is joining something visible rather than
   * downloading an app on faith."
   *
   * A separate, anon-callable read (`invite_preview`, 0038) rather than more
   * columns on `resolve_invite`, because that function is load-bearing for the
   * follow flow and widening it would change what every existing caller gets.
   * Null stays null: a link whose owner has since gone private resolves to
   * nothing here and the screen simply does not show a week.
   */
  const [week, setWeek] = useState<InvitePreview | null>(null)
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

    /*
     * The week, on its own read and on its own failure path. It is the REASON
     * on the invite and not the invite itself, so a preview that does not come
     * back must not stop the name rendering or the button working: the screen
     * degrades to what it showed before 0038 existed.
     */
    void fetchInvitePreview(code)
      .then((preview) => {
        if (live) setWeek(preview)
      })
      .catch(() => {})

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
        <Txt step="fig">{t('invite.wants_you', { name: inviter })}</Txt>
      ) : (
        // A code that does not resolve is not an error worth a red screen —
        // it is usually an old link. The door still opens.
        //
        // `textTransform: 'none'` is LOAD-BEARING and was briefly deleted on
        // 2026-08-21 on an audit finding that called it a v5 no-op. It is not:
        // `title` still carries `uppercase: true` in `tokens.ts` and
        // `design/type.ts:92` still applies it, so without this the sentence
        // renders as THAT INVITE HAS EXPIRED. The finding was wrong, a second
        // agent confirmed it, and it shipped — see WAZN_PLAN.md §7.0.
        <Txt step="title" style={{ textTransform: 'none' }}>
          {t('invite.expired')}
        </Txt>
      )}

      {/*
        The reason, and it is the whole mechanism of an invite link.
        A name alone asks a stranger to take the app on faith; a name plus
        "6 sessions this week, 2.5 a week before that" shows them the thing
        they are being asked to join. Rendered only when the preview resolved,
        so an expired or newly-private link degrades to the name-less state
        rather than to a row of zeros.
      */}
      {week !== null && (
        <Card style={{ gap: 6 }}>
          <Txt step="num" ltr>
            {week.weeklyTarget === null
              ? t('invite.week', { n: String(week.sessionsThisWeek) })
              : t('invite.week_of', {
                  n: String(week.sessionsThisWeek),
                  goal: String(week.weeklyTarget),
                })}
          </Txt>
          <Txt step="caption" ink="muted">
            {t('crew.average', { avg: week.avgSessions4w.toFixed(1) })}
          </Txt>
        </Card>
      )}

      <Txt step="body" ink="muted">
        {signedIn ? t('invite.next.signed_in') : t('invite.next.signed_out')}
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
