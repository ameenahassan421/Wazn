import { useEffect, useRef, useState } from 'react'
import {
  ROUTINE_EQUIPMENT,
  ROUTINE_GOALS,
  generateRoutines,
  saveGeneratedRoutines,
  type RoutinePreview,
} from '../lib/ai'
import {
  QUOTA_VISIBLE_AT,
  REVIEW_SECTIONS,
  fetchWeeklyReview,
  recordCoachView,
  type CoachNotes,
} from '../lib/coach'
import { formatWorkoutDate } from '../lib/format'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import { useCoach } from '../lib/coach-context'
import { showsCoachSurfaces } from '../lib/coach-mode'
import { ModeSelector } from '../components/ModeSelector'

/**
 * The Coach tab — design v2.1 screen 01.
 *
 * Two bounded tools and **no chat surface anywhere**. That is the load-bearing
 * constraint, not a stylistic one: a chat box is an invitation to ask a
 * language model for training advice, which is the thing §2C spent its whole
 * design avoiding. Notes read the lifter's own numbers back to them; the
 * builder is three questions and one button. Everything the model says is
 * anchored to a figure computed in SQL.
 */

export function CoachScreen({ onRoutinesSaved }: { onRoutinesSaved: () => void }) {
  const { t } = useLocale()
  const {
    mode,
    volume,
    meetDate,
    weeklyTarget,
    setMode,
    setMeetDate,
    setWeeklyTarget,
  } = useCoach()
  const builderRef = useRef<HTMLDivElement>(null)
  /**
   * The regenerate quota, lifted so the screen footer can carry it — v3 §03
   * draws it there, on one line with the disclaimer, as "the architecture that
   * later becomes the pro-tier seam".
   *
   * Reported UP from the notes card rather than fetched again: two requests
   * for one number is two chances for the footer and the card to disagree
   * about how many regenerates are left.
   */
  const [regeneratesLeft, setRegeneratesLeft] = useState<number | null>(null)

  /**
   * v3 §09 orders this tab: mode selector, weekly review, then the builder,
   * then the footer with the quota. The mode selector goes first because it is
   * the thing that changes what everything below it means.
   *
   * Coach volume `off` renders the v2.2 tab verbatim — no selector, no review
   * card, just the notes and the builder. That is the acceptance item, and it
   * is one condition rather than a prop threaded through five components.
   */
  const speaks = showsCoachSurfaces(volume)

  return (
    <div className="flex flex-col gap-5 py-3">
      {speaks && (
        <ModeSelector
          mode={mode}
          meetDate={meetDate}
          onSelectMode={setMode}
          onSetMeetDate={setMeetDate}
        />
      )}

      <NotesCard
        v3={speaks}
        onQuota={setRegeneratesLeft}
        weeklyTarget={weeklyTarget}
        onWeeklyTarget={setWeeklyTarget}
        onApply={() =>
          builderRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      />

      <div ref={builderRef}>
        <RoutineBuilder onSaved={onRoutinesSaved} />
      </div>

      {/* One footer for the screen, not one per tool: the disclaimer is about
          the tab, and repeating it twice would make it decoration. v3 draws it
          centred, at the nano step, with the quota on the same line — the
          architecture that later becomes the pro-tier seam, priced-shaped
          already and free at launch. */}
      <p
        className="meta-mono text-nano text-center tracking-[0.08em] uppercase"
        style={{ color: 'var(--ghost-ink)' }}
      >
        {[
          t('coach.footer'),
          // Only once there is a number. "N regenerates left" with N unknown
          // is the footer inventing a quota.
          regeneratesLeft === null
            ? null
            : t('coach.footer.quota', { n: String(regeneratesLeft) }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

/* ── The weekly review ────────────────────────────────────────────────────── */

function NotesCard({
  v3,
  weeklyTarget,
  onWeeklyTarget,
  onApply,
  onQuota,
}: {
  /** False under Coach volume Quiet/Off: the v2.2 card, verbatim. */
  v3: boolean
  weeklyTarget: number
  onWeeklyTarget: (n: number) => void
  onApply: () => void
  /** Reports the regenerate quota up to the screen footer. */
  onQuota: (left: number | null) => void
}) {
  const { t } = useLocale()
  /**
   * `t` changes identity with the locale, and the effect below fetches.
   * Adding it to the deps would re-run that load on every language toggle.
   * Assigned in an effect, not during render: `react-hooks/refs` rejects a
   * render-time ref write.
   */
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  // Same shape and same reason: a fresh arrow from the parent must not
  // re-run the fetch below.
  const quotaRef = useRef(onQuota)
  useEffect(() => {
    quotaRef.current = onQuota
  }, [onQuota])
  // The review quotes e1RM figures, so it is written in whichever unit the
  // header toggle is showing — see `_shared/display-units.ts`. Flipping the
  // toggle refetches; the function caches per unit, so a unit already seen
  // costs nothing.
  const { unit } = useUnit()
  const [notes, setNotes] = useState<CoachNotes | null>(null)
  // GATE B1's instrument, on the third surface. Fired once the review is
  // actually on screen, never on mount — a tab that failed to load was not
  // read.
  const viewed = useRef(false)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [force, setForce] = useState(false)

  // `loading` is set by whatever *causes* a fetch — the initial state, or the
  // Regenerate handler — never inside the effect. `eslint-plugin-react-hooks`
  // v7 forbids synchronous setState in an effect body (see CLAUDE.md), and it
  // is right to: the effect's job is the request, not the spinner.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const result = await fetchWeeklyReview(unit, { force })
        if (!active) return
        setNotes(result)
        setState('ready')
        quotaRef.current(result.regeneratesLeft ?? null)
        if (!viewed.current && (result.review || result.insights?.length)) {
          viewed.current = true
          void recordCoachView('weekly_review', 'view')
        }
      } catch (error) {
        if (!active) return
        setMessage(
          error instanceof Error
            ? error.message
            : tRef.current('coach.notes.unavailable'),
        )
        setState('failed')
      }
    })()
    return () => {
      active = false
    }
    // `force` is intentionally part of the key: pressing Regenerate is a new
    // request, not a re-render of the old one.
  }, [reload, force, unit])

  const left = notes?.regeneratesLeft ?? 0
  const spent = left <= 0

  return (
    <section
      className="ring-edge bg-surface px-3 py-3"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <div className="mb-2.5 flex items-baseline gap-2">
        {/* The label and the action, and nothing else. "as of <date>" used to
            live here too, and three items would not fit 390px: the row wrapped
            and left "Aug 8" orphaned on a line of its own under Regenerate.
            Freshness is metadata about the note, so it sits with the other
            metadata in the footer — one line each, neither able to push the
            other. */}
        <h2 className="kicker flex-1">
          {state === 'loading'
            ? // v2.1: the loading state is a kicker, not a skeleton. A shimmer
              // implies a layout is coming; this is waiting on a sentence.
              t('coach.loading')
            : // B2: it is a review of a week, and saying so is what tells a
              // reader the shape will be the same next week.
              t('coach.this_week')}
        </h2>
        {state === 'ready' && (
          <button
            type="button"
            disabled={spent}
            onClick={() => {
              setState('loading')
              setForce(true)
              setReload((n) => n + 1)
            }}
            className="btn-base btn-quiet h-9 px-2 text-[13px] disabled:opacity-45"
          >
            {t('coach.regenerate')}
          </button>
        )}
      </div>

      {state === 'loading' && (
        <p className="text-sm text-muted">{t('coach.loading.body')}</p>
      )}

      {/* A failure gets a way out, not just a sentence. The Regenerate
          control above is gated on `state === 'ready'`, so when the fetch
          threw — network, 5xx, quota — this card rendered muted text that
          looked exactly like the "no news this week" state and offered
          nothing to press. The retry does NOT set `force`: a failed call
          produced nothing, so re-asking must not spend a regeneration. */}
      {state === 'failed' && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">{message}</p>
          <button
            type="button"
            onClick={() => {
              setState('loading')
              setReload((n) => n + 1)
            }}
            className="btn-base btn-secondary h-12 px-4 text-sm"
          >
            {t('coach.retry')}
          </button>
        </div>
      )}

      {state === 'ready' && notes && !notes.review && !notes.insights?.length && (
        <p className="text-sm text-muted">
          {notes.degraded ? t('coach.quiet') : t('coach.empty')}
        </p>
      )}

      {state === 'ready' && notes?.review && (
        <Review
          review={notes.review}
          v3={v3}
          weeklyTarget={weeklyTarget}
          onWeeklyTarget={onWeeklyTarget}
          onApply={onApply}
        />
      )}

      {/* The pre-B2 list, still in some caches. Rendered rather than migrated:
          a user whose weekly regenerate is spent should read last week's notes
          rather than an apology, and the shape is gone the moment they
          regenerate. See the stale-cache branch in `coach-notes`. */}
      {state === 'ready' && !notes?.review && !!notes?.insights?.length && (
        <ol className="flex flex-col">
          {notes.insights.map((insight, i) => (
            <li key={insight.title} className="relative">
              {i > 0 && <div className="rule-fade my-3" />}
              <div className={i === 0 ? 'relative ps-3' : ''}>
                {i === 0 && (
                  <span
                    aria-hidden="true"
                    className="knurl absolute inset-block-0 start-0 block w-[4px] rounded-[2px]"
                  />
                )}
                <div className="flex gap-2.5">
                  <span className="tnum shrink-0 font-mono text-xs text-accent-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">
                      {insight.title}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">{insight.body}</p>
                    {insight.chip && (
                      <span className="chip-data mt-2 inline-flex">{insight.chip}</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {state === 'ready' && (
        <p className="mt-3 text-[11px] text-muted">
          {notes?.generatedAt &&
            t('coach.as_of', { date: formatWorkoutDate(notes.generatedAt) })}
          {/* Only once the count is a thing the reader is actually managing.
              The limits became loop backstops rather than product rules on
              2026-08-14 (see `_shared/quota.ts`), and this line rendered the
              raw number — so the footer would have read "500 regenerates left
              this week", which is not information, it is furniture. Below
              QUOTA_VISIBLE_AT it is a real warning again and comes back. */}
          {left <= QUOTA_VISIBLE_AT &&
            t(
              left === 1
                ? 'coach.regenerates_left.one'
                : 'coach.regenerates_left.other',
              { count: String(left) },
            )}
          {spent ? t('coach.resets_weekly') : ''}
          {/* An older answer served because the week's regenerate is spent.
              Said plainly here rather than dressed as an error: the numbers in
              it were true when it was written, and it refreshes on its own. */}
          {notes?.stale ? t('coach.stale') : ''}
        </p>
      )}
    </section>
  )
}

/**
 * The weekly review — B2, offense plan §3-A3.
 *
 * The same five sections, in the same order, every week. That fixed shape is
 * the feature: the list it replaced re-ordered itself weekly, so two reviews
 * could not be compared and there was nothing to learn to read. Here, "how am
 * I doing on volume" is always the second row.
 *
 * The section labels are the app's mono meta voice and carry no numbers — a
 * label that changed with the content would defeat the point of a fixed row.
 * Severity still comes from order rather than colour, and the one knurl on the
 * screen marks the recommendation, because that is the row to act on.
 */
function Review({
  review,
  v3,
  weeklyTarget,
  onWeeklyTarget,
  onApply,
}: {
  review: NonNullable<CoachNotes['review']>
  v3: boolean
  weeklyTarget: number
  onWeeklyTarget: (n: number) => void
  onApply: () => void
}) {
  const { t } = useLocale()
  const REVIEW_SECTION_KEY: Record<string, string> = {
    adherence: 'coach.review.section.adherence',
    bands: 'coach.review.section.bands',
    plateaus: 'coach.review.section.plateaus',
    wins: 'coach.review.section.wins',
    recommendation: 'coach.review.section.recommendation',
  }

  /**
   * v3 §09 splits this one list into two surfaces, from the same data:
   *
   *   **The week review** — the `recommendation` section. It is the row to act
   *   on, so v3 gives it its own card and two buttons ("last week's numbers →
   *   this week's plan, Apply / Adjust") instead of a knurl rail.
   *
   *   **Coach's Notes** — the other four sections, as numbered rows behind a
   *   4px accent rail.
   *
   * Nothing is regenerated to do this and no new model call is made: the same
   * five sections the Edge Function has always returned are read into the
   * shape the design draws. Under Coach volume Quiet or Off, `v3` is false and
   * this renders the v2.2 list verbatim.
   */
  const recommendation = review.sections?.recommendation
  const notes = REVIEW_SECTIONS.filter((key) => key !== 'recommendation')

  if (!v3) {
    return (
      <div>
        {review.headline && (
          <p className="text-[17px] font-semibold leading-snug">{review.headline}</p>
        )}
        <ol className="mt-3 flex flex-col">
          {REVIEW_SECTIONS.map((key, i) => {
            const section = review.sections?.[key]
            if (!section?.line) return null
            const isRecommendation = key === 'recommendation'
            return (
              <li key={key} className="relative">
                {i > 0 && <div className="rule-fade my-3" />}
                <div className={isRecommendation ? 'relative ps-3' : ''}>
                  {isRecommendation && (
                    <span
                      aria-hidden="true"
                      className="knurl absolute inset-block-0 start-0 block w-[4px] rounded-[2px]"
                    />
                  )}
                  <p className="kicker">{t(REVIEW_SECTION_KEY[key])}</p>
                  <p
                    className={`mt-1 leading-snug ${
                      isRecommendation
                        ? 'text-[15px] font-medium'
                        : 'text-[13px] text-muted'
                    }`}
                  >
                    {section.line}
                  </p>
                  {section.chip && (
                    <span className="chip-data mt-2 inline-flex">{section.chip}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {review.headline && (
        <p className="text-[17px] leading-snug font-semibold">{review.headline}</p>
      )}

      {recommendation?.line && (
        <WeekReviewCard
          line={recommendation.line}
          chip={recommendation.chip}
          weeklyTarget={weeklyTarget}
          onWeeklyTarget={onWeeklyTarget}
          onApply={onApply}
        />
      )}

      <ol className="flex flex-col gap-2.5">
        {notes.map((key, i) => {
          const section = review.sections?.[key]
          if (!section?.line) return null
          return (
            <li
              key={key}
              className="flex gap-3 px-4 py-3.5"
              style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-panel)',
                boxShadow: 'var(--shadow-card)',
                // The design's rail. `border-inline-start` rather than
                // `border-left`, so it stays on the reading edge in Arabic.
                borderInlineStart: '4px solid var(--color-accent)',
              }}
            >
              <span
                dir="ltr"
                className="tnum shrink-0 font-mono text-[11px] text-accent-300"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <p className="text-[15px] leading-snug font-semibold">{section.line}</p>
                {section.chip && (
                  <span dir="ltr" className="chip-data tnum">
                    {section.chip}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * `WEEK REVIEW · MON` — last week's numbers, this week's plan, Apply / Adjust.
 *
 * ── WHAT THE TWO BUTTONS HONESTLY DO ────────────────────────────────────────
 * **Apply to week** scrolls to the routine builder, which is the one bounded
 * tool in this app that can actually rewrite a week, and which previews before
 * it saves (§08: "preview before save, v2.1 builder flow"). It does not write
 * anything on its own — the AI proposes, the lifter commits, and a button on a
 * summary card that silently edited routines would break that in the one place
 * the doctrine is most load-bearing.
 *
 * **Adjust** opens the number the review is measured against: the weekly
 * session target. That is the honest "adjust" for this card — the review says
 * "three sessions" against a target the lifter set, and changing the target is
 * the only edit that changes what next week's review will say.
 */
function WeekReviewCard({
  line,
  chip,
  weeklyTarget,
  onWeeklyTarget,
  onApply,
}: {
  line: string
  chip?: string
  weeklyTarget: number
  onWeeklyTarget: (n: number) => void
  onApply: () => void
}) {
  const { t } = useLocale()
  const [adjusting, setAdjusting] = useState(false)

  return (
    <section
      aria-labelledby="week-review-kicker"
      className="flex flex-col items-start gap-2.5 p-4"
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-panel)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <h3 id="week-review-kicker" className="kicker">
        {t('coach.week_review')}
      </h3>
      <p className="text-[14px] leading-[1.5]">{line}</p>
      {chip && (
        <span dir="ltr" className="chip-data tnum">
          {chip}
        </span>
      )}

      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={onApply}
          className="btn-base btn-hero press h-11 flex-1 text-[15px]"
          style={{ borderRadius: 10 }}
        >
          {t('coach.apply_week')}
        </button>
        <button
          type="button"
          onClick={() => setAdjusting((open) => !open)}
          aria-expanded={adjusting}
          className="btn-base btn-secondary press h-11 flex-1 text-[15px]"
          style={{ borderRadius: 10 }}
        >
          {t('coach.adjust')}
        </button>
      </div>

      {adjusting && (
        <div className="flex w-full items-center gap-2">
          <span className="flex-1 text-[13px] text-muted">{t('coach.target')}</span>
          <button
            type="button"
            aria-label={t('coach.target.fewer')}
            onClick={() => onWeeklyTarget(weeklyTarget - 1)}
            className="btn-base btn-secondary h-12 w-12 text-lg"
          >
            −
          </button>
          <span
            dir="ltr"
            className="font-display tnum w-8 text-center text-[15px] font-medium"
          >
            {weeklyTarget}
          </span>
          <button
            type="button"
            aria-label={t('coach.target.more')}
            onClick={() => onWeeklyTarget(weeklyTarget + 1)}
            className="btn-base btn-secondary h-12 w-12 text-lg"
          >
            +
          </button>
        </div>
      )}
    </section>
  )
}

/* ── Routine builder ──────────────────────────────────────────────────── */

const DAYS = [3, 4, 5] as const

// `ROUTINE_GOALS` ids are the `../lib/ai` constants; they are data, not UI
// strings, so the chip labels are looked up here rather than editing the
// catalogue that produces the routine.
const GOAL_KEY: Record<string, string> = {
  strength: 'coach.goal.strength',
  muscle: 'coach.goal.muscle',
  'general fitness': 'coach.goal.general',
  endurance: 'coach.goal.endurance',
}

function RoutineBuilder({ onSaved }: { onSaved: () => void }) {
  const { t } = useLocale()
  const [goal, setGoal] = useState<string>('muscle')
  const [days, setDays] = useState<number>(4)
  const [equipment, setEquipment] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RoutinePreview | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      setPreview(
        await generateRoutines({ goal, days, equipment: equipment ? [equipment] : [] }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('coach.generate.error'))
    } finally {
      setBusy(false)
    }
  }

  async function keep() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      await saveGeneratedRoutines(preview.preview)
      setPreview(null)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('coach.save.error'))
    } finally {
      setBusy(false)
    }
  }

  // The preview takes the whole screen: it is a decision, and a decision
  // rendered in a card below a form competes with the form that produced it.
  if (preview) {
    return (
      <RoutinePreviewScreen
        plan={preview}
        busy={busy}
        error={error}
        onSave={() => void keep()}
        onAdjust={() => setPreview(null)}
      />
    )
  }

  return (
    <section
      className="px-3 py-3"
      style={{
        border: '1px dashed color-mix(in srgb, var(--color-accent) 45%, transparent)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <h2 className="kicker mb-2.5">{t('coach.build')}</h2>

      {error && (
        <p
          role="alert"
          className="mb-2.5 border border-accent px-3 py-2 text-sm text-accent-300"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <ChipRow
        options={ROUTINE_GOALS.map((g) => ({
          id: g.id,
          label: t(GOAL_KEY[g.id] ?? g.id),
        }))}
        value={goal}
        onChange={setGoal}
      />
      <ChipRow
        options={DAYS.map((n) => ({
          id: String(n),
          label: t('coach.days', { count: String(n) }),
        }))}
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
      />
      <ChipRow
        options={[
          { id: '', label: t('coach.equipment.full_gym') },
          ...ROUTINE_EQUIPMENT.filter(
            (e) => e.id === 'dumbbell' || e.id === 'bodyweight',
          ).map((e) => ({
            id: e.id,
            label:
              e.id === 'bodyweight'
                ? t('coach.equipment.home')
                : t('coach.equipment.dumbbell'),
          })),
        ]}
        value={equipment}
        onChange={setEquipment}
      />

      {/* The screen's one hero. */}
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="btn-base btn-hero mt-1 h-[60px] w-full text-[17px] disabled:opacity-45"
      >
        {busy ? t('coach.building') : t('coach.generate')}
      </button>
    </section>
  )
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="mb-2.5 flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id || 'any'}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`btn-base h-12 px-4 text-sm ${on ? 'btn-primary' : 'btn-secondary'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function RoutinePreviewScreen({
  plan,
  busy,
  error,
  onSave,
  onAdjust,
}: {
  plan: RoutinePreview
  busy: boolean
  error: string | null
  onSave: () => void
  onAdjust: () => void
}) {
  const { t } = useLocale()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="kicker">{t('coach.preview.title')}</h2>

      {error && (
        <p
          role="alert"
          className="border border-accent px-3 py-2 text-sm text-accent-300"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      {plan.preview.map((day) => (
        <div
          key={day.name}
          className="ring-edge bg-surface px-3 py-2.5"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="text-[15px] font-medium">{day.name}</p>
          <ul className="mt-1.5 flex flex-col">
            {day.exercises.map((e, i) => (
              <li key={e.id}>
                {i > 0 && <div className="rule-solid" />}
                <div className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                  <span className="tnum shrink-0 font-mono text-[13px] text-muted">
                    {e.sets} × {e.reps}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {plan.droppedExercises.length > 0 && (
        <p className="text-[11px] text-muted">
          {t(
            plan.droppedExercises.length === 1
              ? 'coach.dropped.one'
              : 'coach.dropped.other',
            { count: String(plan.droppedExercises.length) },
          )}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="btn-base btn-hero h-[60px] w-full text-[17px] disabled:opacity-45"
      >
        {busy
          ? t('coach.preview.saving')
          : t('coach.preview.save', { count: String(plan.preview.length) })}
      </button>
      <button
        type="button"
        onClick={onAdjust}
        disabled={busy}
        className="btn-base btn-secondary h-12 w-full text-sm disabled:opacity-45"
      >
        {t('coach.preview.adjust')}
      </button>
      <p className="text-[11px] text-muted">{t('coach.preview.helper')}</p>
    </section>
  )
}
