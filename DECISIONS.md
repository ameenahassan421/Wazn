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
