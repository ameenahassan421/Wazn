# Anatomy of a Hevy-class workout tracker

How the market leader in casual-lifter tracking looks and operates,
screen by screen. Use this as the parity checklist when analyzing gaps or
designing an equivalent screen. "Hevy-class" here means the shared grammar
of Hevy and Strong — seven-plus years of convergent evolution around the
same job. Where Hevy has a specific signature behavior it is called out.
Treat details as the genre's expectations, not a spec to clone; visual
styling especially must come from your own product's design system.

## Table of contents

1. App structure and navigation
2. The active workout screen (the heart)
3. Set rows in detail
4. Rest timer
5. Exercise library and detail
6. Routines and templates
7. History and the workout detail view
8. Analytics / progress
9. Profile, measurements, and settings
10. Social layer
11. Platform integrations
12. What makes it _feel_ polished (the intangibles)

---

## 1. App structure and navigation

- **Five-tab bottom bar**: Home (social feed), Routines, **Workout**
  (center, visually primary — the start button), Exercises, Profile.
  The center tab is the core job; social gets the default/first tab
  because retention is the business.
- **Persistent in-progress banner.** Once a workout starts, a slim bar
  (elapsed time + "Resume") docks above the tab bar on _every_ screen.
  You can browse the feed mid-rest; the workout is always one tap back.
  This is load-bearing: it makes the workout a _mode_, not a page.
- Navigation is shallow: no screen on the core loop is more than two
  levels deep. Settings and rarely-used surfaces hide behind Profile.

## 2. The active workout screen

- **Header**: elapsed duration ticking live, workout name (editable),
  a Finish button (top end corner — deliberately _out_ of thumb reach so
  it is never hit accidentally), and an overflow menu (discard, settings).
- **Body**: a vertical list of exercise blocks. Each block: exercise
  thumbnail + name (tappable → detail), a per-exercise overflow menu
  (replace exercise, reorder, add note, superset, remove, set-type help,
  bar type / weight-unit override), an optional pinned exercise note, a
  column-headered set table (Set · Previous · kg · Reps · ✓), and an
  **"+ Add Set"** row.
- **Footer actions**: "+ Add Exercise", "Cancel Workout". Adding an
  exercise pushes the library as a picker with multi-select — you can add
  three exercises in one visit.
- **Reordering**: long-press drag on exercise blocks.
- **Notes at three levels**: workout note, per-exercise note (pinnable so
  it reappears every session — "seat position 4"), and Hevy Pro adds
  per-set notes. The pinned exercise note is the sleeper feature
  coaches praise.
- **Keyboard behavior**: numeric pad with a custom accessory bar
  (next-field arrows, plate calculator shortcut, dismiss). Focus
  auto-advances weight → reps → next set.

## 3. Set rows in detail

The set row is the most-touched UI in the product. Its grammar:

- **Columns**: set number/type · previous session's value (ghosted,
  e.g. "60kg × 8") · weight input · reps input · completion check.
- **Pre-fill**: inputs start populated from the previous session (or the
  routine's targets). Logging a repeat set = tap the checkmark. That's
  the 1-tap set.
- **The checkmark is the commit.** Tapping it marks the set done, turns
  the row's state (colored fill/highlight), fires the rest timer, and
  advances focus. Un-checking reopens it. There is no separate save.
- **Set types**: tap the set number to cycle/select Warm-up (W),
  Normal, Failure (F), Drop set (D). Warm-ups are excluded from volume
  records and PRs. Type is shown _in place of_ the number, color-coded.
- **RPE / RIR**: optional per-set, entered via a small selector on the
  row; can be enabled per-exercise or globally. Off by default —
  casuals never see it.
- **Previous-as-target**: tapping the ghosted previous value copies it
  into the inputs. Cheap, discoverable, beloved.
- **PR detection is instant**: completing a set that beats a record shows
  an inline badge on the row (trophy) at commit time, not at finish time.
- **Input steppers**: weight fields support increment/decrement by a
  configurable step (per-exercise bar/plate config); reps likewise. The
  numeric keyboard remains the primary path; steppers serve one-handed use.

## 4. Rest timer

- **Auto-starts on set completion**, using a per-exercise default
  duration (configurable; routine can carry its own).
- **Lives in the fixed footer/edge of the workout screen** as a compact
  countdown; expands on tap to a full-screen ring with +15s / −15s and
  Skip. Never a modal you must dismiss.
- **Survives navigation and lock**: continues across tabs and screen
  lock; fires a local notification + haptic + optional sound when the
  phone is locked. (Hevy's timer notification, with actionable +15s
  buttons on the lock screen, is repeatedly cited in reviews as why
  people stay.)
- Duration ticks _down_; the elapsed workout clock ticks _up_; they are
  visually distinct so neither is misread as the other.

## 5. Exercise library and detail

- **Scale**: 400+ exercises, each with a short looping video or
  illustrated animation, equipment tag, primary + secondary muscle
  groups, and step-by-step instructions.
- **Picker ergonomics**: search-as-you-type; filter chips by equipment
  and muscle group; sort defaults to "recent/frequent first" for
  returning users, alphabetical for browsing; multi-select with a
  running count; "recently used" section on top; custom exercises
  inline with the catalog, marked as yours.
- **Superset creation from the picker**: select multiple, choose
  "superset" — grouped visually by a shared color band in the workout.
- **Exercise detail page** (reachable from picker, workout, or history):
  - About: media, muscles (diagram highlighting primary/secondary),
    instructions.
  - **History**: every past session of this exercise, newest first.
  - **Charts**: heaviest weight, est. 1RM, total volume, max reps over
    time.
  - **Records**: best weight × reps table (rep-max ladder: best 1-rep,
    best 5-rep, etc.), lifetime volume, session count.
- **Custom exercises**: name, equipment, muscle groups, exercise type
  (weight×reps, reps-only, duration, distance — cardio and calisthenics
  fit), optional photo. Private to the account.

## 6. Routines and templates

- Routines are first-class: foldered, reorderable, duplicable,
  shareable via link (recipient imports a copy).
- **Start-from-routine pre-fills the whole workout** with target sets ×
  reps × last-time weights; freestyle deviation is always allowed
  (add/swap/remove mid-workout without corrupting the template —
  the app asks at finish whether to update the routine with changes).
- Free tier caps routine count; unlimited is a Pro anchor.
- Discoverable programs: sample routines / program content for
  cold-start users who don't arrive with a split in mind.

## 7. History and the workout detail view

- **History tab shows a card per workout**: title, relative date,
  duration, total volume, PR count, and the exercise list summarized
  ("Bench Press 5×", "Squat 4×") with thumbnails.
- **Calendar view**: a month grid with dots on training days — the
  at-a-glance consistency picture. Streak-adjacent without being a
  guilt mechanic.
- **Workout detail**: full set-by-set record, per-exercise, with PR
  badges preserved; edit (full re-open into the logging UI), duplicate
  ("repeat this workout"), share, delete.
- Editing past workouts uses the _same_ editor as live logging — one
  grammar, no separate CRUD screens.

## 8. Analytics / progress

- Headline dashboard: workouts per week (bar chart vs a goal line),
  streak, total volume trend.
- **Muscle-group distribution**: weekly sets per muscle group, often
  against a recommended band — answers "am I neglecting legs".
- Per-exercise strength charts live on the exercise detail (see §5);
  the dashboard links to "top exercises".
- Time-range selector everywhere: 3M / 6M / 1Y / All.
- Deeper analytics (rep-range distribution, body-part balance over
  time) are Pro-gated — analytics is the classic fitness Pro anchor
  because it monetizes the most engaged users without touching logging.

## 9. Profile, measurements, and settings

- Profile: avatar, username, bio, workout count, follower/following
  counts, the calendar heatmap, and pinned stats.
- **Body measurements**: bodyweight, body fat %, per-site tape measures
  (chest, arms, waist...), progress photos, each charted over time.
  Weight syncs with HealthKit/Google Fit where available.
- Settings that matter: units (kg/lb, per-measurement), first day of
  week, default rest timer, timer sound/vibration choices, RPE on/off,
  theme, language, data export (CSV), account deletion.

## 10. Social layer

- **Feed of followed users' finished workouts**: card = user, title,
  duration, volume, PRs, exercise summary; like + comment.
- Follows are asymmetric (follow ≠ friend); profiles can be private.
- Workout share card: a rendered image (stats + branding) for
  Instagram-class sharing — the organic growth surface.
- Leagues/leaderboards are _not_ core Hevy — a differentiator gap a
  competitor can take (weekly volume/session leaderboards among
  follows).

## 11. Platform integrations

- Apple Watch / Wear OS companion (log sets from the wrist, timer on
  the wrist), HealthKit / Health Connect workout write, live
  notifications (iOS Live Activities / Android ongoing notification
  showing timer + current exercise), home-screen widgets (streak, quick
  start), Siri/Assistant shortcuts. These are the native moat — the
  hardest part for a PWA to match, and the reason a store wrapper
  eventually matters.

## 12. What makes it _feel_ polished

Parity lists miss these; they are most of the perceived gap:

- **Optimistic everything**: every action commits locally and syncs in
  the background; the UI never waits on a network round-trip mid-workout.
- **Zero dead ends**: every empty state teaches the next action
  ("No routines yet → Create one / Browse examples").
- **Motion that answers questions**: checkmark micro-bounce = "it saved";
  timer ring depletion = "how long left"; nothing animates decoratively.
- **Numbers formatted like a spreadsheet**: aligned, tabular, consistent
  precision (60 kg, not 60.0 kg; 2.5 increments honored).
- **Undo, not confirm**: destructive actions (delete set, remove
  exercise) execute immediately with a brief undo affordance instead of
  "Are you sure?" modals — confirmation dialogs are for account-level
  destruction only.
- **Latency discipline**: tab switches and picker open feel instant
  (<100ms perceived); heavy surfaces (charts) load skeletons, never
  block navigation.
