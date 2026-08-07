# Beating Hevy: the AI + social offense

**Status: PROPOSAL — awaiting Ameen's review.** Companion to
`docs/HEVY_PARITY_UPGRADE_PLAN.md`. That document closes the gap; this
one opens a lead Hevy cannot close. Same rules apply: subordinate to
`WAZN_PLAN.md`, beta first, phases activate only on approval, every
phase gated.

**The thesis in one line:** Hevy is a _recorder_ — a superb logbook that
answers "what did I do?". Wazn wins by being the _driver_ — the thing
that answers "what should I do next, and why?", proactively, in the
user's language, backed by their own numbers. Social makes the answer
communal. Neither is a feature Hevy can bolt on: an 8-person company
with 2M users can't put a per-user LLM coach on a $3.99 global price
without repricing its base, and its social layer is a feed, not a crew.

---

## 1. The asymmetries this plan is built on

Structural advantages Hevy is unlikely to contest, from the comparison
doc and the wellness-app-design skill's moat ordering (data gravity →
habit → social graph → brand):

1. **Marginal-cost coaching.** Wazn's AI layer already runs on
   OpenRouter free-first with a paid fallback at ~$0.002/analysis
   (`ai_generations` ledger proves the free model serves in practice).
   A per-user weekly coach costs Wazn cents; retrofitting one across
   Hevy's 2M users is a P&L problem, not a sprint.
2. **The deterministic spine already exists.** `coach_stats()`,
   `exercise_bests`, `strength_summary`, the 10–20 productive band,
   PR detection in the database — statistics Wazn computes _in SQL,
   under RLS_. The model only phrases. This is the architecture the
   skill demands (AI never authoritative, numbers never hallucinated)
   and it is already live at Edge Function v14.
3. **A social layer with a leaderboard Hevy lacks**, visibility
   enforced in RLS through one predicate, proven by tests.
4. **Language and culture.** Coach output follows the app locale —
   an Arabic-speaking AI coach with Ramadan-aware programming is a
   product Hevy has never shipped in seven years and can't localize
   its way into. (Stage 5 dependency; designed-for from day one here.)
5. **One decision-maker + seconds-long deploys.** Coaching features
   iterate weekly against real beta feedback; Hevy ships through two
   app stores.

**What we protect while attacking:** the one law (user under load — AI
never appears mid-set), the three hard AI rules from `WAZN_PLAN.md` §2C
and `CLAUDE.md` (deterministic SQL computes all numbers; the key lives
in an Edge Function; **no model output is written to the database
without the user pressing something**), stats-only prompts (no
identity), quotas on free / unmetered on Pro, and the anti-guilt rule —
the coach celebrates and advises, it never scolds.

## 2. The coach ladder

Every AI feature below sits on one rung of this ladder. Each rung is a
phase gate; we do not skip rungs, because trust in rung N is what makes
users accept rung N+1.

| Rung | Role             | Question answered         | Status                           |
| ---- | ---------------- | ------------------------- | -------------------------------- |
| 1    | Recorder         | What did I do?            | Shipped (parity plan hardens it) |
| 2    | Analyst          | What does it mean?        | Shipped (Coach's Notes, weekly)  |
| 3    | **Advisor**      | What should I do _today_? | **Phase B1–B2**                  |
| 4    | **Interlocutor** | Why? And what if…?        | **Phase B3**                     |
| 5    | **Programmer**   | Run my training.          | **Phase B4**                     |

Hevy stops permanently at rung 1½ (records + charts). Fitbod lives at
rung 5 but with no logbook soul and no social. Nobody in the market
combines rungs 1–5 with a crew. That combination is the product.

---

## 3. Pillar A — The proactive coach (rungs 3 → advisor)

"Proactive" does not mean notifications first. It means **the right
words are already waiting at every natural attention point** — computed
lazily on surface-open (the plan's scaling rule: never scheduled batch),
cached, regenerated only when new data lands. Four surfaces, in the
order a training day actually flows:

### A1. Pre-workout briefing (idle Log screen)

When the user opens Wazn on a training day, above the Start button: a
two-line card. Deterministic layer picks the facts — which routine day
is due, last session's top set, one target ("Bench: 60×8 last time —
62.5×8 beats your e1RM"), a rest-gap note if it's been >5 days. Model
phrases it in ≤2 sentences, voice = terse gym partner. One amber
kicker, no hero button competition, dismissible, never blocks Start.

_Core-loop adjacency warning:_ this card lives on the idle screen only.
The moment a workout starts, the coach disappears until Finish.

### A2. Post-workout debrief (FinishSummary)

The summary already shows duration/volume/sets/PRs. Add one
model-phrased line under the receipt: what this session _meant_
("Third straight bench progression — 5kg on your e1RM this month") and,
when warranted, one forward cue ("Squat volume is 40% below your band —
Thursday's lower day covers it"). Computed from stats the summary
already fetched + `coach_stats()`. This is the highest-emotion moment
in the app; it is where the coach earns its keep — and it feeds the
share card (Pillar D).

### A3. The weekly review (Coach tab, upgraded Coach's Notes)

Coach's Notes today: 3–5 insights with data chips. Upgrade to a
**structured weekly review**: adherence (planned vs done), band status
per muscle group, plateau flags (e1RM slope ≤0 over 6+ sessions on an
anchor lift), progression wins, and exactly one "next week, change
this" recommendation. Still cached, still quota'd, still every figure
traceable to SQL — the new part is the _review contract_ (same sections
every week, so users learn to read it like a program card).

### A4. Delivery beyond the app (sequenced with platform reality)

- **Now (PWA):** the briefing/debrief/review surfaces above — proactive
  in placement, zero notification permissions needed.
- **Web Push** (Android + installed-PWA iOS 16.4+): opt-in, in context
  (offered after the 3rd completed workout, per the skill's
  notification ethics), max 1/week: "Your weekly review is ready."
  Requires a `push_subscriptions` table + one Edge Function; modest.
- **Stage 4B native:** the same cues via local/push notifications,
  plus rest-timer completion (parity plan O18).
- **Never:** streak-guilt pings, "we miss you", daily anything.

**Tools:** no new dependencies for A1–A3 (existing Edge Function
pattern; one new `coach-brief` function or a mode parameter on
`coach-notes`). Web Push: `web-push` (VAPID) in an Edge Function +
service-worker handler. **GATE B1:** during beta, ≥half of active
testers read the briefing without being told it exists (measured by a
`coach_views` event table), and at least one tester changes a session
because of it (exit interview). Cost stays under $0.01/user/week.

## 4. Pillar B — Interactive deep analysis (rung 4 — interlocutor)

This is the feature Ameen is asking for with "interactive" — and it
collides with a standing constraint: **the Coach tab was designed
"no chat" on purpose** (`CoachScreen.tsx:17-22`, design v2.1). The
constraint exists because open chat drifts into a general-purpose LLM
wrapper: persona games, medical questions, hallucinated numbers,
unbounded cost. The answer is not to ignore the rule but to replace it
with a sharper one:

> **Grounded interrogation, not conversation.** Every exchange is a
> question _about the user's own training data_, answered through a
> fixed set of SQL tools, rendered with data chips. No persona, no
> memory beyond the thread, no topic outside the database.

### How it works (the tool-loop)

1. User asks — via **question chips first** ("Why has my bench
   stalled?", "Am I doing enough for legs?", "Compare my last 8 squat
   sessions", "What's my realistic 1RM?"), free-text allowed after the
   chips teach the domain.
2. The Edge Function runs a bounded tool loop: the model may call only
   **whitelisted, parameterized stat functions** (`exercise_history`,
   `e1rm_trend`, `weekly_band`, `rep_distribution`, `adherence`,
   `records_ladder` — each an RLS-scoped SQL function, each returning
   numbers + units). Max 4 tool calls, then it must answer.
3. The answer renders as: prose (≤120 words) + the **data chips for
   every figure it used** (the existing Coach's Notes chip grammar) +
   an optional inline mini-chart when the tool returned a series
   (drawn by _our_ SVG chart code from the tool's numbers — the model
   never draws).
4. One follow-up chip row is model-suggested ("Show the same for
   incline", "What would fix it?") — interaction continues, but each
   turn re-enters the same loop.
5. Off-domain input gets a fixed refusal in the product voice ("I only
   read your training log. Ask me about your lifts.") — written by us,
   not the model.

Quota: N questions/week free, unmetered on Pro (this is the flagship
Pro surface, per the plan's Stage 6 note). Every thread carries the
existing AI disclaimer once.

**Why this beats Hevy rather than matching anyone:** Hevy Pro sells
charts; this sells _answers_. The user who asks "why is my bench
stuck?" and gets their own six-week trend, a rep-range observation, and
one concrete change — in Arabic if that's their language — has no
reason to open Hevy again.

**Scope-change flag for Ameen:** this modifies the "no chat" decision.
The design above is the narrowest version that delivers
"interactive". It needs an explicit yes at the gate review, and a
DECISIONS.md entry reversing the earlier call with this reasoning.

**Tools:** OpenRouter tool-calling (the current `chat()` helper grows a
tools parameter + loop guard); 5–6 new SQL stat functions (security
invoker, RLS-scoped, unit-tested like `progress.ts`); an eval harness
(§7). Model: per-feature env var as today — this feature wants the
strongest free-capable model; routine-gen can stay on the cheap one.
**GATE B3:** ten real questions from beta testers answered with zero
hallucinated numbers (every figure traceable to a tool result — audit
the ledger), median answer <8s, and at least 3 testers ask a second
question unprompted. If testers treat it as ChatGPT (off-domain rate

> 30%), tighten to chips-only and reassess.

## 5. Pillar C — Adaptive programming (rung 5 — programmer)

The routine generator exists; it runs once and goes stale. The moat
version: **routines that progress themselves, with consent**.

- **C1. Deterministic progression engine (no AI).** Pure TS + SQL,
  unit-tested: double progression within rep ranges (hit top of range
  twice → +2.5kg), plateau rule (3 fails at a weight → −10% and
  rebuild), warm-up ramp already built. Produces _next-session
  targets_ per routine exercise. This is statistics answering what
  statistics can answer — the model is not involved in the numbers.
- **C2. Targets in the flow.** The pre-fill draft (today: last set)
  gains a second source: the engine's target, shown as the ghost
  ("target 62.5 × 8") with today's 1-tap commit unchanged. Under
  load, this is the entire UI footprint. No new taps.
- **C3. AI as the explainer and adjuster.** The coach phrases _why_
  the target moved (debrief/review surfaces), and the weekly review's
  "change this" can propose a **structured routine diff** (swap
  accessory, add a set to an under-band group) — rendered as a
  before/after card, validated against the exercise table, **applied
  only on "Apply changes"**. Same consent grammar as the existing
  routine preview → Save.
- **C4. Periodization, later:** deload weeks after sustained
  progression, Ramadan-aware volume shaping (nights, shorter
  sessions) at Stage 5. Flag, don't build, until C1–C3 prove out.

**Tools:** none new (engine is pure code; diffs reuse
`validate-plan`). **GATE B4:** Ameen trains 4 weeks on engine targets;
targets are right (not absurd jumps, respects his real plates) ≥90% of
sessions by his own count; applying a coach diff round-trips into a
normal editable routine. Kill switch: a "static targets" toggle per
routine — the engine must be refusable per the consent rule.

## 6. Pillar D — The social flywheel (AI × crew)

Hevy's social is a feed you scroll. Wazn's should be a **crew you
train with** — smaller, warmer, and fed by the coach. Sequenced after
GATE 3 retention data (social amplifies a habit; it doesn't create
one), and building on the parity plan's U5 (profiles, tap-through).

- **D1. Weekly crew recap.** One card in Friends, Monday: the week's
  leaderboard outcome, PRs across the crew, one coach-phrased line
  ("Three of you hit squat PRs — leg day is winning"). SQL computes,
  model phrases, nothing user-specific leaves RLS scope (the recap is
  computed per-viewer from what `private.can_view` already allows).
  Shareable as a 4:5 card → the growth surface.
- **D2. Challenges.** Time-boxed, opt-in, among follows: sessions/2
  weeks or volume/week, one live progress bar each, winner on the
  recap. No global boards (sandbagging + strangers = toxicity); crew
  only. Schema: `challenges` + `challenge_members`, RLS mirroring
  follows, SQL-computed standings.
- **D3. Friend PR moments.** Feed already shows PRs; add an opt-in
  push (post-4B) "Omar just hit 140 on deadlift" — the single
  highest-warmth notification in the genre, strictly opt-in per
  friend.
- **D4. Coach-aware sharing.** The debrief line (A2) rides the share
  card: instead of raw stats, the card can carry the coach's one-liner
  — which is what people actually caption screenshots with. This is
  the organic-growth surface Hevy leaves to the user's own wit.
- **D5 (Stage 7 tie-in).** Gym crews: a coach/gym-owner account owns a
  crew, sees adherence (with member consent), seeds challenges. This
  is the Egypt gym-wedge playbook with software behind it — and the
  first genuinely B2B-ish surface. Design later; hold the schema door
  open (crews are follows-groups, not a new visibility system).

**GATE B5:** during a challenge, participating testers log ≥20% more
sessions than their own prior 4-week baseline, with zero moderation
incidents; the crew recap gets shared outside the app at least once
(that's the growth loop firing).

---

## 7. Infrastructure, tools, and quality (cross-cutting)

- **One Edge Function pattern, three modes.** `coach-notes` /
  `coach-brief` / `coach-ask` share the `chat()` helper, the shared
  parser, per-feature model env vars, free-first + paid fallback,
  `finish_reason` truncation handling, and the `ai_generations`
  ledger (extended with feature + tool-call count + cost columns —
  the ledger is the cost dashboard).
- **Prompt-cache discipline** (already policy): static system prompt +
  compact per-user stat block; tool results appended, never inlined
  into the system prompt.
- **The eval harness is the new tool.** `supabase/functions/_shared`
  gains golden-fixture tests: canned stat blocks → assert the
  deterministic layer's numbers, and for model output assert the
  _contract_ (valid JSON, every cited figure present in the input
  block, length caps, no exercise names outside the catalog). Runs in
  CI on the fixtures; a weekly manual spot-check of real outputs
  during beta. Without this, rung 4 ships hallucinations.
- **Cost model & caps.** Worst-case paid-model math: briefing+debrief
  per workout (~2k tokens) + weekly review + 5 questions ≈
  **<$0.05/active/month**; at the plan's $1.50 ARPU that is a 3% COGS
  — and the free model serves most of it today. Hard monthly cap on
  the OpenRouter key (still unset — §2C asks for it; set it before
  B1), per-user quotas from day one, and a circuit breaker: on 429/5xx
  the surface renders its deterministic skeleton (numbers, no prose).
  **The app must be fully usable with AI dark** — that is what "never
  on the critical path" means operationally.
- **Privacy line holds:** prompts carry numbers and exercise names
  only. The crew recap adds a wrinkle — friend PRs in a prompt are
  still stats, but they are _other users'_ stats; scope them to what
  the viewer's RLS can already see, and say so in the privacy policy
  (it already names OpenRouter as a processor).
- **Arabic output** (Stage 5): locale flows through to the model;
  eval fixtures gain Arabic goldens; native-speaker review is part of
  GATE 5 already.

## 8. Phase map and sequencing

Parity phases (U-series) and offense phases (B-series) interleave;
reliability still outranks offense — U3 (offline) ships before B3/B4
because a coach whose log loses sets is a clown.

| Phase | Contents                                              | Depends on                                              | Gate                  |
| ----- | ----------------------------------------------------- | ------------------------------------------------------- | --------------------- |
| B1    | A1 briefing + A2 debrief                              | beta live; OpenRouter cap set                           | GATE B1 (§3)          |
| B2    | A3 weekly review contract + `coach_views` measurement | B1                                                      | folded into B1 review |
| B3    | Grounded Q&A (tool-loop, chips, quotas)               | B1; **Ameen approves the no-chat change**; eval harness | GATE B3 (§4)          |
| B4    | Progression engine + targets-in-flow + coach diffs    | U2 (overview ghosts) preferred; U3 shipped              | GATE B4 (§5)          |
| B5    | Crew recap + challenges + PR moments                  | GATE 3 passed; U5 profiles                              | GATE B5 (§6)          |
| B6    | Web Push → native push; D5 gym crews                  | 4B; Stage 7 contact                                     | rides GATE 4B / 7     |

**Monetization note (Stage 6 alignment):** the Pro line becomes
crisp — _free tier: the recorder + weekly review with quotas; Pro: the
coach_ (unmetered questions, adaptive programming, deep review). Real
marginal cost, real willingness to pay, and ads never touch any of it.

## 9. Metrics and kill criteria

- **Engagement:** briefing view-rate, review read-rate, questions/user/
  week, target-accept rate (C2 ghosts committed unchanged).
- **The number that decides everything: week-6 retention of
  coach-engaged testers vs non-engaged.** If coach-engaged users don't
  retain visibly better by GATE 3, the AI is decoration — freeze the
  B-series at whatever rung it reached and put the effort into the
  parity plan's U-series instead. Pre-deciding this now, in writing,
  for the same reason GATE 3 exists: to prevent sunk-cost drift on
  the most seductive feature category in the industry.
- **Cost:** ledger-derived $/weekly-active; alarm at $0.10.
- **Quality:** hallucinated-figure rate from ledger audits — the
  tolerance is zero; one confirmed fabricated number pauses the
  feature until the eval harness catches that class.

## 10. What we are NOT building

Open-domain chat or personas; a "form check" from phone video (medical/
injury territory + heavy infra); auto-applied programming (consent rule
is absolute); AI-written social posts impersonating the user (the coach
signs its own lines); nutrition/calorie advice; mood/readiness
questionnaires before workouts (friction on the sacred path); global
leaderboards; streak-guilt notifications; any model output rendered
mid-set. Each of these is either off-mission, off-voice, or on the
wrong side of the wellness-patterns safety line.

---

**Priority read:** B1+B2 are cheap (one function mode, two cards) and
prove the thesis on the beta cohort within weeks. B3 is the flagship
and the Pro anchor — but it waits for the eval harness and Ameen's
explicit reversal of the no-chat rule. B4 is the deepest moat (Fitbod's
brain on Hevy's logbook, with consent). B5 turns retention into
growth. If the B-series works, Wazn isn't a cheaper Hevy — it's a
different species that happens to log sets.
