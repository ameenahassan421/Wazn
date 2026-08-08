import { useEffect, useState } from 'react'
import {
  AI_DISCLAIMER,
  ROUTINE_EQUIPMENT,
  ROUTINE_GOALS,
  fetchCoachNotes,
  generateRoutines,
  saveGeneratedRoutines,
  type CoachNotes,
  type RoutinePreview,
} from '../lib/ai'
import { formatWorkoutDate } from '../lib/format'

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
  return (
    <div className="flex flex-col gap-5 py-3">
      <NotesCard />
      <RoutineBuilder onSaved={onRoutinesSaved} />
      {/* One footer for the screen, not one per tool: the disclaimer is about
          the tab, and repeating it twice would make it decoration. */}
      <p className="text-[11px] text-muted">{AI_DISCLAIMER}</p>
    </div>
  )
}

/* ── Coach's notes ────────────────────────────────────────────────────── */

function NotesCard() {
  const [notes, setNotes] = useState<CoachNotes | null>(null)
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
        const result = await fetchCoachNotes({ force })
        if (!active) return
        setNotes(result)
        setState('ready')
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Notes are unavailable.')
        setState('failed')
      }
    })()
    return () => {
      active = false
    }
    // `force` is intentionally part of the key: pressing Regenerate is a new
    // request, not a re-render of the old one.
  }, [reload, force])

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
              'Reading your log…'
            : "Coach's notes"}
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
            Regenerate
          </button>
        )}
      </div>

      {state === 'loading' && (
        <p className="text-sm text-muted">Reading the last few weeks of your log.</p>
      )}

      {state === 'failed' && <p className="text-sm text-muted">{message}</p>}

      {state === 'ready' && notes && notes.insights.length === 0 && (
        <p className="text-sm text-muted">
          Log 3 workouts and the coach will have something to say.
        </p>
      )}

      {state === 'ready' && notes && notes.insights.length > 0 && (
        <ol className="flex flex-col">
          {notes.insights.map((insight, i) => (
            <li key={insight.title} className="relative">
              {i > 0 && <div className="rule-fade my-3" />}
              <div className={i === 0 ? 'relative ps-3' : ''}>
                {/* v2.1: only note #1 carries the knurl band, and severity
                    comes from order rather than colour. One knurl per screen. */}
                {i === 0 && (
                  <span
                    aria-hidden="true"
                    className="knurl absolute inset-block-0 start-0 block w-[4px] rounded-[2px]"
                  />
                )}
                <div className="flex gap-2.5">
                  <span className="tnum shrink-0 font-mono text-xs text-accent">
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
          {notes && `As of ${formatWorkoutDate(notes.generatedAt)} · `}
          {left} regenerate{left === 1 ? '' : 's'} left this week
          {spent ? ' · resets weekly' : ''}
        </p>
      )}
    </section>
  )
}

/* ── Routine builder ──────────────────────────────────────────────────── */

const DAYS = [3, 4, 5] as const

function RoutineBuilder({ onSaved }: { onSaved: () => void }) {
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
      setError(e instanceof Error ? e.message : 'Could not generate a routine.')
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
      setError(e instanceof Error ? e.message : 'Could not save the routine.')
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
      <h2 className="kicker mb-2.5">Build me a routine</h2>

      {error && (
        <p
          role="alert"
          className="mb-2.5 border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <ChipRow
        options={ROUTINE_GOALS.map((g) => ({ id: g.id, label: g.label }))}
        value={goal}
        onChange={setGoal}
      />
      <ChipRow
        options={DAYS.map((n) => ({ id: String(n), label: `${n} days` }))}
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
      />
      <ChipRow
        options={[
          { id: '', label: 'Full gym' },
          ...ROUTINE_EQUIPMENT.filter(
            (e) => e.id === 'dumbbell' || e.id === 'bodyweight',
          ).map((e) => ({ id: e.id, label: e.id === 'bodyweight' ? 'Home' : e.label })),
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
        {busy ? 'Building…' : 'Generate routine'}
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
  return (
    <section className="flex flex-col gap-3">
      <h2 className="kicker">Your routine · not saved yet</h2>

      {error && (
        <p
          role="alert"
          className="border border-accent px-3 py-2 text-sm text-accent"
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
          {plan.droppedExercises.length} suggested exercise
          {plan.droppedExercises.length === 1 ? '' : 's'} were left out because they are
          not in the exercise list.
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="btn-base btn-hero h-[60px] w-full text-[17px] disabled:opacity-45"
      >
        {busy ? 'Saving…' : `Save ${plan.preview.length} routines`}
      </button>
      <button
        type="button"
        onClick={onAdjust}
        disabled={busy}
        className="btn-base btn-secondary h-12 w-full text-sm disabled:opacity-45"
      >
        Adjust
      </button>
      <p className="text-[11px] text-muted">
        Saved routines are ordinary routines — edit or delete them like any other.
        Nothing starts until you start it.
      </p>
    </section>
  )
}
