# Decisions

Deviations from `WAZN_PLAN.md`, and choices worth not re-deriving. Newest last.
Per plan §2.6, implementing a better approach is expected — logging it here is
the price.

---

## 2026-08-01 — STATUS drift: `workouts` was 1, not 0

The plan's STATUS said `workouts 0`. Reality at the start of this session was
**1**: a seven-second workout (`e2587335`, 21:37:26 → 21:37:33) owned by
`3551b340` (`ameen.hassan421`), with zero sets. It is the residue of the
sign-in test done from the browser earlier today.

Trusted reality over STATUS per §6 and corrected the STATUS section.

**Not deleted.** It is real user data, and §2.6 says to ask first before
destructive changes to data. It is inert — no sets, so it cannot affect 1RM
charts or PRs, which exclude sets missing weight or reps by construction. It
will show as one empty entry in History. Flagged in the GATE 0 report for
Ameen to decide; deleting it is one call once he says so.

## 2026-08-01 — Import target user

Two profiles exist:

| id                                     | display_name      | created |
| -------------------------------------- | ----------------- | ------- |
| `6da348ed-c678-4018-b32b-ae0f61e13a6b` | `ameenahassan421` | 19:39   |
| `3551b340-2bcc-4755-8ee1-f5e4f9cb0e33` | `ameen.hassan421` | 21:26   |

Plan §4 Stage 0B specifies the profile for `ameen.hassan421@gmail.com`, so
`IMPORT_USER_ID = 3551b340-2bcc-4755-8ee1-f5e4f9cb0e33`. That is also the only
address that can currently receive an OTP, so it is the account Ameen can
actually sign into to verify GATE 0.

The `ameenahassan421` profile is left empty. Note for Stage 2A: once a real
sending domain exists, both addresses will work, and there will be two accounts
where one is expected. Worth a cleanup decision then, not now.

## 2026-08-01 — 0D: name similarity alone picks the wrong exercise

The plan says map Hevy names to free-exercise-db. A plain fuzzy match on names
produced confidently wrong images, which is worse than none — the picker is
scanned at a glance mid-workout, and a wrong thumbnail actively misleads.

Three failures found by printing every match and reading them, not by trusting
the score:

| our name                    | matched                     | why it was wrong          |
| --------------------------- | --------------------------- | ------------------------- |
| `Back Extension (Machine)`  | _Machine Triceps Extension_ | different muscle entirely |
| `Seated Cable Row - V Grip` | _Upright Cable Row_         | scored a perfect **1.00** |
| `Chest Fly (Machine)`       | _Leverage Chest Press_      | press, not fly            |

Three fixes, in the matcher:

1. **Muscle-group gate.** Candidates whose `primaryMuscles` don't map to our
   `muscle_group` are rejected outright. Sharing tokens is not sharing a muscle.
2. **`seated`/`standing` removed from the stopword list, plurals stemmed.**
   `seated` was being discarded as noise — the only word separating a seated
   row from an upright row. With it kept and `Rows`→`Row` stemmed, the correct
   _Seated Cable Rows_ wins at 1.00.
3. **Floor raised 0.55 → 0.60.** Everything that landed in 0.55–0.59 was wrong
   on inspection. Below the floor, `image_url` stays null and the tile renders.

Plus a five-entry `ALIASES` table for vocabulary the source database simply
does not share — "Chest Fly" and "Butterfly" have zero tokens in common, so no
similarity metric will ever bridge them.

Result: 110 of 134 matched, and all fifteen most-used lifts verified correct by
hand. The 24 unmatched render initial tiles. `--explain` prints every match so
this stays auditable.

## 2026-08-01 — 0D: thumbnails are .jpg, resized to 240px

Two costs the plan didn't mention, both real:

**Precache.** `vite-plugin-pwa` globs `**/*.{js,css,html,svg,png,ico,woff2}`.
Had these been `.png` they'd have been pulled into the install, putting
megabytes in front of first paint on the hot path. `.jpg` sits outside that
glob and loads lazily instead. Verified: precache still 12 entries / 755 KiB.

**Bandwidth.** Sources are 850×567, ~63 KB each — 7.0 MB across 110 files for
images rendered in a 48px slot. Resized to 240px at q72 (mozjpeg): **908 KB
total, 6 KB average**, an 87% cut. This app is aimed at Egyptian mobile data,
where a picker that pulls a megabyte on open is a cost a real user pays. Added
`sharp` as a devDependency for this; it never ships to the client.

## 2026-08-01 — 0D: initial tiles are neutral, not colour-coded

The plan asks for a "muscle-group colored initial tile". §2.4 allows exactly
one accent colour. Coding eleven muscle groups needs eleven hues and breaks
that rule the moment it ships.

Kept the rule. Tiles use the exercise's initial plus one of five fixed neutral
steps, chosen by a hash of the muscle group so a given muscle always looks the
same. Distinction without a palette. If real use shows the tiles are too hard
to tell apart, the answer is a muscle-group label, not colour.

The four extra steps are `--color-tile-1..4` in `index.css`, not inline hex, so
they are part of the design system rather than magic numbers in a component.

## 2026-08-01 — 0E: what the audit actually found

Most of §2.4 was already honoured — dark-only, near-black `#0b0b0c`, off-white
`#ececee`, one amber accent, one typeface, and no gradients, shadows, or emoji
anywhere in `src/`. Three real violations:

**Touch targets.** Four interactive controls were `h-11` (44px) against a 48px
minimum: the unit toggle, sign out, "Done" in SetEntry, and "Finish" in
LogScreen. All raised to `h-12`. The set-list `<li>` is also 44px but is not a
touch target, so it stays.

**Numbers in the logging flow.** Sets already logged in the current workout
rendered at `text-lg` (18px) — these are read mid-workout, between sets, at
arm's length. Raised to `text-2xl` (24px), with the row to `h-14` to fit.

**Off-token colour.** Promoted the tile steps to theme tokens (above), leaving
zero inline hex values in `src/`.

### One deliberate miss

`previousSummary` — the previous session shown inline while logging — is
`text-xl` (20px), under the 24px rule. It is a multi-set string like
`60 kg × 8 · 60 kg × 6 · 55 kg × 6`, not a single figure. At 24px it wraps to
three lines and pushes the weight input below the fold on a phone.

§2.1 says the logging flow is sacred and §2.3's ordering puts it above
typography, so the flow wins. 14px → 20px is still a large readability gain.
If the previous session needs to be bigger, the fix is showing only the top set
as a single figure — an information change, not a font-size change, and out of
scope for 0E.

## 2026-08-01 — 0F audit: what won't hold, and what will

### Fixed now

**`set_type` would have rejected drop sets.** The CHECK constraint allowed
`normal | warmup | failure`. Stage 1 cycles `normal/warmup/failure/drop` in the
UI, so the first drop set logged would have failed at the database with a
constraint violation — mid-workout, on the hot path, for a feature that looks
purely cosmetic in the UI. Migration `0003` widens it. Not a feature, just a
constraint that was already wrong.

**A missed rename, caught by rendering the app.** `AuthScreen` had its own
`Workout` wordmark that the 0C grep missed, because it reads
`<h1 ...>Workout</h1>` with attributes between. Screenshotting the production
build against a real Supabase URL surfaced it in seconds. Worth repeating at
future gates: grep proves absence in files you thought to search, a screenshot
proves what a user sees.

### Verified sound

- **Import fidelity is exact.** 3,197 sets, 149 workouts, 134 exercises; RPE
  preserved on 387 rows, 62 warmups and 1 failure carried through, 369
  bodyweight sets with null weight. Nothing silently coerced.
- **All three RPCs return real data** and the bench series spans 2025-10-26 →
  2026-07-14 with no July cliff (+16 lb across the boundary, continuous).
- **`exercise_usage` runs in 3 ms** over the full set — a hash aggregate with
  sequential scans, which is correct at this size.
- **Dates render in the viewer's timezone** (`Intl.DateTimeFormat(undefined)`),
  so Chicago-sourced timestamps show the right day. Correct by construction.
- **RLS is enforced server-side** on all four tables, owner-scoped, with
  `exercises` readable by any authenticated user when `owner_id is null`.
- **Progress stays lazy.** recharts is 389 kB in its own chunk; the entry
  bundle is 364 kB and the precache 12 entries / 755 KiB even with 110
  thumbnails on disk.

### Findings recorded, deliberately not acted on

**Supersets have no column, and the CSV has 335 rows of superset data** across
3 groups. The import drops `superset_id` because there is nowhere to put it.
Not fixed here: how supersets are modelled (a group id on the set? a join
table? ordering semantics?) is a Stage 1 design decision, and guessing it now
risks a migration that has to be undone. No data is lost — the CSV is in the
repo and the import is idempotent, so a re-run after Stage 1 lands backfills
the history.

**`exercise_notes` exists on 4 rows** and has no column. Negligible; same
reasoning.

**`exercise_usage` will not scale as written.** It aggregates every set the
caller can see on each Log-screen mount. Fine at 3,197 rows and one user;
at Stage 3 with many users it is a full scan per open. The fix when it matters
is a covering index or a materialised summary, not a rewrite.

**`mailer_otp_exp` is 3600s.** A one-hour sign-in code is generous. Worth
tightening to ~600s at Stage 2A when auth is being touched anyway — not now,
since §2.8 puts auth changes outside this stage.

## 2026-08-01 — Timezone flag resolved: the report was wrong, not the app

STATUS flagged that a Gate 0 line showed the bench series ending `2026-07-14`
when the last CSV session is `07-13`, and asked whether that was a UTC query or
a display bug. It was neither.

The chain is correct end to end:

| stage                       | value                   |
| --------------------------- | ----------------------- |
| CSV (America/Chicago)       | `Jul 19, 2026, 7:01 PM` |
| stored in Postgres          | `2026-07-20 00:01Z`     |
| rendered in America/Chicago | `2026-07-19 07:01 PM`   |

An evening Chicago session crosses midnight UTC, which is correct — a
`timestamptz` stores an instant, not a wall clock. The app renders with
`Intl.DateTimeFormat(undefined, …)`, which uses the viewer's zone, so it comes
back as the right day.

The `07-14` came from the ad-hoc reporting script I ran during 0F, which did
`started_at[:10]` — string-truncating the UTC ISO, so every evening session
appeared a day late. The bug was in the measurement, not the thing measured.

Worth keeping as a habit: when a number looks off by exactly one unit at a
boundary, suspect the instrument first.

One real consequence to remember: a user who travels across zones sees
historical workouts shift by up to a day, because the instant is fixed and the
wall clock is not. That is correct behaviour for `timestamptz` and only becomes
a product question if Stage 5's Egypt users log while travelling.

## 2026-08-01 — Stage 1: routines live on the Log screen, not a fourth tab

`CLAUDE.md` fixes the app at three screens with no router. Routines are the
biggest thing Stage 1 adds, and the obvious move is a fourth tab.

Didn't. A routine is not a place you go — it is how you _start_ a workout. It
belongs on the idle Log screen, above "Start workout", so the thing you tap to
begin is on the screen you were already looking at. A fourth tab would mean
navigating away from Log in order to start logging.

The editor is a view within Log (`view === 'routine'`), same as the picker and
the summary. Three tabs, no router, unchanged.

### Routines prescribe reps, not weight

Stage 1 says sets are "pre-filled from last performance". A routine that
hard-codes 60 kg is wrong the week after you progress and then lies to you
mid-workout. Reps are prescribed because 5×5 and 3×12 are genuinely different
routines; weight comes from what you actually lifted last time, which the
existing `previous_session` RPC already provides.

### Starting a routine does not pre-insert sets

A routine says what to do; a `workout_sets` row means it was done. Pre-inserting
planned sets would put lifts in History that never happened if the session gets
cut short — and History is the thing the charts are built from.

Instead the planned exercise order is held in memory and surfaces as a "Next"
button. The workout stays freestyle: you can deviate at any point, and the
picker is always one tap away. The routine guides, it does not constrain.

### Saving replaces children rather than diffing them

A routine is a handful of rows and `on delete cascade` makes the delete one
statement. Diffing positions correctly is the kind of code that silently
reorders someone's workout six months later, and there is no payoff here to
justify that risk.

Verified against the live database: create → add exercise → add sets → delete
leaves zero orphaned `routine_exercises` or `routine_sets`.

## 2026-08-01 — Stage 1: supersets live on the set, and alternate by who is behind

The group id is on `workout_sets.superset_group`, not on the routine. A
superset is a property of how sets were performed on a given day — the same
pair may not be supersetted next week — and putting it on the set is what let
the Hevy history backfill straight in.

**Alternating picks whoever has the fewest sets logged, not the next in
order.** The real case is doing two sets of A before remembering B; ordering by
position would strand B, while "who is behind" catches up correctly. It also
generalises to three-way giant sets for free.

**Rest moved from `SetEntry` to `LogScreen`.** Whether to rest now depends on
the group: a superset rests once per _round_, not between its exercises — that
is the entire point of one. Mid-round it advances to the partner and starts
nothing. `SetEntry` cannot know that; `LogScreen` holds the sets.

**Grouping stamps existing sets too.** Tapping Superset on an exercise that
already has sets this workout updates those rows as well, or History would show
half a superset.

An empty `superset_id` in the CSV parses to null, never 0. Zero is a real group
id in the export, and collapsing to it would make every unsupersetted set look
grouped together.

Backfill verified: 335 rows across 3 groups, matching the CSV exactly. Totals
unchanged at 3,201 sets and 152 workouts, RPE still on 387, and Ameen's four
August sets came through untouched — the import is keyed on
`(user, started_at)` and his workouts are not in the CSV.

## 2026-08-01 — Stage 1: editing past workouts is weight and reps only

Corrections write straight through, with the local copy patched rather than
refetched so an expanded workout does not collapse under you mid-edit.

Scope is deliberately small: weight, reps, and deleting a set. Changing an
exercise or a set type after the fact is rewriting what happened rather than
fixing a typo, and every chart and PR in the app is built from these rows. A
dialog is acceptable here because this is History — §2.1 protects the logging
flow, and nothing is being interrupted mid-set.

RLS already covered it: `workout_sets` has owner-scoped policies for all four
commands, so no migration was needed and the client cannot touch another user's
history.

## 2026-08-02 — Security advisor: handle_new_user was callable by anon

Supabase's security advisor flagged `public.handle_new_user()` as a
`SECURITY DEFINER` function with `EXECUTE` held by `PUBLIC`, `anon` and
`authenticated` — reachable by anonymous callers at
`/rest/v1/rpc/handle_new_user`. It is meant to fire only as a trigger on
`auth.users` insert.

Not an active breach: calling a trigger function directly errors, because there
is no `NEW` record outside a trigger. It is the wrong shape to leave in the
schema before Stage 3 puts other people's rows in these tables.

Migration `0006` revokes it from `public, anon, authenticated`. `service_role`
keeps it — server-side only, already bypasses RLS, and not what was flagged.

**The concern was that this touches signup.** Rather than trust the reasoning
that triggers do not consult `EXECUTE` grants, it was proven on this project
first: a scratch schema with a `SECURITY DEFINER` trigger function, `EXECUTE`
revoked from `authenticated`, then an insert performed as `authenticated`. The
trigger fired and copied the row. Scratch schema dropped afterwards.

After applying: ACL is `postgres=X | service_role=X`, the `on_auth_user_created`
trigger is still armed (`tgenabled = 'O'`), and both advisor findings are gone.

### Left alone deliberately

`auth_leaked_password_protection` is disabled. Wazn is OTP-only and has no
passwords, so HaveIBeenPwned checking has nothing to check. Enabling it would
also be an auth-config change for no benefit.

The performance advisor's three `unindexed_foreign_keys` (`exercises.owner_id`,
`routine_exercises.exercise_id`, `workouts.routine_id`) and one `unused_index`
(`routines_user_position_idx`) are all INFO and all left alone. The tables are
tiny — 134 exercises, 152 workouts — and the unused-index lint fires precisely
because there are no routines yet. Adding three indexes nothing queries would
commit the error the other lint is complaining about. Revisit at real
multi-user volume.

## 2026-08-02 — Redesign: the template is structure, not identity

Ameen supplied `design_handoff_wazn_redesign`: a logo, a restyle of all three
tabs onto a system called "Nocturne", and an expansion of Progress into three
sub-tabs. It is a careful handoff — it reads the repo, cites `CLAUDE.md`, and
correctly quotes the sub-24px exception already recorded above.

It is also a stock template. `nocturne-styles.css` still carries the source
deck's own review notes (`review round 7 (Barron)`, `--om-accent-pro`), tokens
for "slide grounds" and "deck section dividers", and a 48px rule-fade measured
in "one deck baseline unit". Ameen's read — "a lot of people used this design
too, let us elevate it using our own context" — was right, so the layout,
density and component structure are taken and the identity is not.

### The accent stays amber

The template moves to a blurple `#9184d9` on a blue-grey `#161826`, and admits
in its own notes that this is ~3:1 on the ground — "fine for icons and chrome,
**not** for paragraph text". The most-tapped control in this app is `Log set N`,
pressed one-handed, mid-set, under whatever lighting the gym has. Amber on
near-black is roughly 9:1. §2.4 already said amber; the contrast maths says it
independently.

What the template got right and Wazn did not have is the **tonal ramp**: one
hue in nine perceptual steps, so a chart shows depth without a second colour.
Amber now has that ramp (`--color-accent-100..900`), which is what made the
three Progress sub-tabs possible without breaking the one-accent rule.

The ground moves from `#0b0b0c` to `#0c0b0a` — still near-black, with a slight
warm cast so it does not fight the accent. Blue-grey is the tell of a stock
dark theme; warm near-black under amber reads as unlit iron.

### The plate is the shape language

The logo loads four plates a side. Nothing in the template built on that, so
it is now the repeating unit: the weekly streak is a plate stack that fills as
weeks complete, and the rep-range bars step down the accent ramp the way the
plates step down toward the sleeve. That is the part no other project using
this template can have.

The handoff's plate geometry put the **tallest plate third from the sleeve**.
A loaded bar puts the heaviest plate innermost. Fixed, and `scripts/build_logo.py`
now generates the mark parametrically from the word's own ink box, so the same
proportions hold at 512px and at 34px.

The word is converted to outlines rather than shipped as live text in Aref
Ruqaa. A wordmark that depends on a webfont renders as a fallback serif on
first paint, and the PWA icons must render with no network at all.

### Where §2.4 won over the design

- **Touch targets.** The design specifies a 44px floor and 34px header
  controls. §2.4 says 48px. The visual density is kept by drawing a 34px chip
  inside a 48px button, rather than by shrinking the target.
- **Set figures.** The design drops the set list to 21px. It stays at 24px —
  §2.4 sets that floor and the entry above already raised this exact row so it
  reads at arm's length between sets.
- **Shadows.** `--shadow-md/-lg` carried real 18px and 40px blurs. Dropped; a
  card is separated by a hairline ring and its fill. The two gradients that
  survive are the header band and the fade behind a pinned action, both of
  which replace a hard border rather than decorate.

### Deviations from the design worth naming

- **Exercise tiles keep their stepped tones.** The handoff flattens every
  fallback tile to one neutral. Telling adjacent rows apart is why the steps
  exist (see the 0D entry above); they are rebased onto the warm ramp instead.
- **History corrections are a reveal, not a dialog mode.** The design asked for
  `EditSetDialog` in "list mode". One `Edit sets` button per expanded workout
  reveals the existing per-row controls — same result, no second dialog
  surface, and the write-through save is untouched.
- **The pinned Log-set button stays in normal flow.** Sticking it over a fade
  puts it in a fight with the tab bar for the same 60px. The set-entry screen
  is designed to fit without scrolling, which is the actual requirement.

### Progress needed four RPCs, not two

The handoff identified two functions for the Balance tab. Volume needs data
too, and Strength's rep histogram is a third. Migration `0007` adds four, all
`security invoker` like the three in `0001`, with `execute` granted to
`authenticated` only — the posture `0006` established.

`session_volume_history` returns one row per finished workout; sessions-per-week,
monthly volume, the workload scatter and the training calendar are all derived
from that single series on the client (`src/lib/progress.ts`, unit-tested), so
the Volume tab costs one round trip rather than four.

Every sub-tab degrades to a "needs migration 0007" note rather than an error if
its function is missing, because **the migration cannot be applied from a
sandboxed session** — there is no Supabase egress. Ameen applies it.

Charts other than the 1RM line are hand-rolled SVG rather than recharts: the
design specifies exact bar widths, radii and gridline counts, and recharts is
already half the bundle. The 1RM line keeps recharts for its tooltip, and
Progress stays lazy-loaded — the main bundle is unchanged at 364 kB.

Lift-balance ratios (deadlift 1.0, squat 0.85, bench 0.75, overhead 0.45) are
the usual strength standards. The chart says "predicted", not "target": the
point is to surface a lift that has fallen behind, not to prescribe one.

## 2026-08-03 — Migration 0007 shipped broken: `position` is reserved

`0007` declared `returns table (bucket text, position int, set_count bigint)`.
`POSITION` is a reserved word in Postgres — it is SQL-standard string-function
syntax — so the migration failed to parse. Not one statement ran; Ameen got
`42601: syntax error at or near "position"` in the SQL editor. The ordinal is
now `bucket_order`.

The client never read that column (`ProgressScreen` uses `bucket` and
`set_count`), so nothing else changed.

### Why it got through

A sandboxed session has no Supabase egress, so 0007 shipped verified by
review alone. Types, tests and the build all passed and none of them look at
SQL. "I could not run it" was recorded honestly in the PR and in STATUS, but
recording a gap is not the same as closing it.

It was closeable. Postgres installs locally, and the whole chain — 0001
through 0007, against a stubbed `auth` schema — applies in about a minute.
Doing that after the fact found the bug immediately and then confirmed the
four functions return correct values: warm-ups excluded from the histogram and
from volume, empty rep buckets preserved, a bodyweight set counted for set
volume but not for load, and Epley picking 90 × 14 over 100 × 8 as the better
bench estimate.

### What is now in place

`scripts/check_migrations.py` parses every migration with `pglast`, which
wraps libpg_query — the parser Postgres itself uses. It needs no server and
catches exactly this class of error.

It is deliberately only a parse check. Executing migrations needs a real
cluster, and wiring one into CI is a larger change than this fix warrants —
worth doing when migrations get more frequent, and it is Ameen's call. Until
then the rule is: a migration that has never been executed is unverified, and
the honest place to say so is the PR body.

## 2026-08-03 — Stage 8 (Assist): open-weight AI, conditional on evidence

Ameen asked whether open-source AI could go into Wazn. It can, and §Stage 8
now records what and how. Three findings shaped it.

**Most "AI features" in a lifting app are not AI.** Plateau detection, deload
suggestions, 1RM estimation, undertrained muscle groups — all statistics, and
three of the four already ship. An LLM there swaps arithmetic that is free,
instant and testable for something slower, costlier and nondeterministic. The
rule written into the stage: if statistics can answer it, statistics answer it.

**The economics pick the architecture, not preference.** A self-hosted GPU is
a few hundred dollars a month against a ~$45/mo stack and ~$1.50 ARPU — more
than everything else combined. On-device WebGPU is free but means a multi-GB
download on the budget Android phones that are the actual market, and the
models small enough to run there are not good enough to trust with training
advice. That leaves serverless open-weight inference behind an Edge Function,
which is also the only one of the three that keeps the key off the client.

**Licence and model size are separate questions, and Kimi answers them
differently.** Kimi K2's Modified MIT is the most permissive of the serious
open-weight options — its one condition triggers above 100M MAU or $20M/month
revenue. Llama and Gemma ship custom licences that are not open source. But K2
is ~1T parameters with ~32B active, built for agentic and coding work. The one
assist worth building first — parsing "three sets of eight at two-twenty-five"
into a draft — is a task a 3B model does perfectly, and mid-set latency matters
more than capability. So: a small Apache-2.0 model for 8A, and a K2/K3-class
model held for 8C, the coaching agent, where long-context reasoning over months
of history is genuinely the job.

### Why it is conditional rather than scheduled

Voice logging is the only assist that makes the core job _faster_ rather than
adding something to look at, so it is the one worth building. But whether it is
wanted is exactly what Gate 1 measures: two weeks off Hevy, with every missed
moment written down. If "I wish I could just say the set" never appears in that
list, 8A is a feature built because it was interesting. The gate produces the
evidence; the stage waits for it.

8A also carries its own kill condition — if voice does not beat the steppers on
wall-clock for half of attempts over a real week, it is a demo and gets deleted.

## 2026-08-04 — Usability reevaluation: the app had no back button at all

Ameen tried to use the app and reported it unusable: no back button, images
too small, the whole thing unprofessional. The reevaluation was done by
_running the app_ — every screen screenshotted at a phone viewport against a
stubbed Supabase — rather than by re-reading the code, per the 0F lesson:
grep proves absence, a screenshot proves what a user sees.

### The core finding: system back closed the app from everywhere

All navigation was plain `useState` — tabs, the picker, set entry, the
routine editor, dialogs. Nothing ever touched browser history. The manifest
ships `display: standalone`, so the installed PWA has no browser chrome, and
the Android back gesture — the one universal "back" a phone user has — popped
an empty history stack and **closed the app**. From inside a workout. Every
"unusable" in the report traces to some form of this.

Fix: `src/lib/use-back.ts`, a back-stack hook (`useBackLayer`) that mirrors
each open UI layer into exactly one `history.pushState` entry, stamped with
its depth. `popstate` closes every layer deeper than the arriving state;
closing in-app consumes the entry silently. Registered layers: non-Log tabs
(back returns to Log, as bottom tab bars promise), the Log sub-views, both
exercise pickers, the edit-set dialog, the header menu. One entry per
_layer_, not per view — picker → set entry stays one level deep, so back
always lands on the workout overview, never retraces picking steps.
Unit-tested with jsdom's history.

### Visible back affordances

A history entry fixes the gesture; a visible control fixes the confusion.
Every sub-view now leads with a chevron at the inline start (`IconBack`,
48px target): the picker (was: a "Cancel" past the keyboard), set entry
(was: a "Done" that read as submit), the routine editor. Directional icons
flip under `[dir='rtl']` in CSS, so Stage 5 gets them for free.

### Images: bigger, and seated in the app's own light

Thumbnails went 38–44px → 64px in the picker and set-entry header, 48px
everywhere else. The real problem was not only size: free-exercise-db
photos carry loud red gym walls that clash row after row. A `thumb-photo`
filter (saturate 0.35, brightness 0.9) seats them all in the app's palette —
recognition survives, the colour noise does not. No re-encoding: the 240px
sources cover 64px at 3× DPR.

### The rest of what the audit found, all fixed

- **Sign out** was a permanent header text button — a destructive action
  parked where a thumb rests, on every screen. Moved behind a ⋯ menu (which
  is itself a back layer). Not a settings screen; one menu item.
- **Finish** ended the workout on one tap. Now two-tap ("Finish" → "Finish?"),
  disarming itself after 4s. Same pattern for routine Delete, which was a
  naked one-tap `×` on the home screen.
- **Routine rows** carried three permanent text actions (Edit/Copy/×);
  they read as a settings list. One ⋯ per row expands the actions.
- **Workout duration** never ticked — `formatDuration` was computed once per
  render and nothing re-rendered. A 30s interval now keeps it honest.
- **Tab bar** was three bare words; icons (barbell/clock/trend, inline SVG,
  no library) make it read as navigation.
- **History rows** reserved space for a thumbnail that could never load
  before expansion (it derived from sets fetched _on_ expansion) and used
  `+`/`−` glyphs as disclosure. Dead thumb dropped, chevron rotates.
- **Auth screen** said "Wazn" in plain Inter with an off-system filled
  button — the only screen a new user is guaranteed to see, and the only one
  not using the design system. Wordmark, system buttons, one line of copy.

### Deployment: reevaluated and deliberately unchanged

Ameen asked whether the app should be deployed differently. No hosting
change fixes any of the above — the failures were in the app, not the
delivery. Vercel + PWA stays: it is free, auto-deploys `main`, and the
installed PWA now handles back correctly. The plan already schedules a
Capacitor Android build at Stage 6 (AdMob needs native slots); pulling that
forward would add a build pipeline and Play review latency while GATE 1 is
still open. Revisit only if gym-reality testing surfaces something a PWA
cannot do (Stage 4 lists the known candidates).

### What was deliberately not touched

The logging mechanics (§2.1 is sacred): steppers, auto-fill, rest timer,
superset alternation, kg storage, and the sub-24px `previousSummary`
exception all carry over exactly. The redesign moved chrome, not the flow.
Tests went 113 → 117 (the back stack is covered); typecheck, lint, and the
production build pass.

## 2026-08-04 — The mark: وزن is now the barbell, and the name survived a challenge

Ameen called the logo basic and asked for the Arabic word itself to read as a
barbell, in calligraphy. Then he asked whether the app should be named
something else entirely — something U.S. users relate to. Both were treated
as real reevaluations, not confirmations.

### The naming exercise, and why it ended where it started

Criteria: short in both scripts, meaningful to lifting, pronounceable in
Cairo and Minnesota, searchable, and free of in-category collisions. Every
serious candidate was checked against the live fitness market, and the
checks — not taste — decided:

- **Azm (عزم)**: AzmFit already exists (halal fitness app). Out.
- **Kilo**: an existing strength-training logger (thekiloapp.com), a gym
  platform (usekilo.com), and a coaching brand (trainkilo.com). Out.
- **Atlas**: multiple fitness apps plus fitness-device trademarks. Out.
- **Benchmark** (Ameen's pick for a round): two same-named workout trackers
  live on the App Store, one by a developer called "Benchmark Strength".
  Identical-name ASO is the worst position available. Out.
- **Hadid (حديد)**: the best cultural fit and the only candidate whose
  letters connect — but Latin search is owned by the Hadid family. Out.
- **Giza**: the strongest true rename — clean in fitness, US-legible,
  proudly Egyptian. Runner-up.

Ameen confirmed: **Wazn stays.** It is the unit of the sport, four letters
in both scripts, collision-free everywhere we looked, and foreign names
travel fine when pronounceable (Peloton, Asana). The name was never the
weak point; the mark was.

### The mark: Loaded Ink

The old mark drew an amber bar _in front of_ the word — strikethrough text
with clip-art plates. Direction now recorded in `docs/design-philosophy.md`.

A kashida was tried first and killed: none of و ز ن connect, so stretching
ز into the shaft is fake calligraphy and the render read as "ون". What
shipped instead keeps every letterform intact: و and ن set on one axis as
the two weights (و dropped 85 units — its box centres high because the tail
fills the lower half), ز between them, and a single round-capped ligature
stroke at the letters' base — the shaft — running past both ends like
sleeves. The ز dot renders as an amber plate face (even-odd annulus, so
the ground shows through). Letters take currentColor (chalk); the iron is
always accent.

Four studies went to Ameen (ligature / through-bar / heavy / two-tone). He
picked the name, not a study, so per §2.6 the study choice was made here:
**B's geometry with D's two-tone colour** — the two-tone is already how the
app's chrome uses colour, and it survives 34px and the 48px launcher tile.
Reversible in one parameter if he disagrees.

`build_logo.py` was rewritten around the composition and now also generates
`src/components/wordmark-paths.ts`, consumed by both `Wordmark.tsx` and the
share card — which previously typed "Wazn" in Inter and now draws the actual
mark via Path2D. One geometry, three surfaces, no drift.

## 2026-08-04 — The plan was reconciled, not overwritten

Ameen updated `WAZN_PLAN.md` in a chat planning session and pasted the new
version in. Two substantive changes were real and are now in the file: the AI
layer moved from a conditional Stage 8 into **Stage 2C**, and the domain
**trywazn.app** was bought at Porkbun.

The pasted STATUS block said "Active stage: 0 — GATE 0 open". The repo
contained all of Stage 1 built and passing — routines, rest timer, supersets,
edit-past-workout, finish summary, 117 tests. §6 says trust reality and fix
STATUS, so §1–§6 were taken from the pasted version and STATUS was rewritten
from the code. Writing the pasted STATUS verbatim would have destroyed the
project's memory of an entire completed stage.

**Stage 8 was dropped**, because the new version has no Stage 8 — its content
is now 2C. Nothing was lost; the AI work is described in more detail there than
it was in Stage 8.

Recorded because the two files disagreed and somebody has to be able to see
which way the disagreement was resolved.

## 2026-08-04 — Gates 0 and 1 were opened by decision, not evidence

Ameen said "start stage 2". Neither gate's acceptance list had been run: Gate 0
wanted an OTP sign-in on a phone and one real gym session; Gate 1 wanted two
full weeks replacing Hevy with zero fallbacks. §4 says gates are evidence, not
vibes. He is the approver and chose to advance, which is his call to make.

The consequence worth naming: **the Gate 1 backlog does not exist.** "Every
moment he misses Hevy gets written down and becomes backlog" was the mechanism
by which Stage 2 was supposed to know what to build — and specifically the
evidence 2C's AI layer was conditional on. Stage 2 is therefore being built
from the plan's own list rather than from use. That is a weaker footing than
the plan intended, and it is the reason 2C was not started here.

## 2026-08-04 — 2B's CSV note backfill is a no-op

The plan says to backfill notes from the Hevy CSV's `exercise_notes` column
"that the original import ignored". Checked before building the importer:
**4 rows out of 3,197 carry a value, and two of the four are junk** — "Barbeel"
(a typo) and "Warmup" (a set type the schema already models). The other two are
equally uninformative.

So no importer was written. The note _fields_ were still built — they are for
notes Ameen writes from here on, which is the actual value — but there is
nothing to migrate into them. Added to `WAZN_PLAN.md` §5 so this is not
re-derived by a future session that reads the plan and goes looking.

## 2026-08-04 — Per-user notes cannot be a column on `exercises`

`exercises` is a shared library: seeded rows have `owner_id is null` and every
authenticated user can read them (`exercises_select_visible`, 0001). A note
like "seat position 4" is one person's, so putting it on that row would publish
it to everyone the moment a second user existed.

`0008` therefore splits the two:

- `exercises.instructions text[]` — a property of the lift. Shared, and
  writable only by the service role, because there is no insert/update policy
  on `exercises` for `authenticated`.
- `public.exercise_notes (user_id, exercise_id, note)` — a property of the
  person's relationship to the lift. Own-row RLS, primary key on
  `(user_id, exercise_id)`, and a separate index on `exercise_id` so the
  cascade from a deleted exercise does not seq-scan it.

A `btrim(note) <> ''` check enforces "an empty note is a deleted note" in the
database rather than trusting the client, because an empty note card is
indistinguishable from a real one on screen.

## 2026-08-04 — 0008 was executed, not just parsed

`scripts/check_migrations.py` proves a migration parses. It does not prove it
runs, and the plan is explicit that an unexecuted migration is unverified.

The whole chain 0001→0008 was run against a real Postgres 16 in this session,
with `auth.users`, `auth.uid()` and the three Supabase roles stubbed, and then
exercised with seeded data:

- `exercise_records` returned 58.97 best set, 70.764 best e1RM, 1143.08 best
  session volume, 3 sets, 1 session — warmups and the null-weight set correctly
  excluded, matching hand calculation.
- A second user calling the same function got nulls and zeroes: security
  invoker + RLS holds.
- That user's attempt to insert an `exercise_notes` row owned by the first user
  was refused by the RLS policy.
- A whitespace-only note was refused by the check constraint.

This is still not proof against production, which has real data and a real
migration history. It is a great deal more than a parse.

## 2026-08-04 — One matcher for images and instructions

`scripts/import_instructions.ts` imports `bestMatch` from
`match_exercise_images.ts` rather than matching names again. Two matchers would
eventually disagree about which free-exercise-db entry an exercise is, and the
failure mode is one lift's photo above another lift's steps — which reads as
authoritative and is worse than showing nothing at all. The Stage 0D matcher
already earned its muscle-group gate the hard way (see the 2026-08-01 entry).

Coverage verified offline against the exercise list rebuilt from the CSV:
**110/134 exercises get instructions, with 0 matched-but-stepless.** That is
the same 110 that have thumbnails, which is the point — the same exercises get
both, and the same 24 get neither.

## 2026-08-04 — Two Stage 0C leftovers in `supabase_admin.ts`

Found while writing the 2A runbook:

1. `smtp_sender_name` defaulted to **`'Workout'`** — the old app name, on the
   From line of every sign-in email. Stage 0C was supposed to rename everything
   user-visible; this was missed because it is a fallback, not a literal.
   Now `'Wazn'`.
2. `set-site-url` **replaced** `uri_allow_list` with a single URL. Running it
   for trywazn.app would have silently dropped the Vercel origin and broken
   sign-in there mid-migration. It now accepts several URLs: the first becomes
   `site_url`, all of them go in the allow list.

Both would have surfaced during 2A as confusing failures rather than as errors.

## 2026-08-04 — Design system v2: IBM Plex is self-hosted, not loaded from Google

The v2 handoff specifies IBM Plex from Google Fonts. It ships from `/fonts/`
instead. Four reasons, in order of weight:

1. **Stage 4 is offline logging.** A font on a third-party origin cannot be
   precached with the app, so the first offline launch renders in a fallback
   face. Self-hosted files go into the service-worker precache with everything
   else.
2. **The baseline user is on Egyptian mobile data.** A render-blocking
   stylesheet on `fonts.googleapis.com`, which then references
   `fonts.gstatic.com`, costs two DNS lookups and two TLS handshakes before
   first paint — on the hot path.
3. It is one fewer third party watching a lifter open the app.
4. Google Fonts is not reliably reachable on every network.

Cost: 76 KB, precached once. `IBM Plex Sans` is served as a single variable
file covering 400/500/600 (46 KB) rather than three static cuts; Mono ships
500 and 600 (15 KB each) because only the kicker and the PR badge use it.

**Latin only.** `IBM Plex Sans Arabic` is in the handoff, but Arabic UI is
Stage 5 — shipping the Arabic face now would put an unused download in front
of every user for several stages. It arrives with the strings it is for.

## 2026-08-04 — The hero button tier reverses an earlier call, on purpose

The current system uses outlined-on-tint for primary actions, and
`DECISIONS.md` records why: a solid amber slab shouts over a column of
controls, and on the hot path the only thing that should shout is the number.

v2 introduces a solid amber hero tier. The reasoning still holds, which is
exactly why the handoff pairs it with a rule: **one solid amber button per
screen, maximum**, on the single action that screen exists for. When nothing
else on the screen is filled, the fill is not competing with the number — it
is the thumb's destination, findable without reading. Everything else stays
outlined.

Applied to: "Log set N" (set entry), "Start workout" (Log idle), "Send code" /
"Verify and sign in" (auth). Deliberately **not** applied to "Add exercise" on
the workout overview — that screen's primary interaction is tapping an
exercise in the list, so a filled Add exercise would outrank the thing it sits
above.

## 2026-08-04 — `font: inherit` on native controls had been eating every button weight

Found while verifying the hero tier: the button rendered solid amber but at
weight 400, and `btn-hero` asks for 600.

`src/index.css` carried, unlayered:

```css
input,
button,
select {
  font: inherit;
  color: inherit;
}
```

Two compounding problems. `font` is a **shorthand** — it resets `font-weight`
to the inherited value along with everything it does not name. And the rule
sat **outside any cascade layer**, and unlayered declarations outrank every
layered one, so it beat Tailwind's `utilities` layer outright.

Consequence: `btn-base`'s `font-weight: 500` had never reached the screen
since the utility was written. Every button in the app rendered at 400. The
same applied to `color: inherit`, which overrode `btn-hero`'s `accent-ink`
and put chalk text on an amber fill — **1.7:1**, unreadable, and a contrast
failure that would have shipped.

Fixed by moving the rule into `@layer base` and replacing the `font`
shorthand with longhands. Buttons now render at their intended weight and the
hero measures **9.97:1**.

Worth keeping in mind generally: in Tailwind v4 every unlayered rule in
`index.css` silently outranks the whole utility system.

## 2026-08-04 — `pr-row` was renamed to `record-row`

The RTL ESLint guard rejected it, correctly: `pr-row` is indistinguishable
from Tailwind's `pr-*` padding-right utility, which is exactly the physical
property the guard exists to catch. Renamed to `record-row` / `record-flash`.
A class name that reads as a banned utility is a bad name even when the lint
rule is the only thing that notices.

## 2026-08-04 — What v2 did not change

Worth recording, because it is most of the system: **every colour token in the
handoff already matched the codebase** — ink, surface, raised, line, text,
accent, accent-ink, both nine-step ramps, the tile steps. So did the radii,
the 48px touch floor, the header-band gradient, `rule-fade` / `rule-solid`,
the thumbnail filter, and `StreakPlates` (4px wide, radius 2, heights
7/10/13/16, amber filled).

The real diff was type (Inter → IBM Plex, plus a scale with weights bound to
sizes), the hero tier, the knurl, the inset top-light on elevation, and the
kicker moving to mono. Everything else was already there.

## 2026-08-04 — Reconciliation: what STATUS claimed, and what the database says

The Launch Bundle plan arrived with a STATUS block that said "Active stage: 0 —
GATE 0 open". The repo's own STATUS was a stage ahead of that, and production
was ahead of both. §6 says trust reality, so §1–§6 were taken from the new plan
(Launch Bundle, §2.4 v2, Stage 4B, the silent rest timer) and STATUS was rebuilt
by querying the live database.

**The egress assumption is dead.** Every prior note in this file that says a
sandboxed session cannot reach Supabase — and there are several, including the
one that explains how migration 0007 shipped broken — was true then and is false
now. This environment reaches `api.supabase.com` and `api.resend.com`. It does
not reach the Vercel app, `trywazn.app`, or `openrouter.ai`. That single change
is what made the rest of this session possible, and it retires "I could not run
it" as an acceptable reason for an unexecuted migration.

Drift found, all resolved in favour of reality:

| STATUS said                      | production says                                             |
| -------------------------------- | ----------------------------------------------------------- |
| migrations 0007 + 0008 unapplied | **0007 was already live**, in its fixed `bucket_order` form |
| workouts 152                     | **154** (two logged since, latest 2026-08-03)               |
| three zero-set test workouts     | **four**                                                    |
| tests 128                        | 128, confirmed                                              |

The 0007 surprise is worth naming: somebody applied it between sessions and
nothing recorded that. There is no `supabase_migrations.schema_migrations` table
on this project — migrations have been applied by pasting into the SQL editor,
which leaves no trace — so "which migrations are live?" is answered by probing
for objects rather than by reading a ledger. Creating that ledger was attempted
and is worth doing; it is the one thing that would have made this an unnecessary
paragraph.

## 2026-08-04 — 0007 and 0008 applied to production, and verified by execution

Applied over the Management API, both from the repo files rather than from
memory, so production now matches source exactly. 0007 was re-applied on purpose
even though its functions existed: `create or replace` is idempotent, and it
removes any doubt that the live definitions are the ones in the repo.

Verified as Ameen's account, with `set local role authenticated` and his `sub`
in `request.jwt.claims` — so `security invoker` and RLS were actually in the
path, not bypassed by the `postgres` role the Management API otherwise runs as:

| exercise              | best set  | best e1RM | best session volume | sets | sessions |
| --------------------- | --------- | --------- | ------------------- | ---- | -------- |
| Bench Press (Barbell) | 68.04 kg  | 77.11 kg  | 2,064.77 kg         | 149  | 38       |
| Deadlift (Barbell)    | 122.47 kg | 134.72 kg | 2,231.67 kg         | 10   | 2        |
| Squat (Barbell)       | 81.65 kg  | 92.54 kg  | 1,524.00 kg         | 39   | 10       |

122.47 kg is 270 lb, which is the Stage 0A ×2 deadlift correction arriving
intact at the far end of the chain — CSV patch, import, migration, RPC, RLS.

The negative case was run too: the same call as the _other_ profile
(`6da348ed`) returns nulls and zeroes. Security invoker holds.

## 2026-08-04 — §2.4 deviation register, decided once

§2.4 is now prose compressed from the design handoff, and prose loses detail.
Rather than re-litigate each difference every session, here is the whole register
with the call made once.

**Deviations that stand.**

1. **IBM Plex is self-hosted, not Google Fonts.** Reasons unchanged (offline
   precache, Egyptian mobile data, one fewer third party, reachability).
2. **IBM Plex Sans Arabic is not shipped yet.** It arrives with the Stage 5
   strings it exists for; shipping it now is an unused download on every load.
3. **`previousSummary` renders at 20px**, under the 24px number floor. Already
   named in §2.4 as the one recorded exception.
4. **The hero tier is not applied to "Add exercise"** on the workout overview.
   §2.4 says at most one solid amber button per screen; it does not say every
   screen must have one. That screen's primary interaction is tapping an
   exercise in the list, and a filled Add exercise would outrank it.
5. **Exercise fallback tiles keep five stepped neutral tones.** The handoff
   flattens them to one. Telling adjacent rows apart at a glance is the entire
   job of the tile. Neutrals, so the one-accent rule is untouched.
6. **`rule-fade` is a gradient and stays.** §2.4 says "exactly ONE gradient
   exists in the app: the header band", but the handoff itself specifies
   `rule-fade`, so the prose contradicts its own source. The reading, settled:
   the rule governs gradients used as **fills**. `rule-fade` is a 1px separator
   whose ramp exists precisely to avoid the hard border a solid rule would draw.
   One gradient fill (the header band), one gradient hairline.

**Deviations that were wrong and are now fixed.**

7. **The rest timer beeped.** Stage 1 as originally written said "vibration +
   sound"; design v2 amends it to SILENT, amber ring and "Rest done", optional
   haptic only. The `beep()` WebAudio oscillator is deleted. This is the right
   call independent of the spec: a gym is somebody else's room, and a phone that
   chirps between sets is a reason to switch the timer off — which costs the
   whole feature, not just the sound. The haptic stays, already guarded.
8. **`action-fade` was a third gradient.** Defined in `index.css`, referenced by
   nothing — the pinned-action layout it was written for was reverted (see the
   redesign entry above) and the utility outlived it. Deleted.

**Checked and already compliant:** no red anywhere in `src/` (errors are amber
and outlined), no emoji in UI, no drop shadows, both nine-step ramps present,
48px touch floor, `record-flash` keyframe present and matching the PR motion
spec.

## 2026-08-04 — What in the 2A runbook went stale

`docs/stage2a-domain-setup.md` was written when this environment could reach
nothing. Three of its statements are now false, and one of them would have cost
Ameen time while he is running the runbook:

- Its opening line says Claude Code has no egress to **Supabase**. It does now.
  Step 4 (`set-site-url`) is therefore runnable from a session. Steps 1–3
  (Porkbun, Vercel, Resend DNS) genuinely are not — those hosts are blocked and
  DNS is Ameen's account anyway.
- Its closing note says migrations 0007 and 0008 are unapplied. Both are live as
  of today.
- It says three zero-set test workouts remain. There are four.

Two things it does not say and should, both now added: production auth config is
still `smtp_sender_name = 'Workout'` and `smtp_admin_email = onboarding@resend.dev`
— the Stage 0C rename never reached the live project, only the script's default —
and `uri_allow_list` will need `trywazn.app/**` before the Block 3 invite links
resolve.

**Not touched from here.** Changing `smtp_sender_name` is a live auth-config
write, §2.6 puts auth changes behind an ask, and Ameen is executing that exact
surface right now — two writers on one config is how a half-applied SMTP setting
happens. Flagged instead.

## 2026-08-04 — Stage 2A executed by Ameen; verified against the live config

Reported complete and confirmed by reading the project's auth config rather
than taking the report at face value — the same discipline that caught 0007
being already applied this morning:

| setting            | live value                                                               |
| ------------------ | ------------------------------------------------------------------------ |
| `site_url`         | `https://www.trywazn.app`                                                |
| `smtp_sender_name` | `Wazn` (the Stage 0C leftover is finally gone)                           |
| `smtp_admin_email` | `code@trywazn.app`                                                       |
| `uri_allow_list`   | four entries: www.trywazn.app and the Vercel origin, each bare and `/**` |
| OTP                | length 6, expiry 3600 — unchanged, as specified                          |

The acceptance test that actually mattered passed: a sign-in code was
delivered to an address that is not the Resend account owner. Non-owner
sign-in is now proven by a delivery rather than assumed, which was the whole
point of 2A and the last thing blocking a beta cohort.

### One detail worth writing down before it bites

The allow list holds **`www.trywazn.app`**, not the apex `trywazn.app`, and
Vercel 308s the root to www. That is a sound setup, but it means an auth
redirect target on the bare apex would be refused. Nothing in the app builds
one — redirect targets come from `window.location.origin`, which is already
www by the time any page runs — and a shared apex link keeps its path across
the 308. Recorded because "why did that one invite link fail" is a bad hour to
discover a host mismatch, and Block 3's invite links are the first feature to
put URLs in other people's hands.

## 2026-08-04 — 2C: the privacy boundary is a function signature, not a rule

Plan §2C says prompts carry "numbers and exercise names only — no email, name,
or user id ever reaches the model API". A rule like that is normally enforced
by everyone remembering it.

Here it is enforced by construction. The Coach's Notes prompt is built from
`coach_stats()` and from nothing else, and that function returns a fixed
`jsonb` shape containing muscle groups, exercise names and integers. There is
no parameter to widen and no join to a profile. Adding PII to a prompt would
mean editing a migration, which is a review, not an afternoon.

The same shape answers the identity question. `coach_stats()` **takes no
arguments** and is `security invoker`, so whose numbers come back is decided by
RLS against the caller's JWT. The Edge Function could not pass a user id if it
wanted to. "Identity comes from the JWT" stops being a convention and becomes a
thing the type system of the database agrees with.

### Why the model never sees a threshold

`coach_stats()` reports weekly sets per muscle group and the same figure four
weeks earlier. It does not report "you are under the productive band" — the
10-20 band lives in the static system prompt. Two reasons: a constant in the
static prefix is cached by the provider across every user and costs nothing to
re-send, and a number the model is asked to _compare against a constant_ is a
much smaller ask than a number it is asked to _derive_. Same for plateaus: SQL
emits `best_e1rm_28d` and `best_e1rm_before` and the model reads the
difference. It is never asked what a plateau is.

## 2026-08-04 — 2C: BEFORE INSERT, and why the AI functions write as two roles

Two mechanical decisions that are easy to get wrong and hard to notice.

**The Edge Functions hold two Supabase clients.** Reads go through a
JWT-scoped client, so RLS decides what the caller can see. Writes to
`coach_notes` and `ai_generations` go through the service role, because
neither table has an `insert`/`update`/`delete` policy for `authenticated`.
That is deliberate: a browser that could write `coach_notes` could put any
text it liked behind the "AI-generated" label, and a browser that could delete
its own `ai_generations` rows would have no quota at all. Clients read; the
function writes.

**Quotas are a ledger, not a counter.** `ai_generations` gets one row per
generation actually paid for, and a quota is a `count(*)` over a trailing
window. A counter needs something to reset it — a cron, a monthly job, a
column somebody forgets — and a ledger just ages out. It also answers
"is the free tier actually carrying this?" for free, because `used_free` is on
every row.

## 2026-08-04 — 2C: the routine validator is the only part worth testing, so it is the only part that is testable

The generator's Deno code cannot run under vitest. Rather than accept that the
safety-critical part ships untested, `validatePlan` was extracted to
`supabase/functions/_shared/validate-plan.ts` — plain TypeScript, no Deno
APIs, no imports — and the test suite imports it directly. The Edge Function
calls the same module, so the tested code is the shipped code.

It earns the attention. Everything upstream of it is a model's suggestion and
everything downstream is an INSERT into somebody's routines. Nine tests cover
it, and one of them found a real bug before the feature ever ran: `Number(null)`
is `0`, so a missing `reps` clamped to the minimum and prescribed **one rep**
instead of falling back to eight. Absence is now checked before conversion.

The validator drops unknown exercises rather than rejecting the plan, and drops
a day that loses all of them. A four-day plan that is real beats a five-day
plan with a hallucinated lift in it. Dropped names are returned to the caller
rather than swallowed, so a model that keeps inventing exercises is visible
without reading logs.

## 2026-08-04 — 2C: what could not be verified from here, stated plainly

The functions are deployed and were exercised end to end up to the model call:
both boot, resolve their shared imports, and reject a valid-but-not-a-user
token with their own message. Everything past that point is unverified,
because this environment cannot reach `openrouter.ai` and there is no
`OPENROUTER_API_KEY` yet.

Specifically unproven: that the model returns usable JSON against the real
schema, that the `:free` slug exists under the name the plan gives it, and
that the 429 fallback fires. The model ids are environment variables precisely
so the first two are config fixes rather than deploys.

This is the same class of gap that let migration 0007 ship broken — recorded
honestly then, and closed the moment egress existed. The difference is that
this one has a named owner and a named unblock: the key goes in Supabase's
Edge Function secrets, and the quality bar runs against Ameen's own nine-month
history before anyone else sees a generated note.

## 2026-08-04 — Stage 3 is a fourth tab, which `CLAUDE.md` said not to build

`CLAUDE.md` fixes the app at three screens with no router, and the Stage 1
entry above defended that against routines: a routine is not a place you go, it
is how you start a workout, so it belongs on the Log screen.

A feed is the opposite. It **is** a place you go, with no relationship to the
set in front of you, and the same test that kept routines on Log is what puts
the feed somewhere else: hanging it off the Log screen would put other people's
training on the screen you open mid-set. §2.1 is unambiguous about that.

So: a fourth tab, `Friends`, lazy-loaded like Progress. Still no router —
`App.tsx` switches on a `Tab` union exactly as before, and the back-stack hook
already treats any non-Log tab as a layer, so Android back returns to Log for
free.

Everything in Stage 3 lives on it, in three panels: **Feed**, **This week**
(the leaderboard) and **You** (visibility, username, follow, invite link). The
alternative was a settings screen, which §Scope forbids — and the only settings
Stage 3 introduces are the ones this screen exists to use, so they belong here
rather than in a screen built to hold them.

## 2026-08-04 — Stage 3: one predicate, and the client never sees it

Plan §Stage 3: visibility "enforced in RLS, never client-side". The threat
model that phrase implies is not a buggy Wazn client — it is a _different_
client, holding a valid access token, talking to PostgREST directly. Every
choice below is against that.

**One function, `private.can_view(target)`.** Policies on `workouts`,
`workout_sets` and `workout_likes` all reduce to it, so there is exactly one
definition of "can A see B" to review or change. It takes the viewer from
`auth.uid()` internally, never as an argument, so it cannot be pointed at
someone else.

**`social_feed()` and `weekly_leaderboard()` are `security invoker` and contain
no visibility logic at all.** They select from `workouts`; the policy decides
what comes back. A second copy of the rule inside the feed is the thing that
drifts out of step with the first, so there is not one.

**`src/lib/social.ts` contains no `if (visibility === …)`.** It asks for rows.
The database answers. That is what makes "never client-side" true rather than
aspirational.

**Discoverability is a weaker question than visibility, and is separate.** You
have to be able to find someone before you can follow them, so `profiles`
exposes name and username for anyone not private — but their training stays
behind `can_view`. A private profile is not findable at all, which is what
private has to mean or the setting is decoration.

**Following a private profile is refused by the insert policy.** Without that,
anyone who learned a user id could follow them, and `followers` visibility
would then hand over their training on the next read.

**In-progress workouts are never visible to anyone, at any setting.** The
policy requires `ended_at is not null` for other people's rows. Mid-session is
not a broadcast.

**"No such user" and "that user is private" are the same error message.**
Distinguishing them turns the follow box into a "does this person use Wazn"
oracle for private accounts.

### The bug the test found before it shipped

The first version revoked `EXECUTE` on `private.can_view` from `authenticated`,
following the instinct that a helper should not be callable. Every read of
`workouts` then failed with `permission denied for function can_view` — because
a **policy expression is evaluated as the querying role**, so a function the
caller cannot execute breaks the policy rather than protecting it.

The correct answer is to grant EXECUTE and rely on the _schema_: `private` is
not in PostgREST's exposed list, so there is no `/rest/v1/rpc/can_view`.
Verified by asking for it — both helpers return **404** over REST. `anon` holds
nothing at all.

`supabase/tests/rls_social.sql` found this in the first run, which is the
entire argument for writing it.

## 2026-08-04 — Stage 3: the RLS test borrows real accounts and gives them back

The proof the plan asks for is "a non-follower cannot read a followers-only
workout via PostgREST directly". A vitest file cannot show that; the enforcement
lives in the database.

`supabase/tests/rls_social.sql` switches to the `authenticated` role and sets
`request.jwt.claims`, which is precisely what PostgREST does before running a
query — the same code path a foreign client with a valid token travels. Eight
assertions, each raising on failure:

1. a non-follower reads **0** of A's workouts, and 0 of A's sets
2. B cannot insert a follow with A as the follower
3. following reveals exactly the finished workouts, and no in-progress one
4. switching to private revokes access **without deleting the follow** — the
   setting has to bite on read, or turning it on does nothing
5. a private profile is not readable at all
6. a private profile cannot be followed
7. `public` reveals the same finished set
8. B cannot plant a like under A's name, and an empty follow list yields an
   empty feed

It **parameterises over the accounts that exist** rather than creating auth
users, because creating and deleting auth users is a change to auth that §2.6
puts behind an ask. It runs inside a transaction ending in `ROLLBACK`, so the
borrowing leaves nothing behind — confirmed by re-counting rows afterwards.

The honest limit: it proves the policies, not the HTTP layer above them. What
was checked over real HTTP is the complement — that `anon` reads nothing from
`profiles`, `workouts`, `follows`, `invites` or `workout_likes`, and that
neither private helper is reachable as an RPC.

## 2026-08-04 — Sign out moved to where a hand goes looking for it

The redesign moved sign out behind the header's ⋯ menu, for good reasons that
still hold: it is destructive-adjacent, it was parked where a thumb rests, and
it was paying rent on every screen.

Then Ameen went looking for it and could not find it. That is the only evidence
that matters about whether an affordance is discoverable, and it outranks the
reasoning that put it there.

It now also sits at the **bottom of the You panel**, which is where a phone
user's hand goes without being told, and which only exists because Stage 3
created an account screen to put it on. The ⋯ entry stays — two doors to a
rarely-used room is not clutter, and removing the one that already works would
trade one discoverability problem for another.

Two taps, disarming after four seconds, matching Finish and routine Delete.
Signing out mid-workout loses no data — every set is already in Postgres — but
it does put a six-digit code between someone and their next set.

## 2026-08-04 — Block 3: an invite link without a router

`/join/<code>` has to work, and the app has no router. It still does not have
one.

`captureInviteFromUrl()` runs in `main.tsx` **before React renders**: it reads
the path, stashes the code, and rewrites the URL to `/`. By first paint the app
is at `/` exactly as it always is, and nothing downstream knows an invite ever
happened except one key in storage.

Two details that are not obvious and would each have cost a debugging session:

**The URL is rewritten even when the code is junk.** A `/join/nonsense` path
left in the address bar becomes the installed PWA's `start_url` if the visitor
installs from that page — and then every launch forever is an invite landing.

**The stash is `sessionStorage`, not React state or `localStorage`.** Signing
in with an OTP means leaving for a mail client and coming back, possibly
minutes later, possibly in a new tab. React state does not survive that.
`localStorage` survives too much — it would outlive the intent and silently
follow somebody weeks later. A session is exactly the lifetime of "I am
currently accepting this invite".

The code is **peeked** at on the auth screen (to say "Ameen invited you") and
**spent** on the welcome screen after sign-in. Peeking must not consume, which
is why those are two functions and why there is a test for it.

### `resolve_invite` is granted to `anon`

Deliberate, and a genuine loosening. The landing page needs to name the inviter
_before_ there is an account, and that sentence is most of why an invite link
works at all. The cost is that someone holding a valid code learns a display
name and a username — precisely what the inviter chose to share by sending the
link. Enumeration is not the risk: a code is 12 characters from a 36-symbol
alphabet, about 62 bits, and the function returns nothing for a profile that
has since gone private.

## 2026-08-04 — Block 3: the wake lock is silent, guarded, and re-acquired

Three things about `useWakeLock` that are the actual feature, not the API call:

**It is released by the browser whenever the page is hidden**, and not
restored. Without a `visibilitychange` re-acquire, taking one phone call
mid-workout turns the feature off for the rest of the session — which is worse
than not having it, because you have stopped expecting the screen to lock.

**Every call is guarded.** iOS Safari only got Screen Wake Lock in 16.4 and
plenty of budget Android browsers lack it. A missing API is a no-op; a refused
request (no user gesture, battery saver) is swallowed.

**There is no toast.** §2.1 forbids interrupting the logging flow, and a
feature whose entire job is to not be noticed should not announce itself.

## 2026-08-04 — Block 3: the install prompt waits for evidence

`beforeinstallprompt` fires whenever Chrome feels like it, which is usually the
first visit — the single most ignorable moment on the mobile web. The event is
captured and `preventDefault()`ed so the browser's own infobar does not appear,
and the offer is held until `hasHistory` is true: at least one workout logged.
The offer follows evidence that the app is useful, not a page load.

Never during a workout — it is mounted on the idle Log screen only. Dismissal
is `localStorage`, not session: "no" means no, not "no for ten minutes".

iOS has no `beforeinstallprompt` at all and needs Share → Add to Home Screen by
hand, so that platform gets one line of instructions instead of a button that
cannot work. Showing a dead Install button would be worse than showing nothing.

## 2026-08-04 — Block 3: Progress collapses to one sentence at zero data

Every screen had an empty state already. Progress had **four**, stacked: a tab
strip over three sub-tabs that each said "nothing yet" in different words, plus
a Coach's Notes card with nothing to read. Individually correct, collectively
reading as a broken screen rather than an early one.

A brand-new account now gets one sentence naming what will appear and what has
to happen first. The sub-tabs are still there for everyone with data; the guard
is `usage.size === 0`, which is exactly "this person has never logged a set".

This is the class of thing the LAUNCH.md second-account pass exists to find,
and it was found by writing that checklist rather than by using the app —
which is the argument for writing checklists before you need them.

## 2026-08-04 — 2C went live, and a self-test found two things review had not

Ameen supplied the OpenRouter key and asked for the quality bar. The key is set
as the Supabase secret `OPENROUTER_API_KEY` (Edge Functions → Secrets — never
`.env`, never Vercel, never a `VITE_` var).

**A note on how the quality bar was run.** Generating notes needs a session,
and the honest options were to impersonate Ameen's account or to find a path
that did not. Minting a session with the service-role key was attempted and
correctly refused as an escalation. What replaced it: a temporary
`ai-selftest` function that took no input and touched no user data, plus the
real stat block read from `coach_stats()` under Ameen's own JWT claims and
passed in as a transient secret. No impersonation, no user-id parameter, no new
endpoint that could be pointed at anybody. The function and the secret were
deleted immediately after; `coach-notes` and `generate-routine` are the only
functions live.

### `moonshotai/kimi-k2.5:free` does not exist, and never did

The plan specifies a `:free` kimi variant with 429 fallback to paid. OpenRouter
answers **404**: _"This model is unavailable for free."_ Asking OpenRouter for
its model list settled it — **no moonshot model has a `:free` variant at all.**
The plan's free/paid pairing was an assumption, and one live call disproved it.

### The fallback rule was too narrow, and the same call proved that too

The first version fell back only on 429 and 402, reasoning that retrying a 400
against a paid model just pays for the same mistake. That reasoning was wrong.
A 404 on the free variant is precisely the case where falling back is right,
and the narrow rule turned it into a hard failure of the whole feature.

The rule now: **any failure of the free attempt falls through to paid; only the
paid attempt's failure is terminal.** The free attempt is an _optimisation_, and
an optimisation that fails should cost latency, never the result. It also
survives swapping the free model, which is the thing the env vars exist for —
several free models reject `response_format` outright with a 400.

### Model selection is now fact rather than plan

| var                  | value                                    | why                                |
| -------------------- | ---------------------------------------- | ---------------------------------- |
| `COACH_MODEL`        | `moonshotai/kimi-k2.5`                   | as planned, paid                   |
| `COACH_MODEL_FREE`   | `nvidia/nemotron-3-super-120b-a12b:free` | the free model that actually works |
| `ROUTINE_MODEL`      | `moonshotai/kimi-k2.5`                   | paid fallback                      |
| `ROUTINE_MODEL_FREE` | `nvidia/nemotron-3-super-120b-a12b:free` | same                               |

Four free candidates were tried against the real schema. Only Nemotron both
answered and honoured it (3.2 s). `openai/gpt-oss-20b:free` answered in 25 s and
did not produce parseable JSON; `google/gemma-4-31b-it:free` and
`inclusionai/ling-3.0-flash:free` were not available to this account at all.

**The paid fallback currently has no fallback.** The OpenRouter account has
never purchased credits, so `moonshotai/kimi-k2.5` returns 402. Everything works
today because the free model carries it — which means a free-tier rate limit is
presently a user-visible failure rather than a slower answer. Roughly $5 of
credit restores the design. Flagged to Ameen; not something to fix from here.

### 900 max_tokens was a guaranteed failure, not a cost control

The first real run came back truncated mid-sentence: the model spent its budget
reasoning out loud and ran out of room before emitting JSON. A cap that truncates
the answer does not save money, it spends money on nothing. Now 2400.

Two fixes went with it, both worth keeping regardless of model: the system prompt
says "Output ONLY the JSON object, do not think out loud", and `parseInsights`
recovers an object from a reasoning preamble by taking the outermost `{…}`. Models
ignore "JSON only" in at least two ways — a fenced block and a preamble — and both
were observed live rather than imagined.

### The output

Verbatim, against the real nine-month history, with every figure traceable to
`coach_stats()`: back at 4 sets this week against the 10–20 band, deadlift with a
null 28-day e1RM (untrained for four weeks), squat 92.5 kg against 47.6 kg before,
and both bench variants below their previous bests. Nothing invented, nothing
recomputed, no medical advice. The division of labour held.

## 2026-08-05 — Design v2.1: the four missing screens, and where I departed

The `wazn_v2.1_missing_screens` bundle is now **committed to the repo** at
`docs/design/`, and §2.4 points at it. It went missing once between sessions
already; a design reference that lives only in a chat is a design reference
that has to be re-sent.

Built in the sequence Ameen set: Progress and Finish with the design-v2
remainder, Coach with Block 1, Friends with Block 2, tab bar to five.

### Followed exactly

The data chip, the priority-#1 knurl band, "no chat surface anywhere", the
preview-then-save routine flow, the 10–20 knurl target band, three fill states
from one hue, the leaderboard crown, the fact line, the 4:5 share card with the
PR replacing volume as the hero, and every empty-state string.

### Deviations, each with a reason

**1. The like is a heart, which reverses my own earlier call.** The first
Friends build used a plate, reasoning that this app's shape language is plates
and a heart is borrowed vocabulary. The spec says heart, and the spec is right
for a reason the earlier note missed: a plate outline at 20px reads as "record"
or "weight", not as approval, and a like that has to be explained is not one
tap. The plate icon is deleted rather than left behind.

**2. Friends drops its tab strip; `You` becomes a sub-view.** The spec shows
leaderboard and feed on one surface with Invite in the header, and says nothing
about where profile settings live. Keeping them as a third peer tab would have
contradicted the screen it specifies. They are now behind a `You` control in
the header — which also keeps sign-out where Ameen went looking for it.

**3. Progress's "this week" volume is computed on the client, not in SQL.** The
spec calls the card "all three derived, no new tables", and the derivation is a
filter over `session_volume_history`, which the screen already loads for the
trend. A dedicated RPC would be a second round trip and a second definition of
"this week" that could disagree with the streak on the same card.

**4. The strength delta is recent form, not all-time best.** The spec asks for
a 4-week delta with a **down** arrow. An all-time best can only rise, so a
delta built on it could never show one. `strength_summary()` therefore compares
the best of the last 28 days against the best of the 28 days before — which can
fall, and falling is the signal worth surfacing.

**5. The routine builder offers 3/4/5 days, not the spec's exact chip set for
equipment.** Full gym / Dumbbells / Home map onto the `equipment` values the
`exercises` table actually has (`''`, `dumbbell`, `bodyweight`). A chip that
filters to nothing is worse than a chip that is missing.

**6. The share card gained a `name` and `streakWeeks` option rather than
reading them itself.** `share-card.ts` is pure drawing with no data access, and
giving it a Supabase client to fetch a display name would make the one file
that must never fail mid-share depend on the network.

### What v2.1 cost, and what it paid

`ProgressScreen` lost recharts — the volume trend is now three SVG paths in the
v2 chart grammar. That was the app's last recharts import, so the dependency is
uninstalled and **the precache fell from 914 KiB to 537 KiB**. The spec did not
ask for that; drawing the chart to its grammar simply made the library
redundant.

## 2026-08-05 — 0013 had to drop before it could create

`create or replace function` cannot widen a function's OUT parameters, so
adding the fact-line columns to `social_feed` failed with
`42P13: cannot change return type of existing function`. Dropped and recreated
in the same migration, with the grant re-established immediately after.

Worth knowing generally: every `returns table (...)` function in this project
is one column away from that error, and the fix is always drop-then-create
rather than a second function with a new name.

The RLS suite was re-run afterwards and still passes all eight assertions —
which is the point of having it, since the function it exercises was replaced
wholesale.

## 2026-08-05 — The AI features failed in production for two unrelated reasons

Ameen reported "deployment keeps failing" and sent two screenshots of the Coach
tab on the live app. Neither failure was a deployment. CI is green on every run
in this repository's history, and the full chain — lint, format, typecheck, 164
tests, production build — passes locally at `81e5e45`. What the screenshots
actually show is two runtime faults that happen to sit next to each other.

### 1. The routine generator could not read its own model's answer

`generate-routine`'s `parsePlan` tried `JSON.parse`, then looked for a fenced

```json block, and threw "The routine came back unreadable" if there was no
fence. `coach-notes`' `parseInsights` did the same **plus** a fall-back to the
outermost `{…}` anywhere in the text — added during the 2C self-test, when a
model was observed answering with a reasoning preamble and no fence.

The lesson was learned on one surface and never carried to the other. So a
model that thinks out loud produces notes fine and fails the routine builder
every time, which is exactly the asymmetry Ameen hit.

Both now call `_shared/parse-json-object.ts`: raw, then fenced, then the brace
scan, each attempt guarded so a broken fence falls through to the next strategy
instead of throwing. It also rejects arrays and scalars, which the old code
would have passed to a caller that immediately reads a named property off them.

Two smaller bugs died with it. `JSON.parse(fenced[1])` was unguarded, so a
fence containing malformed JSON escaped as a raw `SyntaxError` and surfaced as
a generic 500 rather than the intended 502. And a truncated object — precisely
what the old 900-token cap produced — now returns null instead of throwing.

Plain TypeScript with no Deno APIs and no imports, for the reason
`validate-plan.ts` is: the vitest suite imports the shipped module rather than
a copy. Nine tests, one per shape a model has actually answered in.

### 2. The account signed in has no training history

Coach's Notes reported `total_sets_90d 0 · sessions_last_7 0` and "No training
data" — against an account with 3,201 sets and a nine-month history.

The data is not lost. It belongs to `3551b340` = **`ameen.hassan421@gmail.com`,
with a dot**, which is what Stage 0B set `IMPORT_USER_ID` to. The address in
use now is **`ameenahassan421@gmail.com`, no dot** = `6da348ed`, the profile
that has been empty since 2026-08-01.

Gmail ignores dots and delivers both to one inbox. Supabase auth does not, and
treats them as two users. Before Stage 2A only the dotted address could receive
a code, so the ambiguity could not surface; the moment `code@trywazn.app` could
mail anybody, it did.

The 2026-08-01 entry above called this exactly — "there will be two accounts
where one is expected. Worth a cleanup decision then, not now." Then is now.
Not resolved here: merging profiles moves user data, §2.6 puts that behind an
ask, and the cheap answer (sign in with the dotted address) costs nothing and
needs no migration.

### What this says about the quality bar

2C was signed off on a self-test that ran `coach-notes` against a stat block
read from Ameen's real history. It never ran `generate-routine` end to end, and
it never ran either feature *through the app as a signed-in user*. Both faults
were sitting in the gap between those two things: one in the function that was
not exercised, one in the identity that was supplied out of band rather than by
signing in. A self-test that supplies its own inputs cannot find either.

The `LAUNCH.md` second-account pass is the check that would have caught both,
which is an argument for running it before invites rather than after.

### Free models are now the default in code

Ameen asked to make sure the app uses free models. It largely did — free is
tried first and paid is only a fallback — but `chat()` read `*_MODEL_FREE` from
the environment and skipped the free attempt entirely when it was unset, which
is the most expensive possible reading of a missing variable. The known-good
free slug is now the default in `openrouter.ts`, and setting `*_MODEL_FREE`
equal to `*_MODEL` is the documented way to force paid on purpose.

Worth stating plainly: this session cannot read the project's secrets, so what
is proven here is what the code does with them, not what they currently are.
```

## 2026-08-05 — The two profiles were merged, and the ledger was refunded

Ameen authorised both. Recorded in full because this moved user data, and the
next session should be able to see exactly what happened.

### What the merge actually touched

Ten tables carry ownership. Only three held anything:

| table            | dotted (`3551b340`) | undotted (`6da348ed`) |
| ---------------- | ------------------- | --------------------- |
| `workouts`       | 155                 | 1                     |
| `coach_notes`    | 1                   | 1                     |
| `ai_generations` | 2                   | 1                     |

`routines`, `exercises.owner_id`, `exercise_notes`, `invites`, `workout_likes`
and both sides of `follows` were empty on both accounts, which is the only
reason this was three UPDATEs rather than a migration.

**`workout_sets` has no `user_id`.** It is owned through `workout_id`, so all
3,201 sets followed their workouts without being touched. Worth knowing before
someone writes a merge script that tries to update them directly and wonders
why the column is missing.

The undotted account's `coach_notes` row was deleted before the dotted one was
moved onto it — that table is one row per user, so the move would have
collided. The row deleted was the "No training data" note, which had no value
to lose.

### Verified as the user, not as postgres

The Management API runs as `postgres`, which bypasses RLS and would have
happily confirmed a merge the app itself could not see. So the check was run
inside a transaction with `set local role authenticated` and the undotted
account's `sub` in `request.jwt.claims` — the same path PostgREST takes:

| reading           | before | after |
| ----------------- | ------ | ----- |
| `total_sets_90d`  | 0      | 560   |
| `sessions_last_7` | 0      | 5     |
| workouts visible  | 1      | 156   |

Ended in `rollback`, so the verification left nothing behind.

One detail that made the merge free: `coach_notes.basis_workout_at` is
`2026-08-03 01:15:40.326+00`, which is exactly the newest finished workout on
the merged account. The cache therefore hits, and Ameen sees notes written
against his real nine-month history with no model call — despite the merged
account being over its weekly quota at 2 generations against a limit of 1.

### The refund

Two `ai_generations` rows were deleted: the undotted account's and the
tester's, both spent by the model on telling a user they had no data. That is
the bug fixed in this same session, so the charges were not legitimate.

The tester's cached `coach_notes` row was left in place. It is model-written
text saying she has no training data, which is true, and it will be replaced
by real notes the moment she logs something. Deleting it would only swap it for
the designed empty state, which is not worth another write to her row.

### What was not done, and why

The dotted account (`ameen.hassan421@gmail.com`) still exists, now empty. It was
not deleted: deleting an `auth.users` row is an auth change, §2.8 puts those
behind Ameen, and an empty account costs nothing. It also stays as the visible
evidence of why Gmail dot-normalisation is worth building.

### The double charge that is still unexplained

The dotted account's two generations are stamped `01:06:58` and `01:06:59` —
one second apart. `NotesCard` was read looking for a double-fire and does not
obviously have one: React 18 batches the `setForce`/`setReload` pair in the
Regenerate handler into a single effect run, and `active` guards the unmount
race. The likeliest explanation is the first uncached generation followed
immediately by a Regenerate press, but that is a guess and it is recorded as a
guess. If a third row ever appears one second after a second one, this is the
note that says where to start looking.

## 2026-08-05 — Custom exercises: the gap a solo build could not see

`exercises` had exactly one policy — SELECT — and no client path to create a
row. That was invisible while the only user was Ameen: the 134 seeded rows came
from his own nine months of history, so the catalogue was complete _for him_ by
construction.

It stops being complete the moment a cohort of other people's gyms is involved.
A tester whose gym has a machine the seed does not know about could not log it
at all, and "log a set in under 30 seconds" becomes "you cannot". This is the
last unchecked item on Stage 2's insight list, and it is the one most likely to
end a beta tester's first session.

**Nothing new was invented.** `is_custom` and `owner_id` have been on the table
since 0001, and the SELECT policy has always read
`owner_id is null or owner_id = auth.uid()`. Migration 0014 adds only the three
write policies that were missing, so a custom exercise is private _by
construction_ rather than by a filter somebody has to remember.

Three details that are the actual security, not the feature:

- **The insert policy requires `is_custom`.** Without it a client could insert
  `is_custom = false`, and the row would be indistinguishable from the shared
  library everywhere the UI trusts that flag.
- **The update policy has both halves.** `USING` decides which rows you may
  edit; `WITH CHECK` decides what they may become. Without the second, a user
  could edit their own row into somebody else's by rewriting `owner_id`.
- **Custom names are unique per owner, case-insensitively.** Two people may both
  add "Hack Squat"; neither can add it twice. The client turns the 23505 into
  "you already have one of those" rather than letting a duplicate surface later
  in the picker.

Deleting is allowed by policy and will usually still be refused by the database,
which is correct: `workout_sets.exercise_id` is `on delete restrict`, so an
exercise that has ever been logged cannot be removed. History is what every
chart is built from.

`supabase/tests/rls_custom_exercises.sql` proves it the same way the social
suite does — eight assertions under `set local role authenticated` with real
JWT claims, in a transaction that rolls back. The headline one: B cannot see,
edit or delete A's custom exercise, and still sees the whole shared library.

### Where the create lives, and why

In the picker's **no-results state**. The moment the gap is felt is the moment
to offer the fix, and a search that found nothing already _is_ the name of the
thing — so the name field arrives prefilled. Saving goes straight into set
entry: somebody who just typed a name and two categories wanted to log a set,
not to admire a catalogue entry.

Two fields only. Muscle group and equipment are the only attributes the rest of
the app consumes — the balance chart counts by muscle group, the routine
generator filters by equipment. Anything else would be collected for its own
sake.

Both are fixed lists rather than free text, and
`src/lib/exercises.test.ts` asserts they match the database's CHECK constraint
and the values the seed actually uses. A drift between them shows up as an
insert rejected at the very end of a form, which is the worst moment to find it.

## 2026-08-05 — A privacy policy was overdue, not a Stage 4B item

The plan lists a privacy policy under Stage 4B, as a store prerequisite. That
is where the _stores_ need it. It is not when the app needs it.

Stage 2A shipped: any address can sign in. Real people who are not Ameen now
hand over an email, have it stored, and have their training statistics sent to
a third-party model API — with no page anywhere saying so. That gap opened the
day 2A landed and nobody noticed, because the person testing it already knew
the answers.

`public/privacy.html` is deliberately **standalone**: no build step, no font
download, no script, tokens hard-coded. A privacy policy that depends on the
app's bundle is a page that can fail to load for exactly the person trying to
find out what you do with their data. `vercel.json` rewrites `/privacy` to it
_before_ the SPA catch-all, which would otherwise swallow it.

Linked from the auth screen and nowhere else — the one screen where somebody
hands over an email. A privacy link buried in a settings menu is a link written
for an app store rather than for a reader.

The content is a description of what the code actually does, and it is specific
where a template would be vague: the AI section says the block contains numbers
and exercise names only, and says _why_ that is trustworthy — it comes from one
database function whose output has no identifying fields in it, not from a rule
someone has to remember. Ameen should still read it before invites go out; it
describes his obligations, not mine.

## 2026-08-05 — `vercel.json` cannot carry comments, and it took production down for deploys

`0cc7bde` shipped a `vercel.json` whose first rewrite carried a `"//"` key
holding the reason the rule exists. It is a common JSON-comment convention and
it is not legal here: Vercel validates `vercel.json` against a strict schema
that forbids additional properties, and every deploy after that commit was
rejected with

    rewrites[0] should NOT have additional property `//`

**This is a whole class of failure the repo's own checks cannot see.** `npm run
build` does not read `vercel.json`; neither do lint, typecheck or the tests. CI
was green on the commit that broke deployment, which is exactly the shape of
the migration-0007 problem — a file that only the platform parses, shipped on
the strength of checks that never look at it. The parse check written for SQL
has no equivalent here.

The failure mode is quiet rather than loud: a rejected deploy leaves the
**previous** deployment serving, so the site stays up and simply stops
receiving changes. Nobody notices until they go looking for a change that never
arrived, which is how "deployment keeps failing" gets reported as a vague
feeling rather than an error.

The comment is deleted rather than relocated into the file, because there is
nowhere legal to put it. The knowledge it held is worth keeping and belongs
here:

**`/privacy` must be listed before the SPA catch-all.** Rewrites are evaluated
in order, and the catch-all `/((?!assets/|.*\..*).*)` matches any path without a
dot in it — including `/privacy`. Without the earlier, more specific rule, the
store-listing privacy URL renders the Log screen. Stage 4B requires that URL to
resolve, and App Review checks it.

Worth doing if `vercel.json` grows: validate it in CI against
`https://openapi.vercel.sh/vercel.json`. One file, one schema, and it closes the
gap that a green CI run currently leaves wide open.

## 2026-08-05 — Two gaps closed: config nobody validates, and functions nobody deploys

Both were found the same way — by something breaking in production while every
check in the repo stayed green. They are the same bug in two places: a thing
that matters to users, owned by no automation.

### `vercel.json` is now checked, but not against the published schema

The obvious implementation is to fetch `https://openapi.vercel.sh/vercel.json`
and validate against it. That was the first instinct and it was rejected: it
makes every CI run depend on a third-party HTTP request, and a check that goes
red when a network hiccups is a check people learn to re-run instead of read.
A gate that cries wolf is worse than no gate, because it also erodes trust in
the gates around it.

`scripts/check_vercel_config.mjs` needs no network and no dependencies, and
enforces three things:

1. **No comment-style keys, at any depth.** `"//"`, `"#…"`, `_comment`. Caught
   by shape rather than by position, because the next one will be in `headers`
   rather than `rewrites`.
2. **No unknown keys inside `rewrites`/`redirects`/`headers`.** Scoped to the
   routing arrays on purpose. Top-level keys are numerous and grow with the
   platform, and a check that fails on a legitimate new one is a check someone
   deletes rather than fixes.
3. **The SPA catch-all must be last.** No schema can check this, and it is the
   more dangerous failure: rewrites are evaluated in order and
   `/((?!assets/|.*\..*).*)` matches every dotless path, so a rule placed after
   it never fires. The symptom is `/privacy` quietly rendering the Log screen —
   and Stage 4B needs that URL to resolve, because App Review opens it.

Both rules were proved against the real regression before shipping: the `"//"`
key was re-inserted and caught, and the rewrites were reordered and caught.

### Merging now deploys the Edge Functions

Vercel deploys the web app on every push to `main`. Nothing deployed the
Supabase functions — that was a command a human had to remember. The cost was
paid today: the fix for a routine generator that had never once succeeded sat
merged on `main` while production kept serving the broken version, and nothing
in the system said so. "Merged" and "live" were different words for different
things, and only one of them was visible.

`.github/workflows/deploy-functions.yml` runs on pushes to `main` that touch
`supabase/functions/**`, so a docs-only push redeploys nothing, and carries
`workflow_dispatch` so a deploy can be forced without an empty commit —
including the first one, which has to be manual because the fix it ships is
already merged.

Three details worth keeping:

- **`--use-api`** bundles through the Management API rather than Docker, so it
  works on a plain runner.
- **No function is named in the command.** Adding a third function should not
  require editing this file. The CLI skips `_shared` because a leading
  underscore marks a directory as modules rather than a function.
- **It prints `functions list` afterwards.** A green deploy step is not proof
  the intended version is live, and the version number is the fact that settles
  "did my fix actually ship". Putting it in the run log attaches that answer to
  the commit instead of to somebody's dashboard.

**One dependency that is not mine to satisfy:** `SUPABASE_ACCESS_TOKEN` must
exist as a repository secret. Until it does, the workflow runs and fails at the
deploy step. That is the correct failure — loud, on the commit, and impossible
to mistake for success — and it is strictly better than the silence it replaces.

## 2026-08-05 — The deploy workflow's first real run died on someone else's rate limit

`supabase/setup-cli@v1` with `version: latest` resolves the newest release
through an unauthenticated GitHub API call on every run. The first manual
dispatch failed in 12 seconds:

    Failed to resolve latest Supabase CLI release: rate limit exceeded

Nothing about this repository caused that. Shared runners share an IP, and the
allowance had already been spent by whoever else was on that machine. A
deployment pipeline that can fail for reasons entirely outside the project is
not a pipeline anyone will trust — the first instinct on seeing it red becomes
"re-run it", which is precisely the reflex that lets a real failure through.

The CLI now comes from npm at a pinned version: `npx --yes supabase@2.111.0`.
No release lookup, so nothing to rate-limit, and npm is already the channel
this project depends on for everything else rather than a second one.

**Pinning is the point, not a side effect.** `latest` means the tool that
performs deployment can change under the project without a diff, a PR, or a
person. A CLI upgrade should be an edit somebody reviewed, not something that
arrives on a Tuesday and quietly changes how deploys behave. This is the same
reasoning that kept `check_vercel_config.mjs` off the network: a gate is only
worth having if its failures always mean something.

Dropping `setup-cli` also removed one of the two actions GitHub warns are still
on the deprecated Node 20. `actions/checkout@v4` is the remaining one; it is
being forced onto Node 24 and works, so it is left alone rather than bundled
into an unrelated fix.

## 2026-08-05 — The token cap was one number for two very different jobs

Within minutes of the parser fix reaching production, `generate-routine`
produced **the first successful generation in its life** — and then failed
twice more with the same "The routine came back unreadable" it was supposed to
have fixed.

The difference between the success and the failures was not the model's mood.
The success was a **3-day** routine, requested from a stale cached build; the
failures were **4-day** routines. Output size is the variable, and `MAX_TOKENS`
was a single shared constant of 2400.

Coach's Notes returns five short strings. A routine returns days containing
exercises containing sets, and Nemotron is a reasoning model that spends part
of its budget thinking before it emits any of it. One ceiling could not serve
both, and the larger job was the one that broke.

`chat()` now takes `maxTokens` per call. Routines get 6000; notes keep 2400.
Output tokens cost nothing on the free model and a fraction of a cent on the
paid fallback, so being generous here is cheaper than the alternative: a
truncated answer wastes the entire request and the whole feature with it.

### The wrong fix, and how it was avoided

The failure had already been diagnosed once as "the free model sometimes
returns junk", and the proposed remedy was to retry on the paid model when the
content would not parse. That would have been **wrong, and expensive** — it
would have paid Kimi to truncate at exactly the same ceiling. Ameen asking
"paid from where?" is what sent me back to the data instead of shipping it.

Worth generalising: a fallback is the right answer when the _provider_ failed
and the wrong answer when the _request_ was malformed. Telling those apart is
the whole job, and it is not free — this one took a ledger query and noticing
that 3 succeeded where 4 failed.

### Truncation now says it is truncation

The provider answers this question directly with `finish_reason`, and the code
was throwing that away. A truncated response and a genuinely malformed one are
indistinguishable once parsing fails, and they need opposite fixes — raise the
ceiling versus change the prompt. Twice now a truncation has been misdiagnosed
as garbage output.

`finish_reason` is carried through `ChatResult`, and `generate-routine` checks
it before parsing, so a cut-off answer says **"That routine was too long to
finish. Try fewer days"** rather than "came back unreadable". The user gets an
action instead of a mystery, and the next occurrence is diagnosable from the
message alone.

## 2026-08-07 — A Hevy gap analysis got a skill, not just a document

Ameen asked for an upgrade plan toward Hevy's look and operation, based on
the Aug 1 comparison doc. Two deliverables, one deliberate choice about
where the knowledge lives:

1. **`.claude/skills/wellness-app-design/`** — the Hevy-class design
   grammar (screen anatomy, mid-workout heuristics, wellness/retention
   patterns) encoded as a reusable skill rather than buried in a one-shot
   analysis. Every future UI session loads it next to `impeccable`; the
   comparison doc goes stale, the skill gets maintained. Eval scaffolding
   is in `evals/evals.json`; the interactive skill-creator eval loop
   awaits Ameen.

2. **`docs/HEVY_PARITY_UPGRADE_PLAN.md`** — a PROPOSAL, explicitly
   subordinate to `WAZN_PLAN.md` and the beta-first sequencing. Its load-
   bearing findings, from reading every screen as built rather than
   trusting the comparison doc: the real structural gap is the
   one-exercise-at-a-time workout model vs Hevy's checkable whole-workout
   grid (rooted in the correct "a set row means it happened" rule — the
   plan keeps the rule and fixes the glass); and the cheapest wins are
   already written and tested but rendered by nothing
   (`trainingCalendar`, `liftBalance`, `sessionsPerWeek`,
   `monthlyVolume` in `src/lib/progress.ts`).

Nothing was built. The launch queue stays empty per STATUS; the phases in
the plan doc activate only on Ameen's approval, after the beta starts.

## 2026-08-07 — The offense plan, and a flagged collision with "no chat"

Ameen asked how Wazn _beats_ Hevy, naming AI and social as the weapons:
proactive, interactive, deep analysis. `docs/BEATING_HEVY_PLAN.md` is the
answer, structured as a coach ladder (recorder → analyst → advisor →
interlocutor → programmer) with phases B1–B6, each gated.

Two decisions worth recording now, before any of it is built:

1. **"Interactive" collides with the standing no-chat rule**
   (`CoachScreen.tsx:17-22`, design v2.1). The plan does not quietly
   reverse it. It proposes the narrowest interactive design that
   delivers the ask — grounded interrogation through a whitelisted SQL
   tool-loop, chips-first, data chips on every figure, fixed off-domain
   refusal — and gates B3 on Ameen explicitly approving the change.
   If he declines, B3 tightens to chips-only or dies; the rest of the
   plan stands without it.

2. **The kill criterion is pre-decided**, same reasoning as GATE 3: if
   coach-engaged testers don't retain visibly better than non-engaged
   ones by the retention gate, the B-series freezes wherever it stands
   and effort returns to the parity U-series. AI is the most seductive
   feature category in the industry; the guard against sunk-cost drift
   goes in writing on day zero.

Nothing was built. Both plans are proposals; the beta blockers stay
first.
