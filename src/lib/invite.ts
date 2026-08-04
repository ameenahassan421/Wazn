/**
 * Invite links: `https://www.trywazn.app/join/<code>`.
 *
 * The app has no router, and this does not add one. The path is read once at
 * startup, the code is stashed, and the URL is cleaned up immediately — so by
 * the time React renders, the app is on `/` exactly as it always is.
 *
 * The stash is `sessionStorage`, and that choice is the whole design. Signing
 * in with an OTP means leaving the app for a mail client and coming back,
 * possibly minutes later, possibly through a fresh tab. A code held in React
 * state would not survive that; one held in `localStorage` would outlive the
 * intent and silently follow someone weeks later. A session is exactly the
 * lifetime of "I am currently accepting this invite".
 */

const KEY = 'wazn.invite'

/** Matches `invites_code_check` in migration 0011. */
const CODE = /^[a-z0-9]{8,16}$/

/**
 * Call once, before rendering. Returns nothing — the code goes to
 * sessionStorage, and `takeInviteCode()` is how it comes back out.
 */
export function captureInviteFromUrl(): void {
  if (typeof window === 'undefined') return
  const match = window.location.pathname.match(/^\/join\/([^/]+)\/?$/)
  if (!match) return

  const code = decodeURIComponent(match[1]).toLowerCase()

  // Rewrite the URL whether or not the code is valid. A junk /join/ path that
  // stays in the address bar becomes the PWA's start_url if the user installs
  // from here, and then every launch is an invite landing.
  window.history.replaceState(null, '', '/')

  if (!CODE.test(code)) return
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    // Private browsing, or storage disabled. The invite is lost, which is
    // recoverable — the person can still follow by username.
  }
}

export function peekInviteCode(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Read and clear. An invite is accepted once. */
export function takeInviteCode(): string | null {
  const code = peekInviteCode()
  if (code) {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* nothing to do — worst case the follow is attempted twice, and the
         second attempt is a no-op on a unique constraint */
    }
  }
  return code
}

export function clearInviteCode(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* see above */
  }
}
