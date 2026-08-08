-- Make the AI layer observable.
--
-- `docs/INFRASTRUCTURE_AUDIT.md` §3-A3: `ai_generations` had five columns —
-- (user_id, feature, model, used_free, created_at) — and `recordGeneration()`
-- ran only after a success. So every question `BEATING_HEVY_PLAN` §12 promises
-- the ledger would answer was unanswerable:
--
--   "ledger-derived $/weekly-active"      no token counts
--   "alarm at $0.10"                      no cost input at all
--   "hallucinated-figure rate"            no output stored
--   "median answer < 8s" (GATE B3)        no latency
--   free-tier carry rate under load       successes only
--   parse-failure / truncation rates      failures never recorded
--   "the notes got worse after I changed X"   model stored, prompt not
--
-- Two production incidents are already written into the code comments —
-- truncation misdiagnosed as "the model returned junk" (twice), and two users
-- burning a weekly regenerate on an empty account. Both were found by a person
-- noticing. Neither should have needed noticing.
--
-- A4 (prompt versioning) and A3 (ledger columns) are one migration rather than
-- the two tranches the audit lists them in, because they alter the same two
-- tables and a column that exists but is not yet written is harmless. Fewer
-- migrations to apply is worth more than matching the tranche numbering.

-- ── The ledger grows the columns the plan already spends ────────────────────
alter table public.ai_generations
  -- Every attempt is now recorded, successful or not — quotas still count only
  -- successes (see the partial index below). `true` as the default is the
  -- correct backfill: every row that already exists is a success, because a
  -- failure could not previously produce a row.
  add column if not exists ok boolean not null default true,
  -- A short machine-readable class, not a message: 'parse', 'truncated',
  -- 'quota', 'provider_429', 'provider_5xx', 'timeout', 'ungrounded'. Grouping
  -- by a free-text message is grouping by a typo.
  add column if not exists error_code text,
  -- Wall clock for the whole call including any free -> paid fallback, which
  -- is what the user waited. GATE B3's "median answer < 8s" is this column.
  add column if not exists latency_ms integer,
  -- The provider's own answer to "why did it stop". A truncated response and a
  -- malformed one are indistinguishable once parsing fails and need opposite
  -- fixes; this has already been diagnosed wrong twice.
  add column if not exists finish_reason text,
  add column if not exists tokens_in integer,
  add column if not exists tokens_out integer,
  -- Prompts change more often than models do, so `model` alone could never
  -- answer "the notes got worse after Tuesday".
  add column if not exists prompt_version text,
  -- Zero until the tool loop exists (audit §3-A1). Part of B3's cost shape:
  -- a question that made four tool calls cost four round trips.
  add column if not exists tool_calls integer not null default 0;

comment on column public.ai_generations.ok is
  'False rows are recorded attempts that failed. Quota counts successes only — see ai_generations_quota_idx.';

-- Quotas are derived by counting this table, so once failures land in it the
-- count has to exclude them or a provider outage would spend the user's week.
-- A partial index makes that the cheap path rather than the careful one.
create index if not exists ai_generations_quota_idx
  on public.ai_generations (user_id, feature, created_at desc)
  where ok;

-- ── The cache records which prompt wrote it ────────────────────────────────
alter table public.coach_notes
  add column if not exists prompt_version text;

comment on column public.coach_notes.prompt_version is
  'The PROMPT_VERSION const in the Edge Function that produced these insights. Stored for the same reason `model` is: "the notes got worse" is otherwise unanswerable.';

-- No RLS change. Both tables keep select-own for `authenticated` and no write
-- policy at all; the Edge Function writes them under the service role, because
-- a client that could write here could put any text behind the "AI-generated"
-- label or delete its own quota ledger.
