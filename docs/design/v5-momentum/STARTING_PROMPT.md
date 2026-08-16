# Starting prompt for Claude Code

Copy everything below the line into Claude Code, started at the root of the `Wazn` repo, with this handoff folder copied to `docs/design/v5-momentum/`.

---

Implement the Wazn v5 "Momentum" redesign from `docs/design/v5-momentum/`. Read `README.md` in that folder first, fully, before writing any code.

FIDELITY CONTRACT — read this as binding:
1. The bundle is HIGH-FIDELITY and NORMATIVE, not inspiration. Reproduce it exactly: every color, size, weight, spacing value, radius, motion duration, and copy string in the README and the HTML files is a requirement. If a value conflicts with your instinct or with the current stylesheet, the handoff wins.
2. Do not redesign, "improve", simplify, substitute, or reinterpret. Do not invent sizes, colors, or copy that are not in the bundle. If something is genuinely unspecified, match its nearest sibling in the bundle and note the assumption in your PR description.
3. The HTML files are the pixel source of truth. Open `design/Wazn v5.html` and `design/Onboarding.html` in a browser at 430px width and measure against them (`design/ui.jsx` holds the exact token values). Recreate them with the repo's own stack — React + TypeScript + Tailwind v4 tokens, existing components and stores — never by shipping the HTML or copying its inline-style idiom.
4. Restyle, don't rewrite, shipped logic: `AuthScreen.tsx` (all four auth paths), the offline write queue and workout checkpoint, `use-back.ts`, the social/RLS layer, `coach.ts` and the Edge Function pipeline. The design changes what these look like, never what they do.
5. Port the deterministic rules in `design/coach2.js` (ghost seeding, once-only recalc, Epley PR detection, 8-session linear forecasts, rank ladder, verdicts, week review, preset answers) into `src/lib/` and SQL where equivalents exist. The model only phrases; every number must come from computed stats. The bounded system prompts for "Tell the coach" and "Ask the coach" are in `design/screens_core.jsx` and `design/screens_tabs.jsx` — route them through the existing Edge Function pattern with the JSON contracts as written.
6. Honor the DO-NOT-REGRESS list in the README §Do-not-regress verbatim — the app is live. In particular: GATE U2 (repeat-set commit = 1 tap), the airplane-mode session (LAUNCH.md §4), logical properties only, tabular numerals everywhere, no third hue beyond ember + the scoped brass, coach volume Off rendering a coherent pure logger, and nothing model-generated ever auto-applied without a user press.
7. Build in the README's P0→P3 order, one PR per phase, each PR small enough to review against the reference HTML side by side.

DEFINITION OF DONE — do not report complete until every line is objectively true:
- [ ] Rendered at 430px next to the reference HTML, each implemented screen matches: type steps (only the ramp's steps exist — mega 84 / hero 50 / fig 30 / num 21 / title 17 / body 14 / label 13 / kick 10 / meta 11 / nano 9), palette, radii (16/12/6/999), hairline-ring elevation, 18px gutter.
- [ ] Every AI sentence renders with exactly one mono data chip; no AI text renders without its number; brass appears only on rank / duel opponent / record-pace / target-beaten.
- [ ] Live loop: coach-seeded ghosts with ▲/→/↓ chips; under-plan commit recalcs remaining sets once, never committed rows, never twice per cause; BANK IT label live-updates; momentum bar flips to brass at 100%.
- [ ] Rest canvas: full-screen, ring FILLS as rest elapses, shows next set + reasoning chip + momentum chip, dismisses on tap, never blocks or asks.
- [ ] PR full-screen fires only on a true e1RM record after commit; rank pill only on ladder crossing; baseline updates so it cannot double-fire.
- [ ] Tell the coach: chips + free text return ONLY a proposed edit with Accept / Keep as planned; surface absent outside an active workout; pain words ease + non-medical line.
- [ ] Coach volume Full / Quiet / Off wired exactly as specified; every degraded render works with zero data sources granted.
- [ ] Onboarding matches: Google hero → email/username+password → code path; OTP cells; welcome with username claim; Hevy import flow; all six day-one empty states with LAUNCH.md copy verbatim.
- [ ] Forecast lines absent under 8 sessions of lift data (honest placeholder instead); projection segment dashed; at most one plateau card.
- [ ] No `ml-/pl-/left-`; all numerals `tnum`; no red anywhere; rest timer silent; nothing on the logging path over 200ms or behind a spinner.
- [ ] LAUNCH.md passes end to end on a second account, including the airplane-mode section.

Start with: read `docs/design/v5-momentum/README.md`, then open the two HTML references, then produce a P0 implementation plan mapping each P0 item to the exact repo files you will touch — and wait for my approval on that plan before writing code.
