# v5 "Momentum" P0 gate report

**Date:** 2026-08-17. **Commit:** `1b7859f`.
**Verdict: CLOSED at 4/11 acceptance.** P0 does not pass as written. Eight of
its PRs merged with no stop between them, and this is the first time the
acceptance list has been read against the running app. The full close, with
every unmet item classified, is the last section of this document.

Nothing here is a regression. The wall is green, the three rebuilt screens are
recognisably v5, and every deviation below is either a logged call or a gap
nobody has looked at yet. The point of the report is that the difference
between those two categories was not written down anywhere, and four items in
the second category were found by looking at pixels rather than by any check.

---

## How this was verified

| method | what it covers |
| --- | --- |
| `npm run lint` | logical properties, RTL rule. **0 errors, 4 warnings** |
| `npm run check:type` | the ramp. **no off-ramp font sizes in `src/`** |
| `npm run check:tokens` | **16 colours, 10 type steps agree** across `index.css`, `tokens.ts`, `mobile/tailwind.tokens.js` |
| `npm run check:coverage` | 54 of 64 `src/lib` modules tested, 10 exempt with reasons |
| `npm test` | **1196 passed, 85 files** |
| `npm run shots` | 121 screenshots, six screens x 390/430 x populated/empty, EN and AR |
| `npm run v5:render` | the reference bundle at 430px, no page errors |
| Supabase Management API | production counts, grants, advisors, read only |

The pixel comparisons below are `shots/v5-430-app.png` (reference) against
`shots/full-430-log.png`, `shots/active-430-entry.png` and
`shots/active-430-restexpanded.png` (the app), all at 430px.

---

## The acceptance list, item by item

| # | item | verdict |
| --- | --- | --- |
| 1 | 430px match: type steps, palette, radii, hairline ring, 18px gutter | **partial.** Ramp and palette pass by tooling. Six layout deviations on Home, listed below |
| 2 | one mono chip per AI sentence; brass only on rank / duel / record-pace / target-beaten | **pass, vacuously.** The chip grammar holds. Nothing on web renders brass at all, so the second half is untested |
| 3 | ghosts with ▲/→/↓; recalc once; BANK label live; momentum bar flips brass at 100% | **fail.** Ghosts and the live label are correct. **There is no momentum bar on web** |
| 4 | rest canvas full-screen, ring fills, next set + reasoning chip + momentum chip, dismisses on tap, never blocks | **partial.** See below |
| 5 | PR full-screen on a true e1RM record; rank pill on crossing; no double-fire | **fail.** Not built (P1) |
| 6 | Tell the coach returns only a proposed edit; absent outside a workout | **not assessed.** `TellCoachSheet.tsx` exists and is v3-era. Not restyled, not re-tested here |
| 7 | coach volume Full / Quiet / Off wired exactly | **partial.** `coach-mode.ts` holds the logic and is tested. The P1 surfaces it gates do not exist yet |
| 8 | onboarding matches screens 01 to 05 | **fail.** P2, not started |
| 9 | forecast absent under 8 sessions; dashed projection; one plateau card max | **logic passes.** `forecast.ts` is tested. Screen 13 is not restyled, so the rendering half is unverified |
| 10 | no `ml-/pl-/left-`; tnum; no red; silent timer; nothing over 200ms or behind a spinner | **pass on the enforced half.** Lint is clean. The 200ms claim has no harness |
| 11 | LAUNCH.md end to end on a second account, including airplane mode | **blocked.** Needs a real phone. Unchanged from §7.0 |

Four of the eleven pass. Three are partial, three fail on work that is
correctly scheduled for P1 and P2, and one is blocked on hardware.

---

## What the screenshots found that no check could

### Home (screen 06), six deviations

1. **The three stat tiles are the wrong three.** The reference is `STREAK ·
   THIS WEEK · SESSIONS`. The app renders `WEEK · STREAK · FREEZE`. PR 3
   recorded "StatTiles needed nothing" after confirming the component was
   already `kicker` + `text-num`, which is true of its typography and says
   nothing about its payload. The reference's own README lists the three by
   name.
2. **The plan list is missing.** Screen 06 ends with numbered rows (`01 Bench
   Press (Barbell) … 5 SETS`). The app shows a `LAST PR` card there instead.
   The rank and duel cards were explicitly deferred to P2. The plan list was
   not, and it was not built.
3. **Two start controls.** The card's `START THE HUNT` and a sticky `Start
   workout` pill both sit on the screen. The reference has one. The sticky row
   is v3's and nothing retired it.
4. **The tab bar draws glyphs; the reference does not.** PR 3 restyled the
   bar's ground, rail and label colours and carried the v3 glyphs across
   without deciding them. The reference render is text only.
5. **The avatar's polarity is inverted.** Reference: dark disc, light letter,
   hairline ring. App: solid cream disc, dark letter.
6. **The header is a banded surface.** The reference floats the wordmark on
   the page ground with no bar and no edge.

### Live (screen 07)

The stepper zones, the hairline rows and the ember commit bar are right, and
the ghost chips (`▲ +5.5`, `▼ −5.5`) are correct. Missing against the spec:
the **momentum bar** (known, P1), the **status strip** (elapsed, TELL THE
COACH, FINISH), and the **exercise header** (`title 26` plus `SET n / m ·
LAST 120×8 · ▲ +5`). The app carries a plate card, a Set/RPE/superset chip
row, a session list and a cream rest bar that the reference does not have. The
cream rest bar is the loudest of these: it is the only light surface on a dark
screen, and screen 08 is supposed to be where rest lives.

### Rest canvas (screen 08)

Closest of the three. Full-screen at `fixed inset-0`, the 250px ring, the
`REST` kicker, the mega countdown and `TAP TO GO EARLY` all match, and the
ring fills rather than drains. Three gaps: the **momentum chip is absent**
(it depends on P1), the next-set block renders as one sentence rather than
`NEXT` plus the lift name plus figure 38 plus a separate reasoning chip, and
the surface **carries inputs** (minus 30s, plus 30s, skip rest, a collapse
chevron) where the spec says passive, silent, no inputs.

Note also that `RestCanvas.tsx` is the inline next-up card and
`RestExpanded.tsx` is screen 08. The names invert what the design calls them,
which is worth knowing before anyone greps for the wrong one.

---

## One finding outside the acceptance list

**The em-dash sweep only reached native.** Commit `277a65f` took em-dashes out
of three `mobile/` files. `src/lib/i18n.ts` still holds **83**, most of them in
sentences a user reads, and screen 08's own kicker sets the word REST, an
em-dash, then THE COACH IS THINKING. Ameen's standing rule is that em-dashes
never ship.

This is deliberately not fixed here. CLAUDE.md's own warning applies: a copy
change is an API change to every selector in `e2e/` and `scripts/`, and that
exact mistake cost three GATE 4 tests on `main` the day before yesterday. It
needs its own PR with the greps done first.

---

## What is now decided

**The rest canvas takes over the screen after working sets only** (Ameen,
2026-08-17). Warm-ups keep the current tap-to-open behaviour, where rest is
short and the hand stays on the phone. Reasoning and the build spec are in
`DECISIONS.md` under today's date. This closes the question P0 #5 left open and
is the first build after this gate.

---

## CLOSED at 4/11 acceptance (Ameen, 2026-08-17)

P0 is closed at partial. It is not signed off as "matches the reference",
because it does not, and recording it as anything else would make this document
worthless to the next person who reads it.

Closed follows the form v3 was closed in (DECISIONS.md 2026-08-16, PR 1's
second decision): a numbered verdict, and **every unmet item classified rather
than dropped**. Nothing below is abandoned.

### Carried into P1, already in its scope

These were never P0 work. They fail the acceptance list because the list spans
the whole design, not one phase. No new work is created by carrying them.

| item | lands with |
| --- | --- |
| 3. momentum bar, and its brass flip at 100% | P1 momentum bar |
| 5. PR full-screen moment | P1 PR moment |
| 7. coach volume Full / Quiet / Off wired | P1 coach-volume wiring |
| 9. forecast rendering (the logic already passes) | P1 screen 13 restyle |

### Carried into P1, NEW and on no list before today

**This is the part the close exists for.** Every row here was found by
screenshot on 2026-08-17 and appears in no plan, no PR description and no
backlog. Carried explicitly so they cannot be lost.

| finding | screen | lands with |
| --- | --- | --- |
| stat tiles are `WEEK · STREAK · FREEZE`, reference is `STREAK · THIS WEEK · SESSIONS` | 06 | P1, Home |
| numbered plan list rows missing | 06 | P1, Home |
| two competing start controls (card CTA and the sticky pill) | 06 | P1, Home |
| tab bar draws glyphs; reference is text only | 06 | P1, needs a call first |
| avatar polarity inverted | 06 | P1, Home |
| header is a banded surface; reference has no bar | 06 | P1, Home |
| status strip missing (elapsed, TELL THE COACH, FINISH) | 07 | P1, live screen |
| exercise header missing (`title 26` + `SET n / m · LAST …`) | 07 | P1, live screen |
| cream rest bar is the only light surface on a dark screen | 07 | P1, resolves with the takeover |
| next-set block is one sentence, not `NEXT` + figure 38 + chip | 08 | P1, rest canvas |
| screen 08 carries four inputs where the spec says none | 08 | **decide with the takeover build** |

### Carried into P2

| item | lands with |
| --- | --- |
| 8. onboarding, screens 01 to 05 | P2 onboarding |

### Blocked, unchanged

| item | on |
| --- | --- |
| 11. LAUNCH.md end to end on a second account, airplane mode included | a real phone. §7.0's blocked list |

### Not assessed

Item 6, Tell the coach. `TellCoachSheet.tsx` is v3-era and was neither
restyled nor re-tested in P0. It needs someone to look at it, which is not the
same as a decision, and it should not be recorded as either a pass or a fail.

### Outside the acceptance list, carried

The web em-dash sweep. Its own PR, greps first, because a copy change is an API
change to every selector in `e2e/` and `scripts/`.

### What is NOT carried, because it is already decided

The rest canvas takeover, after working sets only. Decided 2026-08-17, spec in
DECISIONS.md, and it is the first build after this gate rather than a P1 item.

### A note on the handoff's own checkboxes

`STARTING_PROMPT.md` holds the eleven items as unticked boxes and they stay
unticked. It is part of the normative design bundle, not a tracker, and the
fidelity rules say the bundle is the requirement rather than a working file.
The verdicts live here instead.
