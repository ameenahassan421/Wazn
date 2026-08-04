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
