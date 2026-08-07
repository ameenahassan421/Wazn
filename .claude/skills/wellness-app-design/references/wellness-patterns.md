# Health & wellness patterns — the layer around the tracker

Roadmap-level and ecosystem-level knowledge for health & wellness apps.
Read this for strategy, retention, localization, accessibility, and
trust/privacy work — anything wider than a single screen.

## 1. Onboarding and cold start

- **Time-to-first-logged-value is the north-star onboarding metric.**
  Every screen before the first logged set/meal/session raises abandon
  rate. Auth, then straight into the core action; profile-building can
  wait or be inferred.
- **Import is onboarding.** For switchers, importing competitor history
  (CSV) transplants their sunk cost and their previous-session ghosts —
  the strongest possible first session. Make import a first-run offer,
  not a buried setting.
- **Cold-start content**: users without a plan need starter
  routines/programs; users with one need to enter it fast. Detect which
  by asking one question, not six.
- OTP/passwordless auth suits this space (phone-first users, no
  password under gym conditions) — but email deliverability becomes an
  auth dependency: monitor bounce/latency per provider domain, offer a
  resend path, and never let a silent mail failure read as user error.

## 2. Habit formation (honest gamification)

- The loop that works: **cue** (scheduled session, notification opt-in)
  → **action** (logging, made trivially cheap) → **variable reward**
  (PRs, beating the ghost, visible trend) → **investment** (history,
  streaks, routines, social graph — each raises switching cost
  ethically, via value, not lock-in).
- Weekly-frequency streaks > daily streaks for fitness (recovery days
  are part of the sport). Freeze/grace tokens acknowledge real life.
- Milestones should map to the sport's own meaning (first 100kg squat,
  50th session, a year of training) rather than abstract XP. Badges
  disconnected from effort read as childish to the core audience.
- **Progress visualization is the product** for week-4+ retention:
  trends must be honest (no y-axis torture), warm (celebrate plateaus
  broken), and glanceable (one headline insight beats twelve charts).

## 3. Notifications and re-engagement ethics

- Every notification must serve the _user's_ stated goal, not DAU:
  rest-timer done (yes), routine-scheduled reminder they opted into
  (yes), friend PR (opt-in), "we miss you" guilt (no).
- Ask for notification permission _in context_ (first rest timer), never
  on first launch.
- Respect quiet hours and religious/cultural rhythms (see §5).

## 4. Body data, safety, and scope discipline

- **Weight/body-composition UI is a safety surface.** No judgmental
  copy, no red for weight gain, goals framed by the user not the app.
  Offer units and precision that match scales people own.
- **Stay a logbook unless you are ready to be a coach.** Prescriptive
  advice (deload now, eat X calories) carries responsibility; served
  statistically it's defensible ("your weekly chest sets are below the
  10–20 productive band"), served as authority it needs disclaimers and
  restraint. AI-generated guidance must be labeled, non-medical, never
  auto-applied, and never on the critical path.
- Injury-adjacent features (pain tracking, rehab) are a different
  regulatory category — do not drift into them casually.

## 5. Localization and cultural fit

- **RTL is a build-time decision**: CSS logical properties from the first
  commit make Arabic/Hebrew a flip; retrofitting is a rewrite. Numbers
  in weights typically stay Latin digits even in Arabic UI; prose may
  use Arabic-Indic. Fonts need a same-family Arabic cut to keep the
  brand voice.
- **Local units, local money, local rails**: kg defaults by region;
  price in local currency at local purchasing power; support the
  payment methods people actually hold (e.g. mobile wallets and
  cash-adjacent rails in Egypt — card-only checkout is a paywall in
  itself).
- **Calendar-aware behavior**: Ramadan shifts training to night/suhoor
  hours and reduces frequency — streaks, "morning person" assumptions,
  and reminder defaults must accommodate it natively, not as an
  afterthought. Same for local weekends (Fri/Sat) in week-based stats.
- Exercise naming is bilingual reality: lifters worldwide mix English
  exercise names into local speech — offer localized names alongside,
  not instead of, English; make search accept both.

## 6. Accessibility

- The gym is a situational-impairment generator: gloves, sweat, glare,
  one hand, noise (haptics > sound). Designing for it is designing for
  motor/vision accessibility — the overlap is nearly total.
- Non-negotiables: 48px targets, AA contrast, reduced-motion support,
  screen-reader labels on icon-only controls, no color-only meaning
  (set types get letters, not just hues), text scaling that doesn't
  break the set table.

## 7. Trust, privacy, and data stewardship

- Health data is intimate. The bar: collect only what the features use,
  say so in a human-readable policy, encrypt in transit and at rest,
  scope every read/write server-side (RLS or equivalent — never
  client-enforced visibility), default social sharing to private/opt-in.
- **Export and deletion are trust features**, not compliance chores;
  both should be self-serve.
- Third-party processors (email, AI inference, analytics) must be named
  in the policy; AI prompts should carry stats, never identity (no
  emails/names/user ids to model APIs).
- Store-review reality: privacy policy URL, data-safety forms, and
  account-deletion-in-app are hard requirements for Play/App Store.

## 8. Business model patterns

- Freemium with a **free core loop** is the proven shape: free =
  unlimited logging + basic history; Pro = advanced analytics,
  unlimited routines, body metrics, no ads, API. Conversion in fitness
  runs 2–5%; price to local purchasing power.
- Ads, if any: post-workout interstitial max 1/session + user-initiated
  rewarded video for temporary Pro unlocks. Anything more trades
  retention (the whole business) for cents.
- The moat order: data gravity (history) → habit → social graph →
  brand. Features copy easily; a user's 300 logged workouts don't.

## 9. Platform strategy (PWA vs native)

- A PWA delivers the core loop (install, offline cache, wake lock,
  share) with zero store tax and instant deploys — right first platform
  for a solo builder.
- The native wrapper (Capacitor-class) becomes worth it for: reliable
  local notifications (rest timer with screen off — the #1 PWA gap on
  iOS), health-platform sync, widgets/watch, store discoverability, and
  native ad SDKs. Sequence it after product-market signal, not before.
- Keep one codebase; the wrapper adds capabilities, never a fork.
