# LAUNCH.md — the checks to run before invites go out

Ameen: this is the list. Run it **with a second account**, on a **real phone**,
before you send a link to anybody. Most of it takes one session in the gym plus
about twenty minutes at a table.

The point of a second account is that almost every way this can embarrass you
is invisible from your own. Your account has nine months of history, a filled-in
profile and every feature already exercised. A friend's account has none of
that, and it is the one that will find the empty screen nobody looked at.

You will need: your phone, a second email address you can receive mail at
(a spare Gmail is fine), and preferably a second device or a private window.

---

## 0. Before you start

- [ ] `OPENROUTER_API_KEY` is set in Supabase → Project Settings → Edge
      Functions → Secrets, and the $20/month cap is set on OpenRouter.
      See `docs/stage2c-ai-setup.md`.
- [ ] The OpenRouter model ids resolve — Coach's Notes on your own account
      produce text rather than an error line.
- [ ] `main` is deployed and green on Vercel.

---

## 1. A brand-new person, from nothing

Do this in a private window, signed out, with the second email.

- [ ] **Sign-in works from a non-owner address.** The code arrives from
      **Wazn &lt;code@trywazn.app&gt;**, not from `onboarding@resend.dev`.
- [ ] It is **six digits**, and it is **in the inbox, not spam**. If it is in
      spam, stop — DKIM or SPF is wrong, and every invite you send lands there.
- [ ] Entering it signs you in at `https://www.trywazn.app`.
- [ ] The **welcome screen** appears: "Log a set in under thirty seconds",
      with "Draft me a routine" and "I will just start logging".
- [ ] Tap **"I will just start logging"**. You land on the Log tab with a
      single "Start your first workout" button and nothing else demanding
      attention.

### Every screen with zero data

Go through all four tabs on this empty account. None of them may look broken,
and none may show a number that is not there.

- [ ] **Log** — one button. No streak line, no routines list clutter.
- [ ] **History** — "No workouts yet. Log one on the Log tab…"
- [ ] **Progress** — one sentence: "Nothing to chart yet." **Not** three empty
      sub-tabs stacked on each other.
- [ ] **Friends → Feed** — "Nothing here yet. Follow someone on the You tab…"
- [ ] **Friends → This week** — "A leaderboard needs someone to stand next to."
- [ ] **Friends → You** — visibility set to **Private**, and it says so.

---

## 2. The invite flow, end to end

On **your** account:

- [ ] Friends → You → set visibility to **Followers**.
- [ ] Set a username. Save it. It sticks after a reload.
- [ ] **Get my link**, then **Share**. You get a
      `https://www.trywazn.app/join/…` URL.

Send it to the second account. On that device:

- [ ] Opening the link shows the sign-in screen with **"&lt;your name&gt; invited
      you"** above the form — _before_ signing in.
- [ ] The address bar shows `/`, not `/join/…`.
- [ ] Sign in. The welcome screen offers **"Follow &lt;your name&gt;"**.
- [ ] Tap it. It changes to "Following".
- [ ] Friends → Feed now shows your finished workouts: name, duration,
      volume, sets, and a **PR** badge on sessions that set records.
- [ ] Tap the plate icon to like one. The count goes up and **survives a
      reload**.
- [ ] Friends → This week shows both of you, with your own row tinted.

---

## 3. Privacy — the part that is embarrassing to get wrong

Still on the second account:

- [ ] Start a workout on **your** account and leave it running. The second
      account must **not** see it anywhere. In-progress is never shared.
- [ ] On your account, set visibility back to **Private**. On the second
      account, reload: **the feed empties**, even though the follow still
      exists.
- [ ] Set it back to **Followers** and confirm the feed returns.
- [ ] From the second account, try to follow a username that does not exist.
      You get "No one found at @…", not a crash.

If any of this fails, do not send invites. `supabase/tests/rls_social.sql`
proves the database rules; a failure here means the app is asking the wrong
question, which is still a leak.

---

## 4. A real session, on your own account, in the gym

This is the one that cannot be done at a table.

- [ ] Start a workout. **The screen stays on** through a full set and a rest
      period — you should never have to unlock the phone to log the next set.
- [ ] Log a set one-handed in **under 30 seconds** from picking up the phone.
- [ ] The previous session's numbers appear inline while entering.
- [ ] The rest timer counts down in-flow and **is silent** when it finishes —
      amber ring and "Rest done", no beep. (If it beeps, something regressed.)
- [ ] Set a personal record. The row **flashes amber once** and keeps a faint
      tint. No confetti, no modal.
- [ ] Leave the app mid-workout and come back. Your workout is still open and
      the timer is still honest.
- [ ] Press the Android back gesture (or the iOS swipe) from inside the
      picker. It returns to the workout, **it does not close the app**.
- [ ] Finish. The summary shows duration, volume, sets and any PRs.
- [ ] History's top row now shows that session with volume and set count.

---

## 5. The AI surfaces

- [ ] Progress → **Coach's notes** shows 3–5 observations that reference your
      actual lifts and numbers. It says **"AI-generated — not medical advice."**
- [ ] Reopen Progress. It does **not** regenerate — same text, instantly. It
      should only change after you log something new.
- [ ] Log → Routines → **Generate**. Pick a goal, days and equipment.
- [ ] The routines that appear contain **only real exercises** you can find in
      the picker. Nothing invented.
- [ ] Nothing was started automatically — you still have to tap Start.
- [ ] You can edit and delete them like any hand-built routine.

---

## 6. Install

- [ ] After at least one logged workout, the Log screen offers **Add to home
      screen**. It did **not** offer it on the very first visit.
- [ ] Install it. The icon is the Wazn mark, not a screenshot.
- [ ] The installed app opens **full screen**, no browser bar.
- [ ] Sign-in still works inside the installed app.
- [ ] "Not now" makes the offer stay gone.

---

## 7. Housekeeping before you send anything

- [ ] The four **zero-set test workouts** are deleted (say "delete all my
      workouts with zero sets").
- [ ] The `test_a` / `test_b` usernames are not on real profiles. (The RLS
      test rolls back, so they should not be — check anyway.)
- [ ] Your own profile visibility is what you actually want it to be.

---

## What is deliberately NOT on this list

**Offline logging.** It is a fast-follow, built while the cohort is live, and
it is not in this build. If a tester loses signal mid-workout, the set will
fail to save. Tell them that up front — it is the single most likely thing to
cost somebody real data, and a known limitation is a different conversation
from a surprise.

**App Store / Play Store.** Stage 4B, after beta.

---

## What to tell the cohort

The framing the plan asks for, more or less verbatim:

> You're beta testers, not users. Things will break. Tell me everything — and
> especially tell me the moment you reach for another app instead of this one,
> because that moment is the whole point of the test.

Ask them for one thing specifically: **every time logging a set took longer
than it should have.** That is the number the entire app is built around, and
it is the only feedback nobody else can give you.
