# Handoff, written 2026-08-17

> Read `CLAUDE.md`, `WAZN_PLAN.md` §7.0 and `DECISIONS.md` first. This file does
> not replace them. It is what one session learned that is not yet written
> anywhere else, plus the ordered backlog.
>
> **Verify before you trust this.** It was accurate when written and the repo
> moves fast. `git fetch` and `git log --oneline main..origin/main` before
> believing any claim here. A previous session wrote a whole plan against a
> `main` that was 70 commits stale, and it cost a closed PR and two wrong
> DECISIONS entries.

---

## 1. Where the work is

**PR #101**, branch `claude/forecast-dst-span`, pushed, five commits, CI green
when last checked. It is not merged.

| Commit    | What                                                                |
| --------- | ------------------------------------------------------------------- |
| `76dd5e5` | Forecast DST fix. A live production bug                             |
| `a8fe65e` | The live board: stepper zones, momentum bar, BANK IT, plus 16 tests |
| `277a65f` | Em-dashes out of user-facing copy                                   |
| `3cfdfff` | Recorded the simulator test account                                 |
| `a6ce50e` | Screen 08's rest canvas                                             |

`main` was at `737656d` when this branch was cut.

## 2. The architecture, and one design that was tried and lost

**One repo, two apps, one shared domain.**

- `src/` is the Vite web PWA, live at trywazn.app.
- `mobile/` is the Expo Router app. Its own `package.json`, its own
  `node_modules`, its own `package-lock.json`, its own CI job.
- `src/lib/portable.ts` is a curated barrel and **the only door between them.**
  Metro and `mobile/tsconfig.json` both alias `@wazn/domain` to it.
- `src/lib/portable.test.ts` walks the TRANSITIVE import graph and fails if a
  barrel module reaches a browser global however indirectly. That is the guard.
  Respect it.

**The rule is "domain shared, I/O adapted."** Supabase is deliberately NOT
shared: the web keeps its session in `localStorage`, native in the keychain via
`expo-secure-store`, and one client would have to pretend those are the same
thing.

**Do not rebuild `packages/core`.** A parallel session built an npm workspace
with 41 modules moved out of `src/lib` and 185 imports rewritten, with purity
enforced by a no-DOM tsconfig. It lost on two counts and was abandoned: the
graph-walking test is a stronger guard for zero file moves, and sharing the
Supabase client was the wrong goal. Written up in `DECISIONS.md` 2026-08-17.

## 3. What is done

**v5 P0 is complete on both stacks.** Tokens and the ten-step ramp, the tab
bar, the Home hunt card, the live zones with BANK IT, and the rest canvas.

**The Expo app runs.** First time on 2026-08-17. `iOS Bundled, 1887 modules`.
The sign-in screen renders correctly: Saira wordmark with the ember `a`, iron
ground, mono kickers.

Roughly **8 of the 23 v5 build-order items**.

## 4. The backlog, in the order I would do it

### 4.1 The offline queue on native. Do this first

The riskiest thing in the project and the one real gap in the live board.
`mobile/src/state/live-workout.ts` says so in its own header: a failed insert
increments `unsynced` and **nothing retries it.** The board in memory is truth
and there is no persistence at all, so killing the app mid-workout loses
everything not yet inserted.

The web solved this and the pieces are already shared: `write-queue` is in
`portable.ts` and its storage is injected, which is exactly what lets native
hand it SQLite where web hands it IndexedDB. `checkpoint.ts` is NOT shared
(it reads `localStorage`) and needs a native equivalent.

**Read `DECISIONS.md` on PR #99 before starting.** GATE 4's checkpoint rung was
broken on `main` for a long time in a way that looked flaky: `LogScreen` read
the checkpoint queue in exactly one branch, and three different things could
deliver a session so the test passed sometimes. The lesson that matters here:
**an import-only sweep cannot see behaviour carried in argument lists.** Six
`restoreQueue(...)` call sites were the whole fix.

### 4.2 The five empty tabs

`history`, `progress`, `body`, `coach`, `friends` are 21 lines each: a header,
a kicker, and an empty state with LAUNCH.md copy. They need their data layer.
`useHome` in `mobile/src/hooks/` is the pattern to follow, including its
seeded-state-not-corrected-by-an-effect shape, which `react-hooks` v7 requires.

### 4.3 v5 P1

PR moment, coach toasts, finish verdict, coach-volume wiring. None exist on
either stack.

### 4.4 v5 P2

Onboarding restyle, the Hevy import surface, the rank ladder and duels, and the
Ask-the-coach Edge Function.

**Migration 0029 DOES NOT EXIST.** `mobile/src/hooks/use-home.ts` line 26 claims
it is "written but NOT applied". That is false and was verified: migrations stop
at 0028 and no commit on any branch ever added one. Fix that comment while you
are there. P2 is two steps out, not one.

### 4.5 v5 P3

Forecasts in SQL, week review generation, and the Arabic RTL pass on native.
Note native RTL goes through `I18nManager`, which needs an app restart to flip,
so it is a behaviour change from the web's `dir` toggle and worth flagging to
Ameen rather than deciding.

## 5. Open decisions that are Ameen's, not yours

1. **The rest canvas takeover.** Screen 08 wants a full-screen takeover ON
   COMMIT; do-not-regress #3 requires the repeat-set commit to stay one tap.
   Both cannot hold. It was wired and measured once and broke three of the seven
   do-not-regress items. The native canvas deliberately leaves it unwired.
2. **Per-exercise rest on native.** Currently a flat 120s constant. The web
   resolves it via `resolveRest` from the exercise plus the user preference.

## 6. Environment, verified 2026-08-17

- **Xcode 26.6 works.** iOS 26.5 runtime installed, simulators available.
  `xcrun simctl list devices available` answers.
- **The app runs via Expo Go**: `cd mobile && npx expo start --ios`.
  `mobile/.env.local` holds `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` and is gitignored. Without it the app boots
  to its config-error screen.
- **A test account exists**: `simulator@trywazn.app`, created confirmed. The
  password is in this session's history, not in the repo. Ask Ameen.
  **The user count is 8 now and the eighth is a robot.** §7.0 warns against
  reading account counts as a signal; subtract it.
- **`SUPABASE_ACCESS_TOKEN` in `.env.local` is a 7-character placeholder.** The
  Management API is unreachable. The ANON key works fine and the
  SERVICE_ROLE key works against the auth admin API. Only DDL is blocked.
- **Disk was full** at 491 MB free and it stopped everything including Bash
  writing its own output. Freed to 7.7 GB. If it happens again the reclaimable
  things are the npm cache and `~/Library/Caches`, but **not**
  `~/Library/Caches/ms-playwright`, which is the Playwright browsers the smoke
  job needs.
- **Screenshots**: the simulator MCP screenshot exceeds the image size limit.
  Use `xcrun simctl io <udid> screenshot out.png` then `sips -Z 900` and read
  the smaller file.

## 7. Traps this session hit, so you do not

- **`npm run test:smoke` and CI's `check` job are not the same wall.** CI also
  runs `check:migrations`, `check:sql` and `deno check`. Read
  `.github/workflows/ci.yml` rather than any prose about it, including this.
- **Port 4173 collides between worktrees.** `playwright.config.ts` sets
  `reuseExistingServer: !process.env.CI`, so if another tree has a preview
  server up your run silently tests THAT bundle. Check with
  `lsof -nP -iTCP:4173 -sTCP:LISTEN` if results contradict the source.
- **The em-dash hook scans the whole file, not the diff.** `DECISIONS.md` has
  700+ pre-existing em-dashes, so it fires on every edit there regardless of
  what you wrote. Check your own added lines before believing it: diff the
  file, keep only added lines, and grep those for U+2014.
- **The hook does not fire on Bash heredocs.** Two DECISIONS entries got written
  with em-dashes that way. Prefer Edit/Write for prose.
- **Lint checks code, not rendered copy.** Three em-dash violations sat in
  user-facing strings until somebody looked at the running app. §7.0 records the
  same lesson from a screenshot Ameen took. **Look at the app.**
- **The RTL lint is real and it will catch you.** Physical properties
  (`borderLeftWidth`, `marginLeft`) fail the build. Use `borderStartWidth`,
  `marginStart`.
- **`mobile/` has no test runner.** If you write logic worth asserting, it
  belongs in `src/lib` behind `portable.ts`, not in a component. That is how
  `live-board.ts` got its 16 tests.

## 8. Ameen's standing rules that bite most often

- **No em-dashes anywhere**, including app copy. Periods, colons, commas,
  parentheses.
- **Weight is stored in kg, always.** The lbs/kg toggle is display only.
- **Phase gates are hard stops.** Finish, report against the acceptance list,
  stop.
- **Critical review is mandatory.** Implement the better approach and log the
  deviation in `DECISIONS.md`. Ask first only when the change is destructive to
  existing data or auth.
