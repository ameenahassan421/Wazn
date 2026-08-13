# Rebuild stage: adopting the prototype's world

Authorized by Ameen 2026-08-12 ("GO"), with loop-through execution: each
phase is reported with screenshots when it lands, and work continues without
blocking on approval. Ameen can stop or redirect at any report. Destructive
changes (database, auth) still stop and ask; nothing in this stage should
need one.

Decision context: DECISIONS.md 2026-08-12 ("Direction decided"). The world
is the prototype's, dark-first. Ember replaces amber as the single accent.
The وزن mark stays canonical with its iron recolored; the Latin lockup faces
the interface. Coach is template statistics, never an LLM on the logging
path.

What "adopt dark-first" means against the existing v2 token system: the
ground ramp (ink, surface, raised, line) is already the warm near-black the
world wants and is deeper than the prototype's, which is better on OLED. It
stays. The identity carries in the accent hue, the typography, and the
interaction upgrades.

## Phases

**R1: Tokens, type, logo.**
Ember ramp (9 steps, hue held at ~14) replaces the amber ramp under the same
token names, so every consumer moves at once. Contrast note that changes
usage: ember-500 on ink is ~4.7:1 (chrome and large text), not amber's ~9:1;
small accent text moves to ember-300. Typography: Sora (display, titles,
figures: the numerals voice) and Hanken Grotesk (body, labels) replace Plex
Sans; IBM Plex Mono keeps the meta voice, same as the prototype. Both new
faces self-hosted as latin variable woff2 in public/fonts, precached like
everything else; Google Fonts stays out of the app. Logo iron recolors amber
to ember via scripts/build_logo.py; manifest theme_color, share-card canvas,
chart hues, and every hardcoded amber hex follow. PRODUCT.md's design
constraint block updates to match.
Gate: every screen screenshot-verified in EN and AR; full CI wall green.

**R2: The logging screen in the new world.**
Rest presented as the inline chip pattern from the prototype (the full-page
timer becomes the expansion); the workout board, set rows, steppers, and
overview re-dressed in the new type scale; inline PR moment kept at commit.
No schema changes. Gate: the 30-second one-hand log is measurably unharmed;
screenshots EN/AR.

**R3: Home, History, Progress, and coach statistics.**
Remaining screens re-dressed. The coach block ships as template-driven lines
computed from existing RPCs (previous_session, exercise_1rm_history): last
session delta, ramp suggestion, PR proximity. Strings live in the i18n
catalogue, EN and AR. No model calls anywhere. Gate: screenshots EN/AR, wall
green.

**R4: The paper theme.**
The prototype's light world as a selectable theme (user_preferences already
stores locale and unit; theme joins them). Dark stays default. Gate:
both themes pass the same screenshot pass; contrast holds AA in both.

## Not doing in this stage

Warm-up ramps as data (needs routine schema thought, its own decision),
Apple/Google auth, payments, social, anything Stage 4B. The prototype page
at /prototype stays as-is as the reference artifact.

## Status

- R1: built 2026-08-12, PR open. Ember ramp under the old token names with the small-text rule enforced (accent-300 for anything 14px and under), Sora/Hanken/Plex Mono triad wired through the size tokens with zero component changes, logo iron and share card and SEO pages and privacy page recolored, PRODUCT.md and CLAUDE.md updated. Verified: 38-shot EN gallery both widths, AR pre-auth spot check, wall green except the known lazy-screen Node 26 case.
- R2: built 2026-08-12, PR open. Reduced on evidence: the incumbent rest bar already implements the chip pattern's intent with better mechanics than the prototype (deadline-based, composited drain, never blocks the board), so it was kept, not rebuilt; deviation logged in DECISIONS.md. The phase's real content was the numerals voice: 17 arm's-length figures set in raw pixel sizes (set inputs, ghost rows, rest countdown, edit dialog, records) now carry Sora via font-display. Active-flow gallery verified.
- R3: next.
- R4: not started.
