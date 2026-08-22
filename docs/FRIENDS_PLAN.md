# Friends: a fresh plan

**Status: PROPOSAL, 2026-08-21.** Written at Ameen's request after the Friends
tab was judged to need "major rework and major reimagination". Subordinate to
`WAZN_PLAN.md`. Ameen explicitly lifted the guardrails in
`docs/BEATING_HEVY_PLAN.md` §13 for this exercise, so this document designs past
them and says where it still chose not to go, and why.

---

## Part 1. What every document already says

Nine documents in this repo touch Friends. Read together they repeat six ideas
with unusual consistency, which is worth noticing: the direction has been stable
even while the visual system changed four times.

### Theme 1: a crew, not a feed. This is the load-bearing idea.

`docs/BEATING_HEVY_PLAN.md` §7 states it in one line:

> Hevy's social is a feed you scroll. Wazn's should be a **crew you train
> with**, smaller, warmer, and fed by the coach.

Everything else in the social pillar follows from it. §13 refuses global
leaderboards for the stated reason that "sandbagging + strangers = toxicity".
§1 frames it as an asymmetry: Hevy's "social layer is a feed, not a crew".

### Theme 2: social amplifies a habit, it does not create one

Stage 3 in `WAZN_PLAN.md` is gated on GATE 3, the retention gate, and it is
called sacred. Pillar D is explicitly "sequenced after GATE 3 retention data
(social amplifies a habit; it doesn't create one)". The `wellness-app-design`
skill says the same thing independently: retention mechanics before growth
mechanics, because "a feed of churned users is a graveyard".

**This is the theme most at risk right now.** Friends is the last stub, so
building it is tempting for completeness, not because evidence asked for it.

### Theme 3: the coach is the social engine

D1's weekly crew recap: "SQL computes, model phrases, nothing user-specific
leaves RLS scope". D4 puts the coach's line on the share card, on the argument
that a coach line "is what people actually caption screenshots with". This is
the part Hevy structurally cannot copy, per §1's marginal-cost argument.

### Theme 4: visibility is a database decision, never a client one

`src/lib/social.ts` opens with it, Stage 3 repeats it, and there is a test suite
behind it. There is no `if (profile.visibility === ...)` anywhere in the client
on purpose. Private is the default.

### Theme 5: the shape has been stable across three design systems

| System                                       | Friends contains                            |
| -------------------------------------------- | ------------------------------------------- |
| v2.1 (`docs/design/v2.1-missing-screens.md`) | weekly leaderboard, feed with likes         |
| v3 "The Plate"                               | same, six-tab bar confirmed by Ameen        |
| v5 "Momentum" (screen 16)                    | leaderboard rows, **duel card**, invite row |

v5 adds duels and the **brass** hue, "earned metal only: rank, duel opponent,
record pace, target-beaten. Never UI chrome." v5 also puts a **rank ladder** on
Home, not Friends: `IRON I 120 · IRON II 150 · STEEL I 180 · STEEL II 210 ·
CHROME 240`, keyed to bench e1RM in lbs.

### Theme 6: the growth loop is one shareable card

v2.1 specs a 4:5 card on Finish. D1 makes the crew recap shareable in the same
ratio. D4 puts the coach's sentence on it. Three documents, one surface.

### And one detail worth preserving verbatim

v5's duel rule: **"loss copy = win copy with names swapped."** That single
sentence is the whole voice of this product. It is the reason Wazn's social can
be competitive without being cruel, and it should govern every line in this tab.

### What the documents leave unresolved

1. **Brass is still an open question.** `WAZN_PLAN.md` says to build Friends in
   ember and flag it. v5 says brass is the earned metal. Undecided.
2. **Duels were specified and never built.** No schema, no SQL, no screen.
3. **Ranks live on Home in v5, not Friends**, and nothing explains why.
4. **The current stub is v5's day-one copy** and nothing else: "A leaderboard of
   one. Invite someone to chase."

---

## Part 2. What the evidence actually says

**Rewritten 2026-08-21 after a proper literature pass.** The first draft of this
plan asserted several things from general knowledge. One of them was wrong, and
the trial that refutes it is the strongest study in this field. What follows is
sourced.

### The STEP UP trial, and it overturns the obvious intuition

`STEP UP` (Patel et al., _JAMA Internal Medicine_, 2019) randomised **602
adults** across four arms for a 24-week gamified intervention plus a **12-week
follow-up with the gamification switched off.**

| Arm             | Extra steps/day vs control, during | After removal             |
| --------------- | ---------------------------------- | ------------------------- |
| Support         | 689                                | 428 (p=.04)               |
| Collaboration   | 637                                | 126 (**not significant**) |
| **Competition** | **920**                            | **569 (p=.009)**          |

**Competition was the largest effect and the only arm whose gains survived the
intervention being taken away.** Collaboration, the cuddly option, decayed to
nothing.

This is the reverse of what most product people assume, and it is the reverse of
what the first draft of this document asserted.

### But read how the competition was actually scored, because it is everything

Two design details decide the whole interpretation:

1. **Goals were personal and baseline-derived.** Each participant wore the
   device for two weeks to establish their own baseline, then chose a target of
   33%, 40% or 50% above _their own_ number.
2. **Points came from hitting your own goal**, not from output. 70 points each
   Monday, 10 lost per day missed. The leaderboard ranked cumulative points.

So the leaderboard ranked **adherence to a self-set target**. Nobody could win by
being fitter. There was no upward comparison on ability available.

### Which reconciles it with the social-comparison literature

The comparison research is real and it is not soft. Upward comparison against
people perceived as far better produces "feelings of inferiority or inadequacy
… frustration, demotivation, and defensive attitudes", and downward comparison
"thwart[s] self-efficacy in physical activity". Effects are moderated by
self-control and self-efficacy, which is to say the least confident users take
the most damage.

Both literatures are correct, and together they give one clean design rule:

> **Competition is the most powerful and most durable lever available, provided
> the thing being compared is adherence to a self-set goal rather than output.**
> Comparing output produces upward-comparison harm. Comparing adherence cannot,
> because every participant is measured on their own scale.

### The referee finding, and an honest gap

Commitment-device research supports a named observer directly: users with
**money at stake plus a referee hit their goals 78% of the time, versus 35%
without**, and financial stakes raise follow-through 2 to 3 times over
pledge-only. Adding a commitment contract to a short-term gym incentive produced
change persisting over a year, where incentives alone decay in about three
months.

**The gap, stated plainly rather than glossed:** those numbers come from
contracts with _money_ in them. Commitment contracts resting on reputation
alone "are relatively under-researched, and the evidence base lacks conclusive
answers". A witness with no stake is the intuitive design and it is not the
proven one. That is a real open question for F3 and it is flagged as one rather
than assumed away.

### Where the category still breaks: the content unit

Two findings from the product research, which the trials do not cover.

**One. The value evaporates without your specific friends.** Hevy's social layer
"is valuable if people in your network use Hevy, but if your friends use Strong
or Vora, the social benefit disappears". Beginners and solo trainers find it
motivating; experienced lifters "who already have training partners or community
elsewhere tend to ignore it or turn it off". A feed is worth nothing at n=1, and
everybody starts at n=1.

**Two, and nobody names it.** Strava is the model every strength app copies, and
the copy fails structurally: **endurance sport produces a route.** A map, a
place, an elevation profile, a photograph. That is a genuinely interesting
artifact, and it is what 14 billion kudos a year are actually attached to.
**Lifting produces a table of numbers.** Hevy's feed is rows of somebody else's
numbers, and no one has ever wanted to scroll those. The feed is not badly
built; it is a distribution model for a content unit this sport does not
generate.

---

## Part 3. So what are the units?

### For accountability: the person, and only at small scale

The one genuinely interesting event in lifting, to somebody who is not you, is
**the moment a number moves**. And it is legible only to people who know your
history. "Omar hit 140" carries no information unless you know what Omar lifted
last month.

That is a far stronger argument for a tiny crew than "quiet groups go stale". It
is not that large groups are quiet. **It is that in a large group nobody can
read anybody.**

Note the tension with STEP UP, honestly: its competition groups were **three
strangers**, and it worked. The reconciliation is that adherence percentages are
legible to strangers while PR numbers are not. So the _competition_ can tolerate
strangers; the _content_ cannot.

### For growth: the program, not the person

**In lifting the shareable object is the program.** Hevy's most-used social
surface is routine sharing, not the feed. Boostcamp reached **over 1,000,000
lifters and 300M+ logged workouts** on a library of **10,000+ community-built
programs**. People do not want to watch each other train. They want to know what
worked.

Two jobs, two objects, two shapes:

| Job                | Object      | Shape                         | Audience            |
| ------------------ | ----------- | ----------------------------- | ------------------- |
| **Accountability** | the person  | small, private, consent-based | 2 to 8 who know you |
| **Growth**         | the program | public, shareable, indexable  | strangers           |

The first retains. The second acquires. Every competitor conflates them into one
tab, which is why the tab underperforms at both.

---

## Part 3B. The tab bar, now that it is not fixed either

**Added 2026-08-21.** Ameen removed the last constraint: tabs can move, merge,
appear or disappear. That changes the answer, because the honest conclusion is
that **Friends should not be a tab**, and it is not the only one.

### This was already litigated here once

The 2026-08-13 audit retired the five-tab bar outright, and its reasoning is
exactly the argument:

> Log is daily; History, Progress, Coach, Friends are occasional. Equal tabs
> make the app feel bigger and harder than it is.

It replaced the bar with cards-as-doors. A v3 design handoff then brought back
**six** tabs and that won. The audit's logic was never refuted, only overridden,
and it applies harder now that one of the six is a stub.

### The production data, which nobody has looked at

Row counts across all nine accounts, read live on 2026-08-21:

| Surface                                                      | Rows      | Has a tab        |
| ------------------------------------------------------------ | --------- | ---------------- |
| Logging (`workout_sets`)                                     | **3,477** | yes              |
| Routines (`routines` + `routine_exercises` + `routine_sets`) | **386**   | **no**           |
| Body (`body_weights` + `body_measurements`)                  | **1 + 0** | **yes**          |
| Protein (`protein_days`)                                     | 1         | yes, inside Body |
| Social (`follows` + `workout_likes`)                         | **1 + 0** | **yes**          |

**The navigation is inverted relative to use.** Body owns a sixth of the tab bar
for two rows total, and it is the only screen with no card door, so the bar is
its sole route in. Routines carries 386 rows and has no tab at all.

Nine accounts is a small sample and the app has not been shared, so this is
weak evidence about demand. It is _strong_ evidence about proportion: nothing
justifies Body and Friends holding a third of the navigation between them.

### Proposed: four tabs

**Train · Plan · Progress · Crew**

- **Train** (was Log). The daily screen. Start, the coach's brief, the crew
  line, the pact. Untouched otherwise: the logging path is sacred.
- **Plan** (new). Routines, and later F7's shareable program pages. This is the
  tab the data says is missing, and it is where the growth engine belongs.
- **Progress** (absorbs History, Body and the Coach tab). The retrospective, in
  one place.
- **Crew** (was Friends), **and only once S1 ships.** Until then it is a card on
  Train. A tab that is empty for every user is the stub problem again.

### What dissolves, and why each is defensible

**History folds into Progress.** "What did I do" and "am I getting stronger" are
the same question at two zoom levels. Keep the History circle beside Start as
the fast door, which the audit already called the one piece of navigation worth
keeping as furniture.

**Body folds into Progress, mostly by deletion.** Body weight is a number over
time, which is a chart, which is what Progress is. It becomes one more card
beside the e1RM chart. Measurements (0 rows) and protein (1 row) should be cut
rather than moved: protein is a different domain bolted onto a strength logger,
and the data says nobody has asked for it.

**The Coach tab dissolves, and this is the one that matters most.** The repo's
own doctrine is that AI arriving as a tab is the mistake, and the Coach tab is
the last place that rule was not applied. Its parts have better homes:

- the mode selector is a preference, so it goes to Settings;
- the **weekly review goes to the top of Progress**, because its four sections
  are adherence, volume, plateaus and wins, and every one of those is a Progress
  question phrased by the coach.

That merge also fixes a duplication found on 2026-08-21: the muscle-volume band
chart shipped on Coach while Progress was being built to show the same numbers.
One screen with the figures **and** the coach's reading of them is strictly
better than two screens showing the same data twice.

The coach does not lose surface area. It gains it: it is already on Train (the
brief), on the board (the ghost), on the rest canvas, and on Finish (the
debrief). Removing its tab makes it what it was always supposed to be, a layer
rather than a destination.

### What this does to the Friends plan

It raises the stakes on F0. With four tabs instead of six there is less room to
hide a surface nobody visits, so the ambient placements stop being a nice idea
and become the mechanism: the crew's day-to-day presence is the line on Train,
the line on the rest canvas, and the reactions on Finish. The Crew tab is an
index that earns its slot only after S1 proves people are in crews at all.

---

## Part 4. The plan

**Revised 2026-08-21, second pass.** The first draft of this section had six
pieces and all six lived inside the Friends tab. That was the wrong shape, for a
reason this repo already wrote down and I failed to apply:

> The mistake to avoid: AI arriving as a tab. A chat box is an admission that
> the app does not know what you need and would like you to type it.
> `docs/BEATING_HEVY_PLAN.md` §8

**Social arriving as a tab is the same mistake.** A crew you have to go and look
at is a crew you forget. Worse, §E1 of the same document calls the rest canvas
"the category's unclaimed attention surface", 20 to 60 minutes of attention per
workout, and the first draft of this plan did not touch it once.

So the plan now has a layer above the tab, and the tab is where the detail
lives rather than where the product lives.

---

### F0. The crew is ambient. The tab is only its index.

Three placements, in descending order of how often they are seen.

**On Home, one line.** The screen every session starts on already carries the
coach's sentence and the up-next card. It gains one line of crew state: who is
behind, who is ahead, or that everyone is on target. That is the whole Week
Board compressed to a sentence, and it is seen every single session without
anyone opening anything.

**On the rest canvas, one line, read-only.** Between sets a lifter has 60 to 180
seconds and nothing to do. The canvas gains a single line of crew presence:

```
OMAR IS TRAINING NOW
LAYLA HIT A SQUAT PR AN HOUR AGO
```

**Live co-presence is the strongest social signal in fitness and no strength
tracker has it.** Peloton's during-class leaderboard is the single most-cited
retention mechanic in that product, and it works because it is co-presence, not
a feed. Knowing someone else is under a bar right now, while you are resting
between sets, is warmer than anything a feed can deliver and it costs the lifter
nothing to receive.

**The canvas informs. It never transacts.** This is a hard constraint, not a
preference: the canvas is specified "passive, silent, no inputs; vanishes on
interaction", and tapping anywhere dismisses it. Putting a button there would
break a shipped behaviour and put a social control on the hot path, which §13
refuses and which this plan agrees with. So the line is text and only text.

**On Finish, the crew is collected.** The reactions happen at the end, when the
lifter is done, receptive, and already looking at a summary:

```
WHILE YOU TRAINED
Layla · squat PR, 92.5 kg          [ react ]
Omar  · finished Upper Push        [ react ]
```

One tap each, from a fixed small set. This is the reciprocity loop, and putting
it here rather than mid-rest is what lets it exist at all.

---

### F1. The Crew replaces followers

Mutual, invite-only, capped at eight. No asymmetric follow, no public profiles
to browse, no discovery. You are in a crew or you are not, and everyone in it
sees everyone.

The cap is the feature. The research is explicit that accountability "works when
people actually show up. Start with two or three committed friends, not twenty
maybes. Quiet groups weaken the effect." Eight is the largest number where one
person going quiet is conspicuous.

_Schema: crews are follow-groups, which is the door D5 asked to be held open.
RLS mirrors the existing `follows` predicate; no new visibility system._

### F2. The Week Board, ranked on reliability rather than output

**This is the central design decision, and it is a deliberate break from v5.**

v5, v2.1 and v3 all rank the leaderboard by weekly volume. Volume is won by
whoever trains longest and heaviest, which means it is won by the same person
every week, and it structurally punishes the newest and smallest member, who is
also the one most likely to churn. A board that is decided before the week
starts is not a competition, it is a standing.

**This is now the best-evidenced decision in the document.** STEP UP's winning
arm ranked its leaderboard on points earned by hitting a personal,
baseline-derived goal, and that is the mechanic that produced both the largest
effect and the only durable one. Ranking on output is not merely less kind, it
is less effective.

Rank on **sessions completed against each person's own committed target.** You set your number (three a week, five a week). The board shows
progress against your own commitment.

Consequences, all good:

- Everyone can top the board, including the beginner, including the person on a
  deload, including the woman training three times a week around a job.
- It measures the thing a training partner actually provides: reliability.
- Sandbagging is pointless, because the target is yours and lowering it is
  visible to the crew.
- It works across strength levels, sexes, ages and equipment access, which
  matters for Egypt.

Absolute volume still renders, quietly, as a secondary figure. It is
information, not the ranking.

### F3. The Pact. Consent first, contact second.

**Revised on expert grounds. The first draft of this was reactive and that was
wrong.**

The accountability literature is more specific than "someone might notice". The
mechanism that works is a **specific commitment, to a named person, made in
advance**. The effective intervention is prospective. A reminder fired after a
miss is a lagging indicator, and being contacted unsolicited after you have
lapsed is experienced by a large fraction of people as surveillance, which
produces avoidance rather than adherence.

So the mechanic moves to the front of the week.

```
YOUR PACT
Four sessions this week.
If I miss two, tell Omar.          [ set ]
```

**The target is derived, not asked.** Requiring a user to invent a weekly number
is setup friction on the feature whose research says setup friction kills it.
Wazn already knows their four-week average, so the app proposes it and the user
confirms or nudges it. STEP UP did the same thing: two weeks of baseline, then a
choice among 33%, 40% or 50% above it. Nobody was asked to guess.

The user confirms the number and names the witness, in advance, once. That single
change does three things a reactive nudge cannot:

- **It converts monitoring into a commitment device the user authored.** Nobody
  is being watched. Somebody asked to be held to something. This is the
  difference between a feature people disable and one they rely on.
- **It creates the expectation before the session**, which is where the
  behavioural effect actually lives. The witness knowing is what works; the
  message is only the backstop.
- **It fixes the dependency the first draft did not examine.** A reactive nudge
  needs at least one consistent person to send it, so in a crew where everyone
  drifts, the mechanic evaporates exactly when it is needed. A pact fires on a
  rule, not on somebody's initiative.

**The evidence for the referee is strong, and the gap in it is real.** Users
with a referee and a stake hit their goals 78% of the time against 35% without,
and a commitment contract on top of a gym incentive held for over a year where
incentives alone decay in about three months. But those are contracts with money
in them, and contracts resting on reputation alone are, in the literature's own
words, under-researched with no conclusive answer. **A witness with no stake is
the intuitive design, not the proven one.** S2's gate exists to test exactly
that, and if a stakeless pact does not move behaviour, the honest next
experiment is a stake the crew can see rather than a louder message.

When it does fire, the coach drafts the line in the recipient's language and the
witness presses send. Still a human, still one tap, still rate-limited to once
per person per week. The app never contacts a lapsed user on its own behalf.

**Voice rule:** the line reads the same whether it goes to the strongest person
in the crew or the newest.

### F4. Duels: build them. I was wrong, and the trial says so.

**Reversed 2026-08-21.** The previous draft of this section recommended not
building duels, on the argument that head-to-head competition demotivates the
loser and that team-against-goal outperforms person-against-person "in
essentially every study". I asserted that from general knowledge and it does not
survive contact with the evidence.

STEP UP tested exactly this and **competition beat collaboration on both
measures that matter**: 920 extra steps per day against 637 during the
intervention, and it was the only arm still significantly ahead twelve weeks
after the gamification was switched off (569, p=.009, against collaboration's
126, which was not significant). The warm option decayed to nothing. The
competitive one held.

So v5's instinct was right and mine was wrong. Build the duel.

**With one non-negotiable, which is the whole finding:** the duel is scored on
**adherence to each side's own target**, never on volume, weight or absolute
output. That is precisely how STEP UP scored its leaderboard, and it is why its
competition arm did not produce the upward-comparison harm the social-comparison
literature documents. A duel on absolute strength is the version that damages
people. A duel on "did you do what you said you would" is the version with a
randomised trial behind it.

Keep v5's rule that loss copy is win copy with names swapped. Keep it
fair-matched and opt-in. Add: no permanent running win-loss record between two
people, because a standing scoreboard between friends is a different object from
a bounded contest and nothing in the evidence supports it.

### F5. The Monday Recap, which is also the growth surface

D1 unchanged: one card, Monday, the week's outcome across the crew, PRs, one
coach-phrased line ("Three of you hit squat PRs. Leg day is winning."). Computed
per viewer inside RLS scope. Rendered as the 4:5 card that v2.1, D1 and D4 all
independently asked for.

This is the only thing in the tab designed to leave the app.

### F6. The empty state is the product, not a placeholder

Because it is the state Ameen will see, the state every new user sees, and the
state the research says kills social fitness apps.

**With no crew, Friends shows you against yourself.** The same Week Board, the
same layout, one row: this week against your own four-week average. It is real,
it is yours, and it is never empty. The invite becomes an addition to a working
screen rather than the price of entry to a blank one.

And the invite carries a reason. An invite link opens on the inviter's actual
week, so accepting is joining something visible rather than downloading an app
on faith.

### F7. Programs are the growth layer, and they are not in the Friends tab

The accountability pieces above retain the people you already have. They do not
acquire anyone, and no amount of crew design will, because a crew is private by
construction.

**Acquisition rides the other social object.** Boostcamp built a million-lifter
product on 10,000+ community programs, and routine sharing is the most-used
social surface in Hevy. A program is everything a workout is not: it is
legible to a stranger, it is useful before you know anyone, it is worth linking
to, and it is indexable.

Wazn already has routines, the coach that can explain why one is working, and
222 SEO pages proving the acquisition channel exists.

- A routine gets a public, shareable page carrying the coach's own line about
  what it produced. Not "Ameen's Upper Push", but a program with evidence
  attached.
- Importing someone's program is one tap and lands in your own routine list.
- The page is indexable, which compounds, and Arabic-language program pages are
  uncontested.

**This is deliberately not in the Friends tab.** It is a different job with a
different audience, and putting it there is the conflation every competitor
makes. It belongs with routines and with the SEO surface. It is listed here only
because the research that produced this plan found it, and burying it would be
dishonest about where the growth actually is.

---

## Part 4C. The AI layer across the four tabs

**Added 2026-08-21 at Ameen's request: AI at every possible touchpoint, balanced
and not overwhelming.** Researched independently; where this section disagrees
with the repo's existing AI doctrine it says so.

### The category already ran the experiment

Strava and Whoop shipped LLM features a year apart, on the same class of model,
and got opposite receptions. That pair is the whole lesson.

**Strava's Athlete Intelligence flopped**: "bland pep talks", a marathon praised
as "an impressive long run", a restaurant name hallucinated into a run in China,
mocked in memes, walked back by the CEO as "for newer users". Its structural
mistake: **it narrates data the screen already shows**, unconditionally, on
every activity.

**Whoop Coach is the best-received AI in fitness**, and it does the opposite of
Strava on every axis: it speaks **only when asked**, answers questions the
screen _cannot_ show (cross-signal, "why", "what if"), grounds every answer in
the user's own data, and connects claims to published research.

The rule that falls out, independently of anything in this repo:

> **AI that narrates the visible fails. AI that answers the invisible works.
> And the surest way to fail is to speak on a schedule instead of on an event.**

Wazn's existing "SQL computes, the model phrases" doctrine survives this test —
it is the Whoop half of the split. Three other parts of the current doctrine do
not survive unmodified, below.

### The trust environment turned hostile, which changes the packaging

Between 2025 and 2026 the share of consumers whose trust in a brand _drops_
when it leans on AI went from 20% to 40%; 53% distrust AI-generated summaries
outright; frustration with AI agents is rising year on year. Two consequences:

- **The brand is the coach, never the model.** No "AI-powered" anywhere a user
  or a store listing can see. The disclosure line ("AI-generated · not medical
  advice") stays — that is ethics, not marketing — but it is a footer, not a
  feature.
- **Every sentence must carry a checkable number.** This is Wazn's existing
  grounding contract, and the research upgrades it from a nice principle to the
  one visible difference between the app users trust and the app they meme.

### Three self-criticisms of the current doctrine

**One. "One sentence + one chip" on every surface is Strava's mistake at a
politer volume.** The v5 spec weaves a coach line through every moment, daily,
whether or not anything happened. Unconditional presence habituates into
wallpaper — Strava proved it. The correction is an **attention budget**: silence
is the coach's default state, not its fallback, and speech is _earned by
events_ — a PR, a plateau crossing its threshold, a band newly under, a pact at
risk. Concretely: the coach should say something like ten sentences a week, not
ten a day, and `coach_views` already exists to measure the real number.

**Two. The chat refusal is half right, and the wrong half is showing.** The repo
refuses a chat box as the front door, and the backlash data supports that. But
Whoop's Q&A is the single best-received AI feature in the category, and the
current plan buries Wazn's equivalent in a tab this document just dissolved. The
synthesis is **object-anchored questions**: every figure, chart and card in the
app is long-pressable to "ask about this", with the question pre-seeded by the
object ("Why is my bench forecast flat?"). No blank input box exists anywhere;
full interrogation capability exists everywhere. The chat box dies, the
conversation survives, and it opens already knowing what it is about.

**Three. The best AI in the app is not text, and no document says so.** The
ghost — the pre-filled next set — is the most successful intelligence Wazn has,
and it produces zero sentences. That is the calm-technology finding exactly: the
strongest AI pattern is a **changed default**, not a message. The hierarchy,
made explicit for every future feature:

> **defaults > figures > sentences > conversations.**
> Ship intelligence as far up that list as it can go. A sentence is what you
> ship when you could not make it a default.

### The touchpoint map

Four tiers, then the tabs. Tier 0 is invisible and unlimited; tier 2 is
budgeted; tier 3 exists only on demand.

| Tier | Form                                                                   | Budget                        |
| ---- | ---------------------------------------------------------------------- | ----------------------------- |
| 0    | Changed defaults: ghosts, proposed targets, learned rest, picker order | unlimited, invisible          |
| 1    | Computed figures: forecasts, slopes, bands — SQL, never phrased        | unlimited, visible            |
| 2    | Coach sentences, event-gated                                           | ~10/week across the whole app |
| 3    | Conversation, object-anchored, on demand                               | user-initiated only           |

**Train.** Already the densest AI surface, so the work here is _subtraction_:
the ghost (T0), check-in feeding the ghost silently (T0), the rest canvas's
reasoning chip (T1). The brief becomes event-gated (T2) — on a day with nothing
true to say, the card does not render, and that is the feature. Tell-the-coach
stays as-is (T3, mid-workout, already bounded).

**Plan.** The tab with the most AI headroom, and the place adaptive-programming
evidence points. Fitbod and JuggernautAI prove lifters accept algorithmic
programming — 4.8-4.9 store ratings — and their universal complaint is the cold
start: "the first ten to fifteen workouts feel generic before the algorithm
learns you." **Wazn structurally does not have that problem: the Hevy import
means the coach knows years of history on day one.** So: draft-me-a-routine
(exists), then **program adaptation as previewed proposals** — "chest volume in
this routine sits under your band; preview the change" — accepted or declined,
never auto-applied. Progressive autonomy is also what the trust research
prescribes. Program pages carry the coach's evidence line (T1).

**Progress.** The weekly review at the top (T2, already weekly, already
budgeted). Forecasts and plateau slopes as figures (T1). One plateau-fix card
maximum (T2). And every chart long-pressable to ask (T3) — this is where
object-anchored Q&A earns its keep, because Progress is where the questions
actually occur.

**Crew.** The pact's proposed target (T0 — derived from the four-week average,
confirmed not typed). The pact message drafted for the witness (T2). The Monday
recap (T2, weekly). Duel fair-matching (T0, invisible). The crew is the surface
where the coach speaks _least_, because the humans are the feature.

**Onboarding, the missing touchpoint in every prior plan.** The churn evidence:
users completing fewer than three workouts in the first fourteen days churn at
three to four times the rate, and the aha moment has to land in the first
session. Wazn's aha is unique and nobody has claimed it: **import is the
onboarding.** Hevy CSV in, and the coach's first sentence proves it read _your_
history — "Bench moved 12 lb in eight weeks. Your first session opens with your
own numbers." Personalisation before the first question is asked, and the
cold-start complaint that dogs every adaptive competitor never happens.

**Notifications.** One per week, event-driven, opt-in after the third completed
workout. The review-is-ready ping and nothing else. Every addition to this list
is argued against the backlash data, not against the roadmap.

### What would falsify this

- If `coach_views` shows briefing read-rate _rising_ when the brief renders
  daily versus event-gated, the attention budget is wrong and unconditional
  presence wins. Measure, don't assume.
- If nobody long-presses a chart in a month of beta, object-anchored Q&A is a
  designer's fantasy and dies quietly — it costs one gesture, so it can.
- If pact-holders ignore the derived target and always retype it, T0 targeting
  is mis-derived and the four-week average is the wrong baseline.

---

## Part 5. What this plan deliberately does not do, with the guardrails lifted

Ameen lifted §13. These are the things that remain refused, and the reasoning is
product reasoning rather than policy.

- **Global leaderboards ranked on output.** Note the qualifier, which the
  evidence forced. STEP UP's competition arm was **three strangers** and it
  produced the strongest, most durable result in the trial, so "strangers are
  toxic" is not supportable as stated. What is supportable is that ranking on
  _output_ invites the upward comparison the literature shows does damage. A
  wider board ranked on **adherence percentage** is defensible and is worth
  testing after S3. A global volume board is not.
- **Unsolicited contact from the app after a lapse.** Not on a general "guilt is
  bad" argument, but because the whole referee evidence base rests on contact the
  user _arranged in advance_. Unrequested monitoring is a different intervention
  from a commitment device and has no comparable support.
- **Public shaming of a missed target.** The Pact fires to one named witness the
  user chose, never outward to the crew as a failure.
- **Free-text comments.** Reactions are a fixed small set. No moderation burden,
  no translation problem, no thread to police, and it keeps the tab warm. This
  is a reversible decision if the crew asks for it.
- **Absolute-strength rank ladders as a social display.** v5's `IRON I ... CHROME`
  ladder is good on Home, where it is you against your own past. Sorting a crew
  by absolute e1RM permanently ranks it by training age and genetics, and tells
  the newest member they are last. **Flagged for Ameen: if ranks come to
  Friends, rank on progression or consistency, which everyone can climb.**

---

## Part 6. Sequencing and gates

> **AMEEN LIFTED THE GATES ON 2026-08-21.** They are no longer build
> preconditions. S1 does not have to wait for two accounts training weekly, and
> the Crew tab does not have to wait for S1. **The table below now reads as
> Ameen's review checkpoints and as the order the work depends on itself, not as
> permission to start.**
>
> What that changes, and what it does not. It changes the schedule: crews, the
> board, the pact and duels can all be built now, and the committed weekly
> target moves server-side immediately because crew members have to see each
> other's adherence. It does not change any DESIGN decision the evidence
> produced — ranking is still on adherence and never on output, duels are still
> scored on adherence, contact is still consent-in-advance. Those came from the
> trial, not from the sequencing.
>
> The one thing worth keeping from the old gates: they were falsifiable. If the
> pact ships and pact-holders do not beat their own pre-pact baseline, the
> feature is decoration, and the answer is a stake or a deletion rather than
> better copy. That is worth measuring even when nothing is waiting on it.

The original sequencing, kept because the dependency order is still real:

| Phase  | Contains                                        | Entry condition                       | Gate                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0** | F6, the solo Week Board and the reasoned invite | none: it is a self-screen             | Friends is useful at n=1, and LAUNCH.md's empty-state check passes on a fresh account                                                                                                                                         |
| **S1** | F1 crews, F2 Week Board with real members       | at least two accounts training weekly | two crews of 3+ running for two weeks with the board correct against SQL                                                                                                                                                      |
| **S2** | F3 the Pact                                     | S1 gate passed                        | pact-holders hit their weekly target more often than their own pre-pact baseline. **If a stakeless pact does not move it, the feature is decoration: add a stake or delete it, do not iterate the copy.**                     |
| **S3** | F4 duels, F5 recap and the share card           | S2 gate passed                        | GATE B5 as written: 20% more sessions than own four-week baseline, zero moderation incidents, recap shared outside the app once. **Duels must be scored on adherence, never output**, or the trial's result does not transfer |

**The honest precondition on all of it:** per the auto-memory note, the seven
production accounts are not a beta cohort and the app has not been shared. S0 is
buildable today. S1 onward needs people.

---

## Part 7. The open decisions, for Ameen

1. **Does the Pact need a stake?** The sharpest open question in the document.
   The referee evidence (78% against 35%) comes from contracts with money in
   them, and reputation-only contracts are explicitly under-researched. A
   stakeless pact is the intuitive design and the unproven one. S2's gate tests
   it; if it fails, the next experiment is a visible stake, not a louder message.
2. **How wide can the board go?** Settled that ranking is on adherence, not
   output. Unsettled whether the board should stay crew-only. STEP UP says three
   strangers works. Crew-only is the conservative call and may be leaving the
   strongest mechanic in the trial on the table.
3. **Brass.** Unanswered since v3. If duels ship, v5 wants the opponent in brass.
   Ember-only remains the safe default.
4. **Crew size cap.** Eight is reasoned, not measured.
5. **Whether ranks come to Friends at all.** If they do, rank on adherence or
   progression, never absolute e1RM. See Part 5.
6. **Where F7 lives.** It is the growth engine and it is not a Friends feature.
   It needs its own home next to routines and the SEO surface.

---

## Sources

**Trials and academic literature**

- Patel MS et al., [Effectiveness of Behaviorally Designed Gamification Interventions With Social Incentives for Increasing Physical Activity: The STEP UP Randomized Clinical Trial](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749761), _JAMA Internal Medicine_, 2019. n=602, four arms, 24-week intervention plus 12-week follow-up. The competition result and the personal-goal scoring mechanic both come from here.
- [Social comparison of fitness social media postings by fitness app users](https://www.sciencedirect.com/science/article/abs/pii/S0747563222000267), _Computers in Human Behavior_. Downward comparison and self-efficacy.
- [The code of sustainable success in fitness apps: social comparison mechanism](https://pmc.ncbi.nlm.nih.gov/articles/PMC12358456/), PMC. Upward comparison, inferiority, defensive attitudes.
- [Unhealthy Comparisons to Promote Healthy Behavior?](https://dl.acm.org/doi/full/10.1145/3706598.3713737), CHI 2025.
- [Can commitment contracts boost participation in public health programmes?](https://www.sciencedirect.com/science/article/pii/S2214804319300734) The reputation-only evidence gap.
- [Nudges in Exercise Commitment Contracts: A Randomized Trial](https://www.nber.org/system/files/working_papers/w21406/w21406.pdf), NBER w21406.
- [Commitment Lotteries Promote Physical Activity Among Overweight Adults](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6361262/), cluster RCT.
- [stickK: how referees work](https://www.stickk.com/faq/referees/Commitment+Contracts) and [Accountability Partner Apps Ranked by Science](https://www.accountablo.com/blog/accountability-partner-app). The 78% vs 35% referee figure.

**AI reception and UX patterns**

- [Strava Upsets Fans With New AI Feature That Promises Insights But Provides Bland Pep Talks](https://www.forbes.com/sites/cyrusfarivar/2024/10/12/strava-upsets-fans-with-new-ai-feature-that-promises-insights-but-provides-bland-pep-talks/), Forbes; [Strava says its new AI feature is "not a novelty" — but I think it's pointless](https://www.cyclingweekly.com/news/strava-says-its-new-ai-feature-is-not-a-novelty-but-i-think-its-pointless), Cycling Weekly; [Fortune on the memes](https://fortune.com/2024/10/11/strava-app-artificial-intelligence-fitness-athletic-memes).
- [WHOOP Coach powered by OpenAI](https://www.whoop.com/us/en/thelocker/whoop-unveils-the-new-whoop-coach-powered-by-openai/) and [an independent review](https://agent-finder.co/reviews/whoop-coach).
- [AI backlash grows across US, UK and Canada](https://www.prnewswire.com/news-releases/ai-backlash-grows-across-us-uk-and-canada-more-customers-reject-bots-for-human-support-in-2026-302770476.html); [eMarketer: consumer concern drowning out AI excitement](https://www.emarketer.com/content/consumer-concern-drowning-ai-excitement) (brand-trust drop 20%→40%; Gartner's 53% distrust of AI summaries).
- [Calm technology and ambient AI](https://edges.ideo.com/posts/the-ambient-revolution-why-calm-technology-matters-more-in-the-age-of-ai), IDEO; [Just-in-Time Interfaces](https://medium.com/@andrewsims/just-in-time-interfaces-9694a78b7fb0); [The UX of Silence](https://figr.design/blog/the-ux-of-silence).
- [JuggernautAI review](https://www.garagegymreviews.com/juggernautai-review), Garage Gym Reviews; [Best AI fitness apps 2026](https://fast.io/resources/best-ai-fitness-apps-2026/) (the cold-start complaint).
- [Fitness app churn benchmarks](https://retentioncheck.com/churn-benchmarks/fitness-apps) (the fewer-than-three-workouts churn multiplier); [Userpilot on the aha moment](https://userpilot.com/blog/aha-moment/).

**Product and market**

- [Hevy vs Strong (2026)](https://aitoolsbakery.com/blog/hevy-vs-strong-app/) and [Hevy Reviews, Product Hunt](https://www.producthunt.com/products/hevy/reviews). The split sentiment and the network-dependency failure.
- [Boostcamp](https://www.boostcamp.app/) and [Boostcamp on the App Store](https://apps.apple.com/us/app/boostcamp-workout-programs/id1529354455). 1M+ lifters, 300M+ workouts, 10,000+ community programs.
- [Strava Marketing Strategy: Segments, Kudos, and Clubs](https://www.latterly.org/strava-marketing-strategy/) and [How Strava Drives App Engagement](https://www.strivecloud.io/blog/app-engagement-strava). The kudos volume and club mechanics.
- [How to solve the cold-start problem for social products](https://andrewchen.com/how-to-solve-the-cold-start-problem-for-social-products/), Andrew Chen.
- [Workout accountability apps and tools (2026)](https://bossasaservice.com/blog/workout-accountability-app/) and [the Workout With Friends approach](https://bossasaservice.com/blog/workouts-with-friends-apps/). The "cannot replace a person who follows up" finding.
