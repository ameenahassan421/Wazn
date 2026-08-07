# Social sign-in setup (Google now, Apple at 4B)

Ameen's decision, 2026-08-07: social sign-in becomes the primary path,
with the 6-digit email code kept as the always-available fallback (the
Yahoo deliverability failure is the standing proof that one path is not
enough). This file is the setup guide — the parts only Ameen can do,
then the parts Claude does.

## Part 1 — Ameen: create the Google OAuth client (~15 min)

1. Go to https://console.cloud.google.com → create a project (name:
   `Wazn`) or reuse an existing one.
2. **APIs & Services → OAuth consent screen**: External. App name
   `Wazn`, support email your Gmail, developer contact your Gmail.
   Scopes: only the non-sensitive defaults (`email`, `profile`,
   `openid`) — requesting nothing sensitive means no Google
   verification review. Publish the app (leave "Testing" mode, and
   only test users can sign in).
3. **APIs & Services → Credentials → Create credentials → OAuth client
   ID**: Application type **Web application**, name `Wazn web`.
   - Authorized JavaScript origins:
     - `https://www.trywazn.app`
     - `https://trywazn.app`
   - Authorized redirect URI (exactly this — it is Supabase's callback,
     not the app's):
     - `https://ttasiwxeqerhsztxjxip.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.
5. Supabase dashboard → Authentication → Sign In / Up → Google →
   enable, paste both values, save. (Or hand them to a Claude session
   to set via the Management API — `scripts/supabase_admin.ts` is the
   existing pattern; the secret is config, not code, and must never
   land in the repo or a `VITE_*` var.)

That's everything Claude is blocked on. Once done, run the auth prompt
in `docs/IMPLEMENTATION_PROMPTS.md`.

## Part 2 — Claude (after Part 1): the app work

- "Continue with Google" as the hero action on the auth screen
  (`signInWithOAuth({ provider: 'google' })` with
  `redirectTo: window.location.origin`), with "Email me a code instead"
  as the secondary path beneath — the existing OTP flow, unchanged.
- Button branding: Google's guidelines permit a neutral dark variant —
  use it; the design system's no-other-colours rule holds (the "G"
  mark itself is exempt as a trademark, buttons stay ink/chalk).
- Handle the OAuth return (Supabase parses the URL hash; make sure the
  `/join/{code}` invite capture in `src/main.tsx` and the auth
  listener coexist with the callback).
- Update `uri_allow_list` in Supabase if the redirect target isn't
  already covered by the existing site URL config.
- Extend LAUNCH.md: a second-account pass must now cover BOTH paths
  (Google sign-in from a fresh account, and the OTP fallback).

## Account-linking facts (why the dot incident doesn't repeat here)

Supabase links identities by verified email. Google returns the
account's **canonical** address — for Gmail, the undotted registered
form — so a Google sign-in by Ameen resolves to
`ameenahassan421@gmail.com`, which is exactly the live account
(`6da348ed`). The OTP path is still the one that can mint dot-variant
duplicates (a user _types_ the address there); the Gmail
dot-normalisation guard from STATUS remains worth building for that
path.

## Apple — deferred to Stage 4B, then mandatory

Sign in with Apple requires the $99/year Apple Developer account,
which the plan buys at Stage 4B for the App Store anyway. Two facts to
carry into 4B:

1. **It stops being optional there.** App Store Review Guideline 4.8:
   an iOS app offering any third-party sign-in (Google) must also
   offer Sign in with Apple. The 4B store checklist inherits it.
2. **Hide-my-email**: Apple users can relay their address
   (`@privaterelay.appleid.com`), which breaks the "same email links
   the account" assumption — an Apple user who previously used OTP
   with their real address may create a second account. The 4B
   implementation needs an explicit linking story (Supabase identity
   linking) before launch, not after.

## Capacitor note (also 4B)

Inside the store builds, OAuth cannot round-trip through the system
browser and land back in the app without deep-link handling
(`@capacitor/browser` + a custom scheme or universal links +
`skipBrowserRedirect` and `exchangeCodeForSession`). This is known,
bounded work — it rides U6a, and the OTP fallback keeps sign-in
working in the wrapped app even before it's wired.
