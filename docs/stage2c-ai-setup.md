# Stage 2C — turning the AI layer on

Everything is built and deployed. **One value is missing**, and it is the only
thing standing between the current state and working Coach's Notes.

## What you need to do

### 1. OpenRouter — create the key

<https://openrouter.ai> → sign in → **Keys** → **Create Key**.

Name it `wazn-production`. Copy it; OpenRouter shows it once.

While you are there, set the spend cap the plan asks for: **Settings →
Credits → limit `$20`/month**, with an alert. Raising it later is a deliberate
act; discovering the bill is not.

### 2. Supabase — add it as a secret

**This is the exact place.** Not `.env`, not Vercel, not a `VITE_` variable —
the key must never reach a browser.

> Supabase Dashboard → your project → **Project Settings** → **Edge Functions**
> → **Secrets** → **Add new secret**
>
> - Name: `OPENROUTER_API_KEY`
> - Value: the key from step 1
>
> Direct link:
> `https://supabase.com/dashboard/project/ttasiwxeqerhsztxjxip/settings/functions`

Or, if you prefer the CLI:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-... --project-ref ttasiwxeqerhsztxjxip
```

Nothing needs redeploying afterwards. Edge Functions read secrets at
invocation, so the next time Progress opens it will just work.

### 3. Tell me

Say "the key is in" and I will run the quality bar: generate Coach's Notes
against your real nine-month history and paste the verbatim output into the PR
for you to read **before any other user can see theirs**.

---

## What is already done, so you do not go looking for it

| Thing                            | State                                                      |
| -------------------------------- | ---------------------------------------------------------- |
| `coach-notes` Edge Function      | deployed, v1, ACTIVE, `verify_jwt` on                      |
| `generate-routine` Edge Function | deployed, v1, ACTIVE, `verify_jwt` on                      |
| Migration `0010_ai_layer.sql`    | applied — `coach_notes`, `ai_generations`, `coach_stats()` |
| `COACH_MODEL`                    | `moonshotai/kimi-k2.5`                                     |
| `COACH_MODEL_FREE`               | `moonshotai/kimi-k2.5:free`                                |
| `ROUTINE_MODEL`                  | `moonshotai/kimi-k2.5`                                     |
| `ROUTINE_MODEL_FREE`             | `moonshotai/kimi-k2.5:free`                                |
| `OPENROUTER_API_KEY`             | **missing — this is step 2**                               |

**One caveat on the model ids.** This environment cannot reach `openrouter.ai`,
so the four slugs above are the ones the plan names, not ones verified against
OpenRouter's live model list. If a call fails with "model not found", the fix
is to correct the value in the same Secrets screen — that is the whole reason
model ids are environment variables and not code.

## How it behaves before the key lands

Both functions return `503` with
`"OPENROUTER_API_KEY is not set on this project"`. On the Progress screen that
surfaces as one quiet line under a "Coach's notes" heading. Nothing else on the
screen is affected: every number on Progress is computed in SQL and rendered
without the model. That is the design, not a fallback.

## Cost, and what limits it

- **Coach's Notes regenerate only when a newer workout exists.** Opening
  Progress ten times in an evening is one cached read and zero model calls.
  Cost tracks _training_, not app opens.
- **Free-tier quotas:** notes at most once a week per user, routines three per
  month. Enforced in the Edge Function against the `ai_generations` ledger,
  which a client cannot write to or delete from.
- **The `:free` variant is tried first**, with automatic fallback to the paid
  model on `429` (rate limited) or `402` (out of free credit). Which one served
  a request is recorded in `ai_generations.used_free`, so
  "is the free tier actually carrying this?" is one query.
- **Every request is capped** at 900 output tokens and 45 seconds.

## Checking on it later

```sql
-- who generated what, and whether it was free
select feature, model, used_free, count(*), max(created_at)
from ai_generations group by 1,2,3 order by 5 desc;
```

## What is deliberately not sent

The prompt is built from `coach_stats()` and nothing else, and that function
returns exercise names and numbers. No email, no display name, no user id, no
workout names, no notes you have written. The function's column list _is_ the
privacy boundary — which is why it is a boundary you can read in one place
rather than a rule spread across a codebase.

The Edge Function never accepts a user id either. It cannot: `coach_stats()`
takes no arguments and runs `security invoker` under the caller's own JWT, so
RLS decides whose numbers come back.
