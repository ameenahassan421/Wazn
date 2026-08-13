import { useEffect, useRef, useState } from 'react'
import {
  ROUTINE_EQUIPMENT,
  ROUTINE_GOALS,
  generateRoutines,
  saveGeneratedRoutines,
  type RoutinePreview,
} from '../lib/ai'
import {
  REVIEW_SECTIONS,
  fetchWeeklyReview,
  recordCoachView,
  type CoachNotes,
} from '../lib/coach'
import { formatWorkoutDate } from '../lib/format'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'

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
  return (
    <div className="flex flex-col gap-5 py-3">
      <NotesCard />
      <RoutineBuilder onSaved={onRoutinesSaved} />
      {/* One footer for the screen, not one per tool: the disclaimer is about
          the tab, and repeating it twice would make it decoration. */}
      <p className="text-[11px] text-muted">{t('coach.disclaimer')}</p>
    </div>
  )
}

/* ── The weekly review ────────────────────────────────────────────────────── */

function NotesCard() {
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

      {state === 'failed' && <p className="text-sm text-muted">{message}</p>}

      {state === 'ready' && notes && !notes.review && !notes.insights?.length && (
        <p className="text-sm text-muted">
          {notes.degraded ? t('coach.quiet') : t('coach.empty')}
        </p>
      )}

      {state === 'ready' && notes?.review && <Review review={notes.review} />}

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
          {t(
            left === 1 ? 'coach.regenerates_left.one' : 'coach.regenerates_left.other',
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
function Review({ review }: { review: NonNullable<CoachNotes['review']> }) {
  const { t } = useLocale()
  const REVIEW_SECTION_KEY: Record<string, string> = {
    adherence: 'coach.review.section.adherence',
    bands: 'coach.review.section.bands',
    plateaus: 'coach.review.section.plateaus',
    wins: 'coach.review.section.wins',
    recommendation: 'coach.review.section.recommendation',
  }
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
