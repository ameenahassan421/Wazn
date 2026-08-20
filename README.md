# Wazn

Wazn (Arabic: وزن, "weight") is a mobile-first strength-training log. One job:
get a set recorded in under 30 seconds, phone in one hand, between sets.

Production web: <https://www.trywazn.app>

## This README does not track feature state

On purpose. The last one claimed "three screens" and "49 tests" for most of the
two weeks after both stopped being true. What exists today, what is half-built, and
what is next live in **`WAZN_PLAN.md` section 7.0**, which is the authoritative
current-state block. Verify it against the database before quoting it; it has
gone stale before, and `.claude/hooks/session-start.sh` prints how stale it is.

## The project is mid-migration to one codebase

Wazn is consolidating onto **Expo** (Expo Router + NativeWind), shipping iOS,
Android and web from a single tree via react-native-web.

| where                             | what it is                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mobile/`                         | the Expo app. Its own npm package, its own lockfile.                                                                                 |
| `src/lib/`                        | portable domain (units, Epley, coach, readiness). Survives.                                                                          |
| `src/screens/`, `src/components/` | the Vite PWA. Being ported, then retired.                                                                                            |
| `scripts/build_seo_pages.mjs`     | 110 English and 110 Arabic exercise pages, 222 files with the two indexes. Imports nothing from `src/`; unaffected by the migration. |

`src/lib/portable.ts` is the only door between the two apps: `mobile/` resolves
`@wazn/domain` to it. `src/lib/tokens.ts` is the colour source of truth for
both stacks. Do not hand-edit `mobile/tailwind.config.js` colours.

## Setup

1. Create a Supabase project.
2. Apply **every** file in `supabase/migrations/` in filename order, 0001
   through the highest. Applying only `0001_init.sql` leaves you 27 migrations
   behind the schema the app expects.
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. Anything named `VITE_*` is inlined into the
   browser bundle, so the service-role key never gets that prefix, never goes
   in the client, and never goes in Vercel. It is for local scripts only.
4. Auth email templates in `supabase/email_templates/` must contain
   `{{ .Token }}`. The app verifies a typed 6-digit code and never follows a
   magic link. `npm run supabase:admin -- set-smtp` then `set-templates`
   pushes them; Supabase ignores template writes until custom SMTP is set.

Seeding from a Hevy export: sign in first so the auth user exists, then
`npm run import:hevy -- --user <uuid>`.

## Run it

Web (Vite):

```bash
npm install
npm run dev        # http://localhost:5173
```

Native and web via Expo:

```bash
cd mobile && npm ci
npm run ios        # or: npm run android, npm run start
```

## Checks

```bash
npm run lint       npm run typecheck    npm test          # vitest
npm run format     npm run build        npm run test:smoke  # playwright
npm run check:sql          # applies every migration to a throwaway Postgres
npm run check:migrations   # parse-only floor, needs `pip install pglast`
```

```bash
cd mobile && npm run typecheck && npm run bundle:ios   # tsc is not a build
```

That list is illustrative, not exhaustive. **`.github/workflows/ci.yml` is the
real wall** and it runs more than this. Read it before pushing rather than
trusting any list written in prose, including this one.

## Rules that fail the build

- **Logical CSS properties only.** `ms-`, `ps-`, `start-`, `text-start`. Never
  `ml-`, `pl-`, `left-`, `text-left`. ESLint enforces it so the Arabic locale
  keeps working.
- **Weight is stored in kilograms, always.** The lbs/kg toggle is display only.
  Never round the stored value.
- Dark-first, one accent (ember `#e8491d`). No gradients, shadows, or emoji.

## Where the documentation lives

| file                                   | what it holds                                              |
| -------------------------------------- | ---------------------------------------------------------- |
| `WAZN_PLAN.md`                         | the plan. Section 7.0 is current state.                    |
| `DECISIONS.md`                         | every deviation and why, dated.                            |
| `CLAUDE.md`                            | working rules, traps, and the commands that lie.           |
| `PRODUCT.md`, `DESIGN.md`, `LAUNCH.md` | product shape, design system, launch.                      |
| `docs/`                                | setup guides (auth, agents, domain) and design philosophy. |
