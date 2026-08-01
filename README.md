# Workout

A mobile-first strength-training log. One job: get a set recorded in under 30
seconds, phone in one hand, between sets.

Three screens, nothing else:

- **Log** — start a workout, pick an exercise, punch in weight and reps. The
  previous session for that exercise sits above the input, and each new set is
  pre-filled with the last one.
- **History** — reverse-chronological workouts; tap one to expand its sets.
- **Progress** — pick an exercise, see estimated 1RM over time (Epley:
  `weight × (1 + reps / 30)`), one point per workout.

Stack: React + Vite (installable PWA), Supabase (Postgres, email OTP auth, row
level security), Tailwind, deployed on Vercel.

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   in full. It creates the tables, indexes, RLS policies, the profile
   bootstrap trigger, and three read helpers (`exercise_usage`,
   `previous_session`, `exercise_1rm_history`).
3. Under **Authentication → Providers → Email**, make sure email is enabled.
   Then under **Authentication → Emails**, ensure the sign-in template contains
   `{{ .Token }}` — that is the 6-digit code. The app calls `signInWithOtp` and
   verifies the code in the app; it never uses magic links. If the template
   only has `{{ .ConfirmationURL }}`, the email will not carry a code.

### Data model

| table          | columns                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `profiles`     | `id` → `auth.users(id)`, `display_name`, `created_at`                                                                          |
| `exercises`    | `id`, `name`, `muscle_group`, `equipment`, `is_custom`, `owner_id`                                                             |
| `workouts`     | `id`, `user_id`, `name`, `started_at`, `ended_at`                                                                              |
| `workout_sets` | `id`, `workout_id`, `exercise_id`, `set_number`, `weight_kg`, `reps`, `rpe`, `duration_seconds`, `distance_meters`, `set_type` |

Weight is stored in kilograms, always. The lbs/kg switch in the app header is
display only (rounded to the nearest 0.5 lb / 0.25 kg); stored values stay
exact.

### Row level security

- `profiles`, `workouts`, `workout_sets` — readable and writable only by the
  owning user. `workout_sets` is scoped through its parent workout.
- `exercises` — any authenticated user can read rows where `owner_id is null`
  (the seeded catalogue) or `owner_id = auth.uid()`. There is no insert policy:
  v1 has no custom exercise creation.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| variable                    | where it is used   | notes                                                                                                |
| --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | client             | Project Settings → API → Project URL                                                                 |
| `VITE_SUPABASE_ANON_KEY`    | client             | anon/public key. Safe to ship; RLS protects the data.                                                |
| `SUPABASE_URL`              | import script only | same URL, without the `VITE_` prefix                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | import script only | **bypasses RLS.** Never prefix it with `VITE_`, never commit it, never put it in the Vercel project. |

Anything named `VITE_*` is inlined into the browser bundle. The service-role
key must never be.

## 3. Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

| script                            | what it does                                         |
| --------------------------------- | ---------------------------------------------------- |
| `npm run dev`                     | Vite dev server                                      |
| `npm run build`                   | typecheck, then production build                     |
| `npm run preview`                 | serve the built app                                  |
| `npm run typecheck`               | `tsc --noEmit`                                       |
| `npm run lint`                    | ESLint (React hooks rules, plus the RTL guard below) |
| `npm run format` / `format:check` | Prettier                                             |
| `npm test` / `test:watch`         | Vitest                                               |

`.github/workflows/ci.yml` runs lint, format check, typecheck, tests and a
build on every pull request. The build step passes placeholder Supabase
credentials on purpose: with none set, the app stops at the "not configured"
screen and the authenticated screens are tree-shaken out, so a build error in
them would never surface.

### Tests

49 tests, no database or network needed:

- **`src/lib/units.test.ts`** — kg storage round-trips, display rounding to
  0.5 lb / 0.25 kg, formatting.
- **`src/lib/epley.test.ts`** — the 1RM formula, and the exclusions (warmups,
  sets missing weight or reps).
- **`scripts/import_hevy.test.ts`** — runs the importer's real transforms over
  the checked-in CSV: date parsing across CDT/CST and the spring-forward day,
  131 + 3 exercise coverage, every name mapped to one of the eleven allowed
  muscle groups, unit conversions, and the errors it raises rather than
  importing something wrong.
- **`src/components/SetEntry.test.tsx`** — the set-entry form: auto-fill from
  the previous session (including the case where the fetch resolves after the
  first render), unit conversion of a typed draft, validation messages, and the
  steppers.

### Layout rule enforcement

ESLint fails on physical direction utilities in `className` (`ml-`, `pl-`,
`left-`, `text-left`, …). Use the logical equivalents — `ms-`, `ps-`, `start-`,
`text-start`. This app is meant to grow an Arabic RTL locale, and the rule is
there so that stays true without anyone remembering it.

### Supabase tooling for Claude Code

`.mcp.json` registers the Supabase MCP server for this project. After cloning,
run `/mcp` inside Claude Code, select **supabase**, and authenticate — the
config carries no credentials. Supabase agent skills are vendored in
`.agents/skills/` (symlinked from `.claude/skills/`).

## 4. Seed your history — sign in first, then import

The import needs a real auth user to own the data, and that user only exists
after a first sign-in. **Order matters:**

1. Run the app (`npm run dev`), sign in with your email and the 6-digit code.
   This creates the row in `auth.users` and, via the trigger, in `profiles`.
2. Copy your user id from **Supabase → Authentication → Users**.
3. Run the import with that id:

```bash
npm run import:hevy -- --user 00000000-0000-0000-0000-000000000000
```

Optional flags: `--csv path/to/file.csv` (defaults to `workouts_corrected.csv`
in the repo root). `IMPORT_USER_ID` and `IMPORT_CSV` work as env vars instead.

Running the import before signing in fails on the `user_id` foreign key — the
script says so explicitly.

### What the import does

Source: `workouts_corrected.csv` (a cleaned Hevy export) in the repo root.

1. **Exercises** — seeds one row per distinct `exercise_title` (131), plus three
   program lifts that never appear in the export: Hanging Knee Raise, Chin Up,
   Chest Supported Row (Machine). 134 total. Equipment comes from the
   parenthetical suffix (`(Barbell)`, `(Dumbbell)`, `(Cable)`, `(Machine)`;
   anything else is bodyweight, or `other` for cardio machines). Muscle groups
   come from the hardcoded table in [`scripts/muscle_groups.ts`](scripts/muscle_groups.ts),
   normalised to exactly: chest, back, shoulders, biceps, triceps, quads,
   hamstrings, glutes, calves, core, cardio.
2. **Workouts** — rows grouped by `start_time` (149 workouts). Dates are parsed
   as `America/Chicago` and stored as `timestamptz`. `title` → `workouts.name`.
3. **Sets** — 3197 rows. `set_index` → `set_number`, `weight_lbs` → `weight_kg`
   (× 0.453592, 2 dp), `distance_miles` → `distance_meters` (× 1609.34,
   integer), plus `reps`, `rpe`, `set_type` and `duration_seconds` as-is. Rows
   with a duration and no reps (cardio, planks) import with those fields
   populated. No other transformation is applied — the CSV is final.
4. **Ignored columns** — `description`, `exercise_notes`, `superset_id`. There
   are no columns for them.
5. **Idempotent** — workouts are keyed on `(user_id, started_at)`. On a re-run
   each workout's sets are deleted and reinserted rather than upserted
   individually, because `set_index` is not unique within a workout (an
   exercise can be revisited in the same session). Re-running produces the same
   134 / 149 / 3197 counts.

The script runs server-side only, with the service-role key. It is never
imported by the client bundle.

## 5. Deploy to Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new). The Vite
   preset is detected automatically (build `npm run build`, output `dist`).
2. Add **only** the client variables under Settings → Environment Variables:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Do not add the
   service-role key — the import is a local, one-time script.
3. Deploy. `vercel.json` rewrites all routes to `index.html` so the SPA handles
   its own routing.
4. On the deployed URL: iOS Safari → Share → _Add to Home Screen_; Android
   Chrome → menu → _Install app_. It launches standalone with its own icon.

## Notes

- Dark theme only, one accent colour, tabular figures. It is used in a gym.
- Layout uses CSS logical properties throughout (`margin-inline-start`,
  `padding-inline`, `text-align: start`) and `dir="ltr"` on `<html>`, so an RTL
  locale can be added later without touching layout.
- Not in this slice: routines/templates, rest timers, offline sync, custom
  exercises, social features, a settings screen, per-set editing.
- If an RPC returns 404 right after running the migration, reload PostgREST's
  schema cache: Supabase → Settings → API → **Reload schema cache**.
