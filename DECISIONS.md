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
