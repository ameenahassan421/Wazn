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
