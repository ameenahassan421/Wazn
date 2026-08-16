# v5 "Momentum" — P0 implementation plan

**Status: awaiting Ameen's approval. No implementation code has been written.**

`STARTING_PROMPT.md` asks for "a P0 implementation plan mapping each P0 item to
the exact repo files you will touch — and wait for my approval on that plan
before writing code." This is that plan.

P0 as the README defines it: **tokens + type ramp swap, tab bar, Home hunt
card, Live zones + BANK IT, rest canvas ring** — "all restyles of shipped
logic".

---

## What is already aligned

Verified against the repo, not assumed. These need no work and should not be
touched:

| v5 requires | repo today |
|---|---|
| `em #e8491d` — the one accent | `--color-accent: #e8491d` — identical |
| `emInk #1c0e08` | `--color-accent-ink: #1c0e08` — identical |
| `soft #f4a68c` small accent text | `--color-accent-700: #f4a68c` — identical |
| Hairline-ring elevation, never border | `@utility ring-edge { box-shadow: var(--ring-hairline) }` |
| Tab bar 58px, six tabs, that order | `--tab-bar-height: 58px`, `TabBar.tsx`, same order |
| Hanken Grotesk + IBM Plex Mono self-hosted | `public/fonts/`, byte-identical to the handoff's copies |
| Logical properties only | ESLint-enforced |
| Tabular numerals | `.tnum`, enforced by review |

The ember accent surviving verbatim is the single biggest reason this is a
restyle and not a rewrite.

---

## The one number that decides P0's size

**267 hardcoded `text-[Npx]` classes across 41 files.** The named ramp
(`text-figure`, `text-title`, `text-nano`) is used **8 times total**. The type
system is almost entirely bypassed today.

v5's rule is absolute: *"the entire ramp; no other sizes exist."* Of the sizes
currently in use, these have **no step in v5 at all**:

| size | uses | | size | uses |
|---|---|---|---|---|
| 15px | 39 | | 22px | 5 |
| 12px | 11 | | 26px | 5 |
| 18px | 7 | | 19px | 3 |
| 20px | 3 | | 16px | 3 |
| 29px | 2 | | 34px | 2 |
| 27px | 1 | | 54px | 1 |

**81 call sites use a size v5 does not have.** Each is a judgement — 15px body
text becomes `body` (14) or `label` (13), and which one is a design decision
per site, not a find-and-replace.

This is the item most likely to be underestimated, and it is why P0 is
proposed as four PRs rather than one.

---

## P0 in four PRs

Each is reviewable against the reference HTML at 430px side by side, per
fidelity rule 7.

### PR 1 — Tokens, fonts, and the ramp *(the foundation; nothing visual ships alone)*

**Files:** `src/index.css` · `public/fonts/` · `src/components/Wordmark.tsx` ·
`src/components/wordmark-latin-paths.ts` · `tailwind` theme block in
`src/index.css`

1. **Palette inversion.** v5 is dark-first on a warm iron ground; the repo's
   default is paper. New tokens: `bg #0f0d0a`, `sur #181510`, `sur2 #211d15`,
   `line rgba(236,231,220,0.08)`, `line2 …0.16`, `text #ece7dc`, `mut #9a927f`,
   `faint #615b4d`.
   **Open question for Ameen — see below.** The repo supports a light/dark
   toggle today (`theme-context.tsx`); v5 specifies one dark theme.
2. **Brass ramp, new and scoped.** `brass #b08d3e` / `brassSoft #d9bc7a` /
   `brassBg rgba(176,141,62,0.18)`. This is a deliberate second hue and the
   README asks that any third use be flagged in review. Proposal: add an
   ESLint rule or a `check:` script so "brass only on rank / duel opponent /
   record-pace / target-beaten" is enforced rather than remembered.
3. **Saira Semi Condensed, self-hosted.** Verified fetchable from this
   environment (latin subset, 12,252 bytes at weight 700). Self-hosted per the
   Egyptian-mobile-data rule — never a Google Fonts CDN link in production.
   Weights 500/600/700.
4. **The ramp as the only sizes.** Ten steps replace eight, and only `label 13`
   and `nano 9` survive unchanged. Added as named utilities so the 267 call
   sites can migrate onto names rather than new numbers.
5. **The wordmark is Saira 700 in v5.** `wordmark-latin-paths.ts` holds Sora
   outlines baked as SVG paths — those are wrong for v5 and must be regenerated
   from Saira or replaced with live text. Flagging early because it is easy to
   miss inside a "font swap".

**Gate:** the app still builds and every screen renders; no screen is *correct*
yet. This PR is deliberately not beautiful on its own.

### PR 2 — The ramp migration *(81 judgement calls, 267 sites, 41 files)*

**Files:** the 41 files carrying `text-[Npx]`.

Mechanical where the size maps 1:1 (11 → `meta`, 13 → `label`, 14 → `body`,
17 → `title`, 10 → `kick`, 9 → `nano`). The 81 orphans get decided per site
against the reference HTML, and the decisions get recorded in `DECISIONS.md`
rather than buried in a diff.

**Gate:** `grep -rE "text-\[[0-9]+px\]" src/` returns nothing, and a
screenshot pass shows no screen has silently changed weight or rhythm.

### PR 3 — Tab bar + Home hunt card

**Files:** `src/components/TabBar.tsx` · `src/components/TodayBrief.tsx` ·
`src/screens/LogScreen.tsx` · `src/components/StatTiles.tsx`

Tab bar is a restyle only — 58px and the six labels already match; the change
is ground `#0b0906`, `nano` labels, the 2px ember top rule on the active tab.

The hunt card is the bigger piece: kicker `TONIGHT · PUSH DAY`, `BEAT
{lastVolume}` as `hero`, the coach sentence + chip, `START THE HUNT` at 56px.
The **bench rank card and duel card are new surfaces with new schema** — they
are P2 in the README's build order and are explicitly *not* in this PR.

**Gate:** home at 430px matches `Wazn v5.html` screen 06, minus the rank and
duel cards.

### PR 4 — Live zones, BANK IT, rest canvas ring

**Files:** `src/components/SetEntry.tsx` (702 lines) ·
`src/components/RestCanvas.tsx` · `src/lib/rest-canvas.ts` ·
`src/components/WorkoutOverview.tsx`

The highest-risk PR in P0, because it is the core loop:

- Full-bleed stepper: 82px side zones, `mega 84` weight, `56` reps.
- Fixed `BANK IT` commit bar, 70px, with the live `BANK IT · 125 × 8` label.
- **GATE U2 is non-negotiable**: repeat-set commit stays 1 tap. This gets an
  explicit test, not an eyeball.
- Rest canvas becomes a full-screen ring that **fills** as rest elapses. Worth
  noting the repo already documents "the ring fills, it does not drain" — v5
  agrees, so this is geometry, not a behaviour change.
- The momentum bar is listed under P1 in the README; excluded here.

**Gate:** GATE U2 test green; airplane-mode session still passes
(LAUNCH.md §4); rest canvas matches screen 08.

---

## Explicitly NOT in P0

Momentum bar · PR full-screen moment · toasts · finish verdict · History /
Progress / Body / Coach / Friends / Settings restyles · coach-volume wiring ·
onboarding · Hevy import surface · rank ladder · duels · Ask-the-coach Edge
Function · SQL forecasts · week review generation · Arabic RTL.

---

## Three things I need decided before PR 1

1. **Does v5 replace the light theme, or become the dark theme?**
   The README says *"dark-first; this theme replaces the current paper-default
   for v5"*, which reads as replacement — but the repo ships a working
   light/dark toggle in Settings and `theme-context.tsx`, and v5's Settings
   screen (17) does not list a theme control. If v5 replaces both, the toggle
   and its persisted preference get removed, which is a data-visible change.
   **My reading: v5 is the only theme and the toggle goes.** Confirm before
   PR 1, because it changes the token structure.

2. **Is v5 a replacement for v3, or the next layer on it?**
   v3 currently stands at 11/13 acceptance and 4/5 GATE V3. Its two open
   items are progress photos and the degraded-render review — and v5 restyles
   every screen those live on. Finishing v3 first would mean doing that work
   twice. **My recommendation: declare v3 closed at its current state, record
   the two open items as superseded, and let v5's own acceptance list govern.**

3. **The 81 orphan type sites.** I can decide each against the reference HTML
   and log the calls, or hold them for your review. Deciding them myself is
   faster and is what fidelity rule 2 implies ("match its nearest sibling in
   the bundle and note the assumption"). **Proposing I decide and log.**

---

## What is verified and what is not

**Verified by running it:** every token comparison above; the 267/41/81 counts;
Saira's fetchability and byte size; that all four handoff fonts are identical
to `public/fonts/`; that all seven P0 target files exist.

**Now verified, after this plan was first written:** both references render at
430px and have been looked at. See below — getting there was not free.

---

## The references could not render, and now can (`npm run v5:render`)

Fidelity rule 3 is *"open them in a browser at 430px and measure against
them"*. As shipped, that is impossible in this environment and would be
impossible in CI:

1. **`unpkg.com` is blocked by the egress policy** (`CONNECT tunnel failed,
   response 403`). The bundle loads React, ReactDOM and Babel Standalone from
   it. The page rendered as a blank iron ground with **no page error** — a
   missing entry point looks exactly like a working app with nothing in it.
2. **The entry component is an inline `<script type="text/babel">` block** at
   the end of each HTML file. Transforming only the external `.jsx` files left
   React loaded and nothing mounted — still blank, still no error.
3. **Saira was falling back to a generic sans.** The whole face is condensed,
   so every type measurement taken against that render would have been wrong
   while looking perfectly plausible.

`scripts/render_v5.mjs` (`npm run v5:render`) assembles a rewritten copy in a
temp directory: React UMD from `node_modules`, JSX pre-transformed by esbuild
(already a vite dependency — no new install), and Saira self-hosted. **The
bundle itself is never modified** — it is normative, and `.prettierignore`
keeps the formatter off it too.

Saira is now self-hosted at `public/fonts/saira-semi-condensed-{500,600,700}-latin.woff2`
— 37 KB for all three weights, which the Egyptian-mobile-data rule requires
anyway and which P0's PR 1 needs regardless.

**What the render confirms:** the layout claims in this plan hold, brass reads
correctly as earned metal (rank name, rank bar, the opponent's duel bar), and
the six-tab bar and hunt card match the README's description. The per-PR split
above stands.

**What it does not do:** I have looked, not measured pixel-by-pixel against
each implemented screen. That comparison belongs in each PR, which is what
rule 3 actually asks for.
