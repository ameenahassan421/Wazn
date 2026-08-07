# Auth setup: Google + Apple + email/password + code

Ameen's decisions, 2026-08-07 (two of them): social sign-in becomes the
primary path, AND classic email + password sign-up returns as a full
option — an explicit reversal of the old no-passwords rule, recorded in
DECISIONS.md. The 6-digit email code stays as the passwordless option
(the Yahoo deliverability failure is the standing proof that one path
is not enough). This file is the setup guide — the parts only Ameen can
do, then the parts Claude does.

The auth screen's final shape, top to bottom: **Continue with Google**
(hero) → **Sign up / Sign in with email** (email-or-username +
password) → **Email me a code instead** (existing OTP) — with Apple
joining at Stage 4B.

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
       **If Google rejects the app name** ("does not comply with Google's
       requirements"): the name must not look like a URL (`trywazn.app`
       fails — use `Wazn`), must avoid mixed scripts / emoji / the Arabic
       وزن for this field, and if bare `Wazn` still fails, `Wazn Fitness`
       clears the brand-similarity check. Pick the support email from the
       dropdown rather than typing it, and leave the logo EMPTY — a logo
       triggers Google's full verification review prematurely.
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

## Email + password (2026-08-07, explicit owner reversal)

Classic account creation returns: `signUp({ email, password })`,
sign-in with `signInWithPassword`. Supabase supports it natively next
to OTP and OAuth — no migration, existing accounts unaffected (an OTP
user can add a password later via the recovery flow). The guardrails
that come with the reversal:

- **Password floor:** minimum length 8 in Supabase Auth settings, and
  enable leaked-password protection if our tier offers it. No
  composition theater (mandatory symbols etc.) — length + leak check
  beats complexity rules.
- **Recovery is code-based, not link-based.** "Never a magic link"
  survives the reversal: password reset sends a 6-digit code
  (`resetPasswordForEmail` + `verifyOtp type:'recovery'` +
  `updateUser`), reusing the same template discipline — the recovery
  template in `supabase/email_templates/` must carry `{{ .Token }}`.
- **Email confirmation on password sign-up** stays on, so a typo'd
  address can't anchor an account (the dot incident's cousin).
- **One account, many methods:** password, Google, and code sign-ins
  with the same verified email land in the same account (Supabase
  links identities by verified email). Test this explicitly.

## Username as a sign-in alias (all non-social paths)

- **Username is an alias, not an anchor.** Every account is anchored
  by an email (or Google/Apple identity); the user picks their
  username at sign-up (the `profiles.username` column and its
  uniqueness rules already exist for social). The sign-in field
  accepts **email or username**, for both the password form and the
  code flow.
- A username entry resolves to the account's email **server-side**
  (an Edge Function or security-definer RPC — the client must never
  read another account's email). For the code flow the address is
  rendered only masked ("code sent to a•••@gmail.com").
- **Enumeration guard:** identical response whether the username
  exists or not — same no-oracle principle `src/lib/social.ts` already
  applies to follows. Rate-limit lookups like any auth endpoint.
  (Password sign-in with a wrong username fails exactly like a wrong
  password — "invalid credentials", never "no such user".)
- **Username choice moves into onboarding** (Welcome screen) instead
  of being buried in Friends → You, since it is now part of identity,
  not just social. Existing users without a username keep signing in
  by email until they pick one.

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
