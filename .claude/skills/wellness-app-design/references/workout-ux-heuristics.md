# Workout UX heuristics — interaction rules for people under load

Rules for designing and critiquing individual flows and components in a
workout tracker. Each rule states _why_, because the why is what lets you
apply it to a screen this file never anticipated.

## 1. Input mechanics

- **Pre-fill or die.** The single biggest determinant of logging speed is
  whether weight/reps arrive pre-populated (previous session, routine
  target). Typing is the fallback, never the default. Measure the modal
  case: "same as last time" must be one tap.
- **Numeric fields are appliances.** Full-width tap targets (≥48px, hot
  path 56px+), numeric keyboard with decimal, select-all-on-focus so
  typing replaces rather than appends, auto-advance focus in the order
  people think (weight → reps → commit). A misplaced cursor mid-set is a
  rage moment.
- **Steppers complement, never replace, the keyboard.** ± buttons at the
  plate increment (2.5kg default, configurable per exercise) serve the
  one-handed case; direct entry serves the "jumping from 60 to 80" case.
- **Commit must be explicit and cheap.** One checkmark/button per set,
  in thumb reach, with instant visual state change. Auto-save-on-blur
  feels efficient but destroys trust — lifters want to _know_ the set is
  in.
- **Never make the user do arithmetic.** Plate breakdown (what to load
  per side), warm-up ramps (%s of working weight), unit conversion,
  e1RM — all computed, all one glance away from the set row, none
  interrupting it.

## 2. Time and timers

- Rest timer **auto-starts on commit** — starting a timer manually is a
  task nobody remembers under fatigue. Manual start is the override, not
  the default.
- The countdown must be **visible from the logging screen without
  interaction** and adjustable in ±15s nudges. Full-screen timer is an
  expansion, not the home.
- **Completion must reach a pocketed phone.** Haptic + local notification
  when locked. In-app, completion is passive (ring state change, subtle
  cue) — never a modal. A silent-by-design timer needs at minimum a
  vibration path or it fails the pocket test.
- Elapsed-workout time ticks up in the header from first set, not from
  app-open; auto-discard-prompt abandoned sessions (an 8-hour "workout"
  is data corruption).

## 3. Feedback and celebration

- **Celebrate at commit, inline, small.** PR badge on the row the moment
  the set beats a record. Big celebration belongs on the finish summary
  — the one screen where the user has attention to spend.
- **Milestones compound on the summary**: PRs hit, volume vs. last time,
  streak status. The summary is also the natural share surface and the
  only acceptable ad slot in an ad-supported tracker (after value
  delivery, never before or during).
- Failure states speak the product's language and offer an action
  ("Too long to finish — try fewer days"), never a stack trace or a
  shrug ("something went wrong").

## 4. Reliability is a feature (the trust ladder)

Perceived quality in this genre is mostly _trust that data survives_:

1. **In-progress workout persists** across refresh/lock/crash (local
   storage checkpoint on every commit, restored on open).
2. **Optimistic writes**: UI commits instantly, network syncs behind; a
   failed sync retries silently and only surfaces after repeated failure.
3. **Offline logging**: full workout with zero signal, queued, synced on
   reconnect; conflict rule stated and simple (device wins for own data).
4. **Export exists.** Users who know they can leave, stay.

Wake-lock during an active workout (screen dimming mid-set forces
re-auth-by-face fumbling) is part of this ladder.

## 5. Retention mechanics that actually work

- **The previous-session ghost is the retention engine.** Seeing "last
  time: 60×8" on every row turns every workout into a game against
  yourself. It costs one query and outperforms every gamification layer.
- **PRs and records ladders** (best weight, best e1RM, best per rep
  count) give intermediate lifters wins long after newbie gains end.
- **Streaks measure consistency, not perfection.** Week-based streaks
  (≥N sessions/week) survive life better than day-based; a streak
  mechanic that a sick week destroys teaches users the app punishes
  them. Culturally-aware exceptions (e.g. Ramadan schedule shifts)
  belong in the rule, not as an apology.
- **Social proof is a multiplier, not a foundation** — a feed only
  retains people who already have the habit; ship it after the loop is
  solid, to users who have friends on it. Likes suffice; comments add
  moderation burden before they add value.
- **Never guilt.** Notifications that shame ("You missed leg day 😔")
  measurably increase churn. The app is a logbook that celebrates, not
  a coach that scolds.

## 6. Information architecture

- **Three levels max** on the core loop: tab → screen → detail. If a
  set-logging action needs a third level, redesign.
- **One editor grammar.** Live logging, editing a past workout, and
  building a routine should be the same component with different
  persistence — divergent editors double bugs and confuse muscle memory.
- **Progressive disclosure for advanced lifters**: RPE, set types, bar
  types, per-exercise rest exist but hide until enabled/needed. The
  casual's screen stays clean; the powerlifter finds their tools.
- **Settings is a warehouse, not a junk drawer**: units, timer defaults,
  RPE toggle, data export, account. If a setting is reached mid-workout
  (rest duration), it must _also_ be adjustable in-flow.

## 7. Visual grammar for gym legibility

- Numbers: large (≥24px on hot path), `tabular-nums`, consistent
  precision, unit labels lighter than values.
- Contrast: assume glare and cheap screens — WCAG AA minimum, target
  AAA on the set row. Dark themes suit gyms (dim rooms, OLED battery)
  but must keep 4.5:1+ on inputs.
- Color is semantic and scarce: one accent for interactive/brand, set-type
  colors if any are the _only_ other hues. A rainbow UI is unreadable at
  arm's length.
- Touch targets ≥48px everywhere; ≥56px for set commit and timer
  controls. Spacing between destructive and constructive actions.
- Respect `prefers-reduced-motion`; keep all animation under 200ms on
  the hot path.

## 8. Anti-patterns (things reference apps do that you should refuse)

- **Paywalling the log.** Charging for logging itself caps growth and
  poisons reviews; monetize insight, convenience, and identity
  (analytics, unlimited routines, body metrics, no-ads).
- **Interstitials anywhere near the loop.** Post-summary only, ever.
- **Confirmation-modal addiction.** Undo beats "Are you sure?".
- **Feature-first onboarding tours.** Nobody remembers a 6-screen
  carousel; teach in context with empty states and first-run hints.
- **Streak guilt and notification spam** (see §5).
- **Cloud-first writes** that make a set commit wait on a spinner.
- **Copying the leader's visual skin.** Parity is behavioral; a clone's
  look reads as cheap and forfeits the brand.
