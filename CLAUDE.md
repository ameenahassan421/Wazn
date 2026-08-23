# Wazn — working notes for Claude

> **`WAZN_PLAN.md` is the source of truth for this project.** Read it in full
> at the start of every session, along with `DECISIONS.md` and **§7.0**, the
> authoritative current-state block. (§7.1 below it is a chronological log that
> contradicts itself in places. §7.0 wins, and the database beats both.) Do not begin work until you know which
> phase is active and what its gate is. This file is the working notes; where
> the two disagree, the plan wins.

Mobile-first strength-training PWA. The job it does: log a set in under 30
seconds, one hand, mid-workout. Every decision serves that.

## Read the banner, not the file (2026-08-19)

**§7.0 has lied before and it will lie again.** On 2026-08-19 it was nine
commits stale: PRs #103, #104, #105 and #106 merged code to `main` and not one
of them touched `WAZN_PLAN.md`, so the authoritative state block still said
"rest canvas takeover DECIDED 2026-08-17, not built" after #103 had shipped it,
and still named that takeover as the "next action" after it was done. Local
`main` was meanwhile eight commits behind `origin/main` with no sign of it.
Nothing was broken. The _record_ was broken, which is worse, because every
session after that one starts by reading it.

Two hooks now close that loop. Both are in `.claude/settings.json` and both are
checked in, so every session and every machine gets them.

- **`.claude/hooks/session-start.sh`** fetches, then prints computed state
  before you read anything: where HEAD sits against `origin/main`, how many
  commits have landed since `WAZN_PLAN.md` was last edited, which remote
  branches hold unmerged work, and any open PR (another session may be
  mid-flight; do not rebuild its work). **When the banner says section 7.0 is
  stale by N commits, reconcile it against the code and the database before you
  build anything.** The banner is derived, so it cannot go stale; the file can.
- **`.claude/hooks/status-guard.sh`** runs on Stop. If the session has
  committed changes under `src/`, `mobile/`, `supabase/migrations/` or
  `supabase/functions/` and never touched `WAZN_PLAN.md`, it exits 2 and blocks
  the stop. Uncommitted scratch work gets a one-line reminder instead of a
  wall. **This is not a formality to route around.** §6 already required the
  update and four consecutive sessions skipped it anyway; the hook exists
  because the written rule did not hold.

Corollary that supersedes the blockquote above: read `WAZN_PLAN.md` §7.0, but
treat it as a _claim_ to verify, not a fact to recite. The database beats the
file, and `git log` beats both.

**A TRUNCATED search that decides whether something EXISTS is the same bug.**
On 2026-08-21 a session ran `grep -rn "export function.*plate|perSide" src/lib/*.ts | head -5`,
saw no plate module, and wrote `src/lib/plates.ts` from scratch — over a
tested one that had shipped in stage 1. `platesFor` matched the pattern and
sat below the cut. **`head` on a search whose answer is "does this exist" makes
absence indistinguishable from truncation.** Grep first, then narrow.

**`cmd || echo "no"` turns a crashed check into a confident wrong answer.**
On 2026-08-20 two sessions disagreed about whether a commit existed only on one
laptop. The one that said "not on the remote" had run
`git merge-base --is-ancestor <sha> <sha>` inside a checkout that had never
fetched, so the second object was simply absent; git failed on the missing
object, the `||` branch printed the negative, and a missing-object error read
as a definitive "this work exists nowhere else". The near-miss was a
recommendation to protect a directory that was already fully merged.

Two rules, and the second is the one that matters. **Fetch before trusting any
ref, including refs you are reading out of somebody else's checkout.** And when
a shell check decides something destructive, **make the failure branch say
"could not determine" rather than the negative answer**. `|| echo "NO"` and
`|| echo "unknown"` cost the same to write and only one of them can get
somebody's work deleted.

**Subagents do not reliably honour "read-only".** On 2026-08-19 an audit
subagent that had been told, in its prompt, not to edit anything ran
`git checkout -- CLAUDE.md` and destroyed the parent session's uncommitted
work. Commit before you fan out, or accept that you will lose the diff.

## Code review (2026-08-19)

Three review paths, in ascending cost. Project-scoped in
`.claude/settings.json`, so they arrive with the repo.

- `/code-review`, the built-in. Reviews the working diff, a PR number, or a
  branch, at a chosen effort level. **Run it before EVERY PR. Not "the default",
  not "when it feels warranted" — every one.**

  This line said "this is the default before opening a PR" from 2026-08-19, and
  on 2026-08-21 a single session opened EIGHT PRs and ran it zero times. A
  default that is skipped eight times in a row is not a default, it is a
  suggestion. Ameen made it a rule on 2026-08-22 after a parallel session's
  capability audit found seven defects, three of them in a file written four
  hours earlier that had shipped with "verified on a device" in its commit
  message.

  The reason it matters here specifically: CI answers "is this correct", and
  every defect found that night had already passed a green CI. Nothing in the
  pipeline asks "is this good", and this is the only thing that does.

- `/review-pr` and the six `pr-review-toolkit` agents (`code-reviewer`,
  `silent-failure-hunter`, `code-simplifier`, `comment-analyzer`,
  `pr-test-analyzer`, `type-design-analyzer`). Reach for a single agent when
  the concern is specific; `silent-failure-hunter` is the one this repo has
  historically needed, since 0027's `revoke` and the invented-lift guard both
  succeeded loudly and did nothing.
- `/code-review ultra`, a multi-agent cloud review of the branch. Ameen has to
  trigger it; Claude cannot.

**A green wall is not a review, and this repo has the receipts.** Lint,
typecheck, 818 tests, a production build and Playwright were all green while
Arabic rendered its numbers backwards, while `revoke all ... from public` did
nothing, and while every one of the eleven v5 P0 findings sat unnoticed. Run a
review on anything a user will see.

The `expo` plugin is installed for `mobile/` work: `api.expo.dev` is 403 from
this org's egress proxy, so its offline skills are the way to answer SDK and
build questions without the network.

## A green wall cannot see a native build phase (2026-08-23)

**Adding Sentry passed every gate in the repo and broke the iOS build.** Lint,
typecheck, 1,281 web tests, 46 mobile tests, `bundle:ios` and `bundle:android`
were all green. `xcodebuild` then failed with:

```
error: An organization ID or slug is required (provide with --org)
** BUILD FAILED **
```

`@sentry/react-native`'s config plugin injects TWO Xcode build phases, one for
source maps and one for debug symbols, and both shell out to `sentry-cli`,
which needs an org, a project and an auth token. None of the green checks run
an Xcode build phase. `expo export` produces a JS bundle and stops well short
of them, which is the same lesson as "`npm run typecheck` in mobile is not a
build", one rung deeper: **`bundle:ios` is not a build either.**

**Removing the plugin from `plugins` would NOT have helped**, and the reason is
already written down two sections below: `@sentry/react-native` ships an
`app.plugin.js`, so Expo autolinks it from `node_modules` whether or not it is
listed. The same trap as `expo-apple-authentication` and `expo-notifications`.

The lever is an environment variable, `SENTRY_DISABLE_AUTO_UPLOAD=true`, and it
is set in every profile in `mobile/eas.json`. Uploading source maps is a
release nicety that needs credentials; reporting crashes needs only the DSN, so
turning the upload off costs nothing that matters until there is a Sentry org
to upload to. A local build needs it too:

```bash
cd mobile
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild \
  -workspace ios/Wazn.xcworkspace -scheme Wazn -configuration Debug \
  -destination 'platform=iOS Simulator,id=<udid>' \
  -derivedDataPath ios/build build
```

**Run a real `xcodebuild` after ANY change to `app.config.ts`'s `plugins`.**
A config plugin edits the native project, and nothing in `npm run` can see it.

## A silent tool is not a negative answer (2026-08-23)

**Twice in one session a check that returned nothing was reported as proof the
thing did not exist, and both were wrong.** This is the same failure the
`head`-truncation note above describes, arriving through two new doors.

**A grep decided a setting was off.** `defaults read com.apple.dt.Xcode | grep
-i "mcp|externalAgent|IDEIntelligence"` found nothing, and that became "the
external-agent toggle has never been turned on". The key is
`IDEAllowUnauthenticatedAgents` and it was already `1`. Ameen restarted Xcode on
the strength of it. **When a search's answer decides whether something EXISTS,
the pattern failing to match and the thing being absent are indistinguishable —
so widen the pattern or dump the whole set before concluding.**

**And a stdio MCP server returned zero bytes because stdin closed.**
`printf '...' | xcrun mcpbridge` sends its lines and immediately EOFs; the
server shuts down before it can reply. Twice this was read as "the bridge
answers nothing". Hold stdin open and it answers instantly:

```bash
{ printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"p","version":"1"}}}'
  sleep 2
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  sleep 1
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 5
} | xcrun mcpbridge
```

**`notifications/initialized` is required between `initialize` and the first
request** — the spec says so, and without it `tools/list` returns nothing while
`initialize` succeeds, which looks exactly like a server with no tools.

**MCP tools bind at session start.** A session that registers a server cannot
call it; that takes a restart. So "the tools are not there" after an `mcp add`
is expected, not a fault.

## A working tool can be aimed at the wrong tree (2026-08-23)

**There WERE two clones of this repo on the Mac, and Xcode's MCP bridge had the
one nobody works in open.** Consolidated 2026-08-23; kept here because the trap
is general and the wreckage is still visible in the tool output.

```
/Users/ameenhassan/Wazn            the work, and now the only clone
/Users/ameenhassan/Developer/Wazn  main, six commits behind        <- what Xcode had
```

Different inodes, not a symlink. So `BuildProject` would have built, cleanly and
confidently, a tree with no account deletion, no supersets, no RPE and no
`sim_tap.sh`. **A tool that is broken tells you. A tool aimed at the wrong thing
agrees with you.**

**`XcodeListWindows` returns `workspacePath`. Read it before believing any
answer the bridge gives**, and pass the matching `tabIdentifier`. It still lists
a `windowtab1` for the workspace that was deleted, because a stale Xcode window
outlives the directory under it, so the tab list is not a list of things that
exist.

The same question applies to anything else holding a path. Metro was serving the
right clone here, but only `lsof -a -p <pid> -d cwd -Fn` proved it, and the
answer could have gone either way. The credentials were the sharper version:
`.env.local` and `mobile/.env.local` existed ONLY in the clone nobody works in,
so `~/Wazn` had no Supabase configuration at all and the running app worked
anyway, on vars exported into the shell that started Metro. `ps eww -p <pid>`
is how you find that out.

**And two static checks failed open in the same session**, which is the section
above arriving through two more doors.

- **`nm`/`strings` over the installed `.app` binary found no `ExpoKeepAwake`.**
  It also found no `ExpoHaptics`, in an app whose haptics work. Expo modules are
  not strings in the main binary, so the search could never have succeeded.
  **The control run is what caught it: search for something you KNOW is there,
  and if that comes back empty too, the technique is wrong, not the answer.**
- **`curl http://localhost:8081/index.bundle` returned 5.2 KB** of
  `UnableToResolveError` JSON, because expo-router's entry is not `index`.
  Grepping that for `useKeepAwake` reported zero, which reads exactly like "the
  edit is not in the bundle". **Check the SIZE before grepping a fetched
  artefact.** The real one is `/.expo/.virtual-metro-entry.bundle?platform=ios`
  and it is 13.8 MB.

Grepping a served bundle is, otherwise, the cheap way to prove a running app has
your change rather than a cached one, and it is stronger than a screenshot when
the package was previously unused: zero call sites means zero presence in the
dependency graph, so one match is proof.

## A screenshot cannot press a button (2026-08-23)

**`scripts/sim_tap.sh` taps the booted simulator.** It exists because two
defects in `3791d9c` were invisible to lint, tsc, 1,296 tests and both bundles
and were caught by LOOKING at a screenshot — and the next class down, a control
that renders correctly and does nothing when pressed, needs a tap.

`xcrun simctl` has no tap verb, and neither does Xcode's MCP bridge. Three
things that do not work, so nobody re-derives them:

- **`osascript ... click at {x, y}` fails with -25204**, even with accessibility
  granted. Keystrokes work (that is how `Cmd+D` and reload are sent); clicks do
  not. `brew install cliclick` is the answer.
- **The Simulator does not expose the app's accessibility tree to macOS.**
  `every UI element whose description contains "Superset"` finds nothing; only
  the Simulator's own chrome (Home, Volume, Sleep/Wake) is enumerable. Tapping
  is by coordinate, and the script converts device points to screen points from
  the live window rather than a hardcoded origin.
- **`idb` is not installed** and is far heavier than this.

Two traps. **Activate the Simulator BEFORE reading its window geometry**, or
the read fails with "Invalid index" and the arithmetic produces a NEGATIVE
screen coordinate rather than an error — the script now says "could not
determine" instead, per the rule two sections up. And **if React Native's
element inspector is on, every tap INSPECTS instead of pressing**, which is
indistinguishable from a dead control. `Cmd+D` then tap "Toggle Element
Inspector" at device point `200 419`.

**Reaching a screen you cannot navigate to:** `xcrun simctl openurl <udid>
"wazn://session/new"` prompts with "Open in Wazn?" when the app is already
running, and there is no way to dismiss that prompt without a tap. Terminate
the app first and the same URL cold-launches straight into the route.

## A workflow that stops is usually interrupted, not stuck (2026-08-23)

**A `Workflow` run died and looked exactly like a hang for forty minutes.** Two
runs the same afternoon: the first finished all 17 agents; the second returned
4 of 19 and then nothing. The output file sat at 0 bytes, two processes were
still alive in `ps`, and the obvious reading was a deadlock.

It was not. Every one of the four agents that never came back ends its
transcript with `[Request interrupted by user]`, **all four stamped at the same
second**. A session-level interrupt (Ameen sending a message mid-turn, or
Ctrl+C) kills the in-process subagents. The completed run has zero of those
markers, which is the whole diagnosis in one grep:

```bash
grep -c "Request interrupted" <transcriptDir>/agent-*.jsonl
```

Two things follow, and the second is the one that matters.

**`parallel()` is a barrier, and an interrupted agent never resolves.** Not to
a value, not to `null`, not to a rejection. So the barrier waits on a promise
that can no longer settle, and the run hangs until something kills it. The four
agents that HAD returned were already in the journal and were thrown away with
everything else, because the script never reached its `return`.

**So do not put a bare `parallel()` in front of anything expensive.** Race every
agent against a deadline so a dead one degrades to `null` instead of stopping
the run:

```js
const withDeadline = (p, ms = 600_000) =>
  Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])

const results = (
  await parallel(ITEMS.map((it) => () => withDeadline(agent(it.prompt, opts))))
).filter(Boolean)
```

`pipeline()` is the better default anyway, for the reason the tool's own docs
give: one stuck item stops its own chain rather than the whole phase.

**And read `journal.jsonl`'s mtime, not the process list, to tell working from
dead.** A live PID proved nothing here; the journal had not been written in
forty minutes and that was the real signal. `ps` says a process exists. It does
not say it is doing anything, which is the same lesson as the `npm ci` that
exited 0 having installed two packages of 599, and the `playwright install`
that reached 100% and then sat at 0% CPU forever. **Three silent failures in
one session, all of which looked alive.** Check the artefact, never the flag.

## Skills first (Ameen, 2026-08-04)

Before starting any task, search the session's available skills and load the
relevant one with the Skill tool — do the task unassisted only when no skill
covers it. Known fits: **`impeccable` for any UI/frontend work** (its design
hook also fires automatically on Edit/Write of UI files and on Stop — wired
in `.claude/settings.json`; manage with `/impeccable hooks`),
**`wellness-app-design` for anything about what to build or how a flow
should behave** — workout-tracker UX judgment, Hevy parity questions,
retention mechanics, roadmap sequencing (pairs with `impeccable`: that one
executes pixels, this one supplies the domain), `canvas-design`
for visual/brand/logo art, `supabase-postgres-best-practices` before touching
anything in `supabase/migrations/`, `dataviz` before writing any chart,
`frontend-slides` / `pptx` / `docx` / `pdf` for documents. The brand
direction for the mark lives in `docs/design-philosophy.md` ("Loaded Ink") —
read it before redrawing any logo asset. **The mark as drawn now is the
plate used as the letter `a`**, which is that lineage arriving in the
interface rather than a departure from it: `docs/design/prototype/` for the
reference, `mobile/src/components/ui/Plate.tsx` for the four variants.

## Non-negotiables carried from WAZN_PLAN.md §2

These are reproduced verbatim so they survive even if the plan is not read.

6. **Critical review is mandatory.** Do not implement specs blindly,
   including this file. Where a better approach exists (schema, library,
   UX, query design), implement it and log the deviation with reasoning
   in `DECISIONS.md`. Ask first only when a change is destructive to
   existing data or auth.
7. **Phase gates are hard stops.** Finish a phase, report against its
   acceptance list, STOP, wait for Ameen's approval. Never start the
   next phase unprompted.
8. **Do not rotate or modify API keys.** Key rotation is handled by
   Ameen separately, before any non-owner user touches the app.

## Commands

```bash
npm run dev          # vite dev server
npm test             # vitest, 1204 tests in 85 files, no network needed
npm run lint         # eslint (includes the RTL guard below)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build
npm run format       # prettier
```

Before pushing: `npm run lint && npm run format:check && npm run typecheck && npm run check:vercel && npm run check:type && npm run check:coverage && npm test && npm run build && npm run test:smoke`.

**That list is not the whole wall, and this line used to claim it was.** CI's
`check` job also runs `check:migrations`, `check:sql` and `deno check` on the
Edge Functions. E1 was pushed green on the old list and failed on
`check:coverage` — every module in `src/lib` needs a test file or a written
exemption, and a new one with neither fails. Read
`.github/workflows/ci.yml` rather than this paragraph when it matters.

**`npm run test:smoke` is now IN the list, and it was not on 2026-08-16.**
`npm test` is vitest; Playwright is a separate job and a separate command.
v5 PR 4 renamed the commit bar from "Log set N" to "Bank set N"; the vitest
queries were updated, `grep -rn "Log set" src` came back with only comments,
and `e2e/` is not `src/`. Three GATE 4 airplane-mode tests timed out waiting
for a button that no longer had that name, on main, after the PR was merged
before its own CI finished. **A copy change is an API change to every selector
in `e2e/` and `scripts/` — grep the repo, not the source tree.**

**Touching `vercel.json`?** `npm run check:vercel` is the only thing in the repo
that reads it. A `"//"` comment key in a rewrite once made Vercel reject every
deploy — main included — while CI stayed green and production quietly froze on
the previous build. JSON has no comments; put the reasoning in `DECISIONS.md`.

**Touching `supabase/functions/`?** Merging to `main` now deploys them
(`.github/workflows/deploy-functions.yml`). Before that existed, "merged" and
"live" were different things and a fix could sit on `main` for a day while
production served the bug.

**Touching `supabase/migrations/`?** Run **`npm run check:sql`**. It starts a
throwaway local Postgres, applies `scripts/pg_shim.sql` (the `auth` schema, the
platform roles, the default privileges) and then every migration in order from
an empty database, and finishes by running the suites in `supabase/tests/`. No
network, no project, no credentials. CI runs it too. It runs **three** of the
four files there — `coach_surfaces`, `rls_own_rows`, `body_and_coach`. A new
suite is not run until it is added to the loop in `scripts/check_sql.sh`.

`npm run check:migrations` (needs `pip install pglast`) still parses everything
with the grammar Postgres itself uses, and it is still the cheap floor — 0007
once shipped a column named `position`, a reserved word, which failed to parse
in its entirety. But a parser is not a server: 0021 shipped a
`default (select auth.uid())` that parses perfectly and that every real
Postgres rejects, and an `order by` on a column its own subquery had aliased
away. Both died on the first execution.

**Executed locally is still not applied.** "Applies cleanly from empty" and
"applies cleanly to production" are different claims; the PR should say which
one it has. Production is at **0040** as of 2026-08-23.

**And a migration file in this directory is not evidence it ran.** 0025 added
`user_preferences.theme` on 2026-08-12 and was never applied; the column was
absent from production until 0040 on 2026-08-23, and no migration ever dropped
it. Two sessions read the file, concluded the column existed and had been
dropped, and wrote that into WAZN_PLAN. `information_schema` is the answer to
"does this exist", not `ls supabase/migrations/`.

**And applied is still not verified.** `apply_migration` answers
`{"success": true}` for DDL that did nothing useful. 0027's
`revoke all … from public` executed, succeeded, and left the function callable
by a signed-out request. Read `information_schema` / `has_function_privilege`
afterwards, and run `get_advisors`: Supabase's own linter found that one in
under a minute and the repo's SQL suite, which tested only that the functions
worked, did not.

**This paragraph blamed the wrong half, and a sibling comment doing the same
caused a second defect on 2026-08-22.** TWO grants reach `anon`. Postgres itself
grants EXECUTE on every new function to PUBLIC (the `=X/postgres` entry with an
empty grantee in `proacl`), and Supabase grants anon, authenticated and
service_role DIRECTLY on top via `alter default privileges`. 0027 removed the
first and forgot the second.

**The repo already knew this and one comment unlearned it.**
`0007_progress_analytics.sql:122` says it outright, and has since 2026: "revoke
from public first, since functions are created with execute granted to public by
default." 0006, 0011, 0012 and 0021 all revoke from both. Then 0028 fixed 0027's
missing anon revoke correctly, wrote down "Supabase does not grant EXECUTE
through PUBLIC … and the first line is a no-op", and 0030 read that sentence and
shipped `public.e1rm` anon-callable. 0031 is the missing line.

**Revoke from BOTH, and assert the end state rather than the statements.**
`supabase/tests/coach_surfaces.sql` now carries two checks: six named functions
asserted anon-denied and authenticated-allowed, and, more importantly, a sweep
that fails when ANY non-extension function in `public` still carries the PUBLIC
grant and is not on a written grandfathered list. The named list is a regression
guard and could never have caught `e1rm`, because a new function is on no list
the day it ships. The sweep was verified by deleting 0031 AND removing `e1rm`
from the named list, and it still failed on exactly that function.

**A test that asserts behaviour will never catch a grant that reads correctly
and does nothing. Assert the privilege.**

## Hard rules

- **Logical properties only.** No `ml-`, `pl-`, `left-`, `text-left`. Use `ms-`,
  `ps-`, `start-`, `text-start`. ESLint fails the build otherwise. The app will
  grow an Arabic RTL locale.
- **Weight is stored in kg, always.** The header lbs/kg toggle is display only,
  rounded to 0.5 lb / 0.25 kg. Never round the stored value.
- **Paper-first, one accent (ember `#e8491d`), since 2026-08-20.** This line said
  "dark-first… no shadows" until Ameen's prototype replaced v5 Momentum. The
  ground is `#f7f3ec`, cards are white with a hairline ring AND a 1px lift, the
  display face is **Sora**, every control is a pill, and the CTA carries an
  ember glow. Nothing else is coloured, no gradients, no emoji, no decorative
  illustration. Numbers render large and tabular. Touch targets ≥ 48px.
  **`src/lib/tokens.ts` holds both systems**: `palette`/`type` are current and
  native reads them, `legacy*` exist only for the dying PWA's `index.css` and
  go at phase A4. The mark is the **plate used as the letter `a`** —
  `mobile/src/components/ui/Plate.tsx`, four variants, one job each.
- **Paper-first is not paper-only, since 2026-08-23.** This rule said "the ONE
  dark surface is the rest canvas" and native now has a full dark theme (Ameen:
  "choosing between dark mode and light mode is just standard"). Nothing about
  the paragraph above changes: paper is the default ground and the whole system
  is still one accent, no gradients, no shadows beyond the card lift.
  **Never write a colour literal, and never import `palette` in `mobile/`.**
  `usePalette()` from `@/hooks/use-theme` is the only door; the static
  `palette` export is `palettes.light` and reading it pins a surface to one
  ground. That failure is completely silent in the light theme, which is the
  theme every screenshot is taken in.
  **`ink` and `onInk` SWAP between grounds and every call site stays correct**,
  because the inverted card's job is inversion rather than darkness: dark on
  paper, light on iron. So does the status bar, whose `style` names the colour
  of the system GLYPHS and therefore reads backwards. Both places that set it
  derive it (`app/_layout.tsx` from the scheme, `RestCanvas.tsx` from its
  opposite). A hardcoded `light` there already shipped once and rendered the
  clock and battery at 1.05:1 for weeks.
- **The reference is `~/Downloads/Wazn Prototype.html`, and its extracted
  source is in `docs/design/prototype/`.** `docs/design/v5-momentum/` is
  history. Read the source, not a screenshot: the bundle unpacks with a dozen
  lines of Python and every size, colour and radius is a literal in it.
- **Auth offers four ways in — never a magic link.** Ameen's decisions
  2026-08-07 (see DECISIONS.md, including the explicit reversal of the
  old no-passwords rule): (1) **Google sign-in**, the hero path once its
  OAuth client exists (`docs/auth-social-setup.md`); (2) **Apple
  sign-in** at Stage 4B with the developer account — MANDATORY in the
  iOS build the moment Google exists there (App Store rule);
  (3) **email + password** sign-up/sign-in, with code-based password
  recovery (no recovery links — same reasoning as no magic links) and
  every hardening Supabase offers on our tier; (4) the **6-digit email
  code** (`signInWithOtp` + `verifyOtp`) as the passwordless option —
  do not remove it. Sign-in fields accept a **username** as an alias
  for the email on any non-social path: resolved server-side, address
  rendered only masked, identical response whether the username exists
  or not. The email templates in `supabase/email_templates/` must
  contain `{{ .Token }}` or code flows are impossible. **`magic_link.html` is not a
  magic link and the filename alarms people.** `magic_link` is Supabase's
  fixed template slot for `signInWithOtp`; the file contains only
  `{{ .Token }}` and its subject is "{{ .Token }} is your Wazn sign-in code"
  (`scripts/supabase_admin.ts:83`). It sends the 6-digit code. Verified
  2026-08-19. Do not "fix" it.
- **The service-role / secret key is script-only.** Never in a `VITE_*` var,
  never in the client, never in Vercel.

## Scope

**Scope is `WAZN_PLAN.md` section 4. Anything not in a stage needs a `DECISIONS.md`
entry naming who asked.**

This heading used to carry a "do not build without being asked" list. By 2026-08-19
eleven of its twelve items had been built, every one of them authorised by a later
stage and logged, so the list was dead text that a session could read as governance.
A list that is 92% wrong is worse than no list.

**The active stage is 4A, One App.** One Expo codebase for iOS, Android and web; the
Vite PWA retired at the end; v5 implemented in full inside the migration because the
port and the restyle are the same edit. The filter that decides what is worth building
on any given day:

> **`src/lib` survives the migration. `src/components` and `src/screens` do not.**

Work in `src/lib` is banked. Work in the screens and components is rented, and every
v5 P1 item built on the web is built twice.

**Anything AI/LLM.** Stage 8 in the plan describes what would get built and
how, but it is conditional on the Gate 1 backlog actually asking for it — an
idea is not evidence. If you do build it: open weights with a genuinely
permissive licence, the key lives in an Edge Function and never a `VITE_*`
var, the model never sits on the critical path, and no model output is written
to the database without the user pressing something. Statistics answer anything
statistics can answer.

## There are TWO apps now (2026-08-16)

`mobile/` is an Expo Router native app, and it is a **separate npm package with
its own lockfile**. Do not add a `workspaces` key to the root `package.json`;
that changes how Vercel installs.

**NativeWind was removed 2026-08-20 and must not come back without a reason.**
It was fully wired — babel preset, metro transform, `tailwind.config.js`,
types — and the app used `className` **zero times**, because the UI resolves
through `src/design/Txt.tsx` and `src/components/ui/`, in plain JS. React
Native picks a font cut by family NAME and a utility class cannot express that,
so the ramp was never going to be classes here. What it cost: Tailwind pinned
to 3.4 (the ONLY reason the two packages needed separate Tailwind majors), a
transform over every file including the shared domain modules, and a
`cssInterop` on `Pressable` that dropped a function `style` and rendered every
button in the app invisible for three days. Removing it changed the rendered
app by zero pixels, verified on a simulator.

```bash
cd mobile && npm ci
npm run typecheck        # tsc
npm run bundle:ios       # THE gate — real Metro + Babel + Hermes
npm run bundle:android
```

- **`src/lib/portable.ts` is the only door between the two apps.** Mobile
  resolves `@wazn/domain` to it via `mobile/metro.config.js`. Adding an export
  there is a decision; `portable.test.ts` walks the TRANSITIVE import graph and
  fails on any browser global. Domain shared, I/O adapted — `supabase.ts` and
  every `use-*` hook stay per-platform on purpose.
- **`src/lib/tokens.ts` is the palette's source of truth for BOTH stacks**, and
  native now imports it DIRECTLY through `@wazn/domain` — there is no generated
  copy any more. `npm run check:tokens` checks the two copies that cannot import
  TypeScript: `src/index.css` (against the LEGACY tokens, because the dying PWA
  still draws v5) and `mobile/app.config.ts`'s ground literal (because EAS reads
  that file without a bundler). CI fails on drift. It found three shipped
  defects on its first run, and a fourth on 2026-08-20 — a comment claiming it
  asserted the `app.config.ts` colour, which it had never opened.
- **Type is a component on native (`<Txt step="hero">`), not a class.** RN picks
  a font cut by family NAME, not weight — a `text-hero` carrying `fontWeight`
  renders Saira Medium and looks almost right.
- **Never give a `Pressable` a `style` CALLBACK.** `style={({ pressed }) => ...}`
  is React Native's own documented form and it was silently dropped here:
  NativeWind 4.2.6 applied `cssInterop` to `Pressable` for `className`, and the
  function did not survive it. **NativeWind is gone, so the callback would work
  again — the lint rule stays anyway, as a tripwire.** Re-adding NativeWind is a
  plausible future move, this failure mode is completely silent, and the codebase
  already has one consistent press pattern. The control renders with
  no background, no height, no padding and no `flexDirection`, and still takes
  taps. On 2026-08-20 EVERY button in `mobile/` was invisible for this reason —
  SIGN IN was a gap in the layout — through a green `tsc`, a green `eslint` and
  a green `bundle:ios`. Track the pressed state with `onPressIn`/`onPressOut`;
  `eslint.config.js` fails the build on the callback form now. **A screenshot
  was the only thing that could have caught it, and nearly did not, because the
  screen it broke was one nobody had looked at since it was written.**
- **`npm run typecheck` in mobile is not a build.** A broken babel preset, a bad
  metro alias, a missing font subpath and a babel/RN version fight are all
  clean to tsc and fatal to `expo export`. Bundle before claiming it works.
- **Rebuilding `mobile/ios/` takes two commands and the second one needs a
  locale.** `mobile/ios` is gitignored and regenerates, so it gets deleted
  whenever the Mac needs space. Bringing it back:

  ```bash
  npx expo prebuild --platform ios --clean
  cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
  ```

  **The locale is the whole story, and the first half of this note was wrong.**
  It said `expo prebuild` does NOT run `pod install`. On 2026-08-21 it did —
  and died with `Unicode Normalization not appropriate for ASCII-8BIT` from
  deep inside Ruby, which reads like a CocoaPods bug and is a shell encoding.
  So the failure is not "the workspace is absent because nothing installed
  Pods", it is "the install ran and crashed on the encoding", which looks
  completely different in the output and lands you in the same place: no
  `Wazn.xcworkspace`, and an `xcodebuild` failure that reads like a project
  problem.

  Set the locale for anything that can reach CocoaPods, not just for the
  `pod install` you type yourself. **`npx expo run:ios` shells out to
  `pod install` too**, in its own environment, so it fails the same way even
  when `mobile/ios/Pods` is already installed.

  **And `expo run:ios --device <udid>` does not mean "that simulator".** Given
  a simulator UDID it routed to the physical-device path and stopped on
  `No code signing certificates are available to use`, which is a confusing
  error for a machine with no device attached. Passing the device NAME did the
  same. What works is going straight to the tool underneath:

  ```bash
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 xcodebuild \
    -workspace ios/Wazn.xcworkspace -scheme Wazn -configuration Debug \
    -destination 'platform=iOS Simulator,id=<udid>' \
    -derivedDataPath ios/build build
  xcrun simctl install <udid> ios/build/Build/Products/Debug-iphonesimulator/Wazn.app
  ```

- **`api.expo.dev` and `reactnative.directory` are 403 from this org's egress
  proxy**, so `npx expo install` cannot resolve versions and EAS cannot run from
  a session. Read `node_modules/expo/bundledNativeModules.json` instead — it is
  the same version map, offline.

## Architecture

- `src/screens/` — Log (home), History, Progress, **Body**, Coach, Friends,
  Settings. No router: one `View` union in `App.tsx` and one `useState`.
- **There IS a tab bar again — six tabs, and this line said the opposite until
  2026-08-14.** The audit retired the five-tab bar on 2026-08-13 (S2, "five
  equal tabs for five unequal jobs"); design v3.0 brings back
  `Log · History · Progress · Body · Coach · Friends`, and Ameen confirmed the
  handoff wins. **The doors were kept.** Progress is still behind the Last PR
  card, Coach behind the coach brief, Settings behind the header avatar,
  Friends also from inside Settings, History also as the circle beside Start.
  A new screen still needs a door — `npm run shots` prints
  `no door to <screen>` when a route cannot be walked, and both harnesses
  press the CARDS rather than the bar on purpose: the bar either renders or it
  does not, and a run that navigated by it would pass on a build where every
  card door had silently stopped working. Body is the one screen reached by
  the bar, because it has no card.
- **The tab bar's height lives in ONE place: `--tab-space` in `index.css`.**
  Three sticky clusters clear it (the home's Start row, the focused view's
  commit cluster, the board's rest bar). Last time this arithmetic lived in
  three components, one of them kept its `+ 64px` after the bar was retired
  and floated a tab-bar's height above the screen. Do not inline the number.
- `src/lib/` — `supabase.ts` (client + `describeError`), `units.ts`,
  `epley.ts`, `unit-context.tsx`, `use-auth.ts`; and v3's layer:
  `coach-mode.ts` (mode + volume, and the two questions volume answers),
  `readiness.ts`, `ghost-reason.ts` (the adaptive ghost — the hero),
  `forecast.ts`, `body.ts`, `tell-coach.ts`, `streak.ts`.
- `supabase/migrations/0001_init.sql` — schema, RLS, and three security-invoker
  functions the app calls as RPCs: `exercise_usage`, `previous_session`,
  `exercise_1rm_history`.
- `scripts/import_hevy.ts` — one-time seed from `workouts_corrected.csv`.
  Transforms are exported and unit-tested; `main()` only runs when invoked
  directly.
- `scripts/supabase_admin.ts` — Management API config (SMTP, templates, site
  URL) so auth setup is a command, not a dashboard click-through.

Progress is lazy-loaded: recharts is half the bundle and the Log screen is the
hot path mid-workout. Keep it that way.

## State handling

`eslint-plugin-react-hooks` v7 forbids synchronous `setState` inside effects.
Where state must follow a prop, adjust it during render (see `SetEntry`), or
carry the owning id alongside the data so stale values are inert rather than
cleared by an effect (see `ProgressScreen`'s `series`, `LogScreen`'s
`previousFor`). Do not reintroduce a "loading" flag set inside an effect — child
effects run before the parent's, which silently broke the set auto-fill once.

## Environment facts

- Supabase project ref: `ttasiwxeqerhsztxjxip`
- Production: **https://www.trywazn.app** (Vercel, auto-deploys `main`).
  `workout-theta-plum.vercel.app` is an alias, NOT canonical. All 222 SEO pages
  currently canonicalise to the alias because `WAZN_SITE_URL` is unset in Vercel;
  that is a live defect, see WAZN_PLAN.md section 7.0.
- **Whether a session can reach Supabase is PER-SESSION. Check, do not
  assume.** When `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are in the
  environment, `https://api.supabase.com/v1/projects/$REF/database/query`
  answers — that is a Management API personal access token, and it can run
  arbitrary SQL, including DDL. Migrations 0020 and 0021 were applied that way.
  **The 2026-08-14 session had neither variable, and the Supabase MCP server
  needs an interactive OAuth flow a headless session cannot run** — so 0027 was
  written, proven against a local Postgres, and left unapplied. `env | grep -i
supabase` before promising anything about production. Direct Postgres (5432 /
  the 6543 pooler) is still NOT reachable in any session, so
  `scripts/run_sql.sh` and its `DATABASE_URL` remain a laptop-only path.
- **That token is production DDL access. Treat it as such.** Plan §2.6 makes a
  destructive change an ask, and applying a migration is a change to the
  database every user depends on: confirm before applying, verify against
  `information_schema` afterwards rather than trusting a success flag, and
  write what actually landed into STATUS. A `[]` response means "no rows
  returned", not "it worked".
