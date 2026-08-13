import { useRef, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { analyse } from '../lib/hevy-import'
import type { ImportPlan, PlannedWorkout } from '../lib/hevy-import'
import { formatCount, formatWorkoutDate } from '../lib/format'
import type { Exercise } from '../lib/types'
import { deriveEquipment, deriveMuscleGroup } from '../lib/exercise-guess'
import { useLocale } from '../lib/locale-context'

/**
 * "Bring your history from Hevy" — offense plan §9-F1.
 *
 * The strongest reason to stay with Hevy is three years of logged sets. Hevy
 * offers no competitor import, so this is asymmetric by construction, and the
 * hard part was already written and tested as a Node script.
 *
 * It is also the best onboarding this app can have. Design v2.2 put a
 * previous-session ghost on every row of the board; for a switcher that ghost
 * is empty until they have logged twice. With their history in, the retention
 * engine fires on day one instead of week three.
 *
 * ── The rule this screen is built around ───────────────────────────────────
 * Show what will happen before it happens. This is the one flow where a
 * surprise is unforgivable, because the input is somebody's training history:
 * nothing is written until the preview has been read and a button pressed,
 * and if the write stops partway it says exactly where it stopped and offers
 * to carry on from there. There is no silent half-write.
 *
 * Everything runs under the user's own session, so RLS is in the path for
 * every insert. The file never leaves the device — it is read by the browser,
 * parsed by the browser, and only rows the user confirmed are sent.
 */

type Phase = 'idle' | 'reading' | 'preview' | 'writing' | 'done'

interface Progress {
  done: number
  total: number
}

export function HevyImport({
  userId,
  exercises,
  onImported,
  onCancel,
}: {
  userId: string
  /** The catalogue as it stands, for matching. */
  exercises: Exercise[]
  /** Called once something landed, so the caller can reload. */
  onImported: () => void
  onCancel: () => void
}) {
  const { t } = useLocale()
  const [phase, setPhase] = useState<Phase>('idle')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setPhase('reading')
    setError(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      const next = analyse(
        text,
        exercises.map((e) => e.name),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      setPlan(next)
      setPhase('preview')
    } catch {
      setError(t('import.error.read'))
      setPhase('idle')
    }
  }

  /**
   * Write the plan, one workout at a time, starting from `from`.
   *
   * Workout-at-a-time rather than one big batch is deliberate: it is the unit
   * a person recognises, so a failure can be reported as "142 of 156 came
   * across" instead of as an unknown fraction of a transaction. A workout
   * whose sets fail is deleted before reporting, so the boundary is always
   * between whole workouts and resuming can never double-write one.
   */
  async function run(startPlan: ImportPlan, from: number) {
    setPhase('writing')
    setError(null)

    // Unmatched lifts become custom exercises owned by this user. Created once,
    // up front: a name that fails here would otherwise fail on every workout
    // that mentions it.
    const byName = new Map(exercises.map((e) => [e.name.trim().toLowerCase(), e.id]))
    if (from === 0 && startPlan.unmatched.length > 0) {
      const { data, error: createError } = await supabase
        .from('exercises')
        .insert(
          startPlan.unmatched.map((name) => {
            const group = deriveMuscleGroup(name)
            return {
              name,
              muscle_group: group,
              equipment: deriveEquipment(name, group),
              is_custom: true,
              owner_id: userId,
            }
          }),
        )
        .select('id, name')
      if (createError) {
        setError(describeError(t('import.error.create_exercises'), createError))
        setPhase('preview')
        return
      }
      for (const row of (data ?? []) as { id: string; name: string }[]) {
        byName.set(row.name.trim().toLowerCase(), row.id)
      }
    } else if (from > 0) {
      // Resuming: the custom exercises already exist, so read them back rather
      // than creating a second copy of each.
      const { data } = await supabase.from('exercises').select('id, name')
      for (const row of (data ?? []) as { id: string; name: string }[]) {
        byName.set(row.name.trim().toLowerCase(), row.id)
      }
    }

    setProgress({ done: from, total: startPlan.workouts.length })

    for (let i = from; i < startPlan.workouts.length; i += 1) {
      const failure = await writeWorkout(startPlan.workouts[i], userId, byName, t)
      if (failure) {
        setError(failure)
        setProgress({ done: i, total: startPlan.workouts.length })
        setPhase('preview')
        if (i > from) onImported()
        return
      }
      setProgress({ done: i + 1, total: startPlan.workouts.length })
    }

    setPhase('done')
    onImported()
  }

  const imported = progress.done
  const canResume = phase === 'preview' && imported > 0

  return (
    <section className="flex flex-col gap-4 py-2">
      <div>
        <p className="kicker">Coming from Hevy</p>
        <h2 className="mt-1 text-[26px] font-medium tracking-tight">
          Bring your history with you.
        </h2>
        <p className="mt-2 text-sm text-muted">
          Every workout, every set, every personal record. Your first session in Wazn
          then opens with your own numbers on every row instead of a blank board.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-sm text-accent-300"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      {(phase === 'idle' || phase === 'reading') && (
        <>
          <div
            className="ring-edge bg-surface px-3 py-3"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <p className="kicker">{t('import.how')}</p>
            <ol className="mt-2 flex list-inside list-decimal flex-col gap-1 text-[13px] text-muted">
              <li>{t('import.step1')}</li>
              <li>{t('import.step2')}</li>
              <li>{t('import.step3')}</li>
            </ol>
            <p className="mt-2.5 text-[11px] text-muted">{t('import.privacy')}</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={phase === 'reading'}
            className="btn-base btn-hero press h-[60px] w-full text-[17px] disabled:opacity-45"
          >
            {phase === 'reading' ? t('import.reading') : t('import.choose')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-base btn-secondary h-12 w-full text-sm"
          >
            Not now
          </button>
        </>
      )}

      {phase === 'preview' && plan && (
        <Preview
          plan={plan}
          fileName={fileName}
          alreadyDone={imported}
          onConfirm={() => void run(plan, imported)}
          onCancel={() => {
            setPlan(null)
            setProgress({ done: 0, total: 0 })
            setPhase('idle')
          }}
          resuming={canResume}
        />
      )}

      {phase === 'writing' && (
        <div
          className="ring-edge bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="kicker">Bringing it across</p>
          <p className="tnum mt-1 text-figure">
            {formatCount(progress.done)} / {formatCount(progress.total)}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Keep this screen open. Nothing is lost if you leave — what has landed stays,
            and you can pick up where you stopped.
          </p>
        </div>
      )}

      {phase === 'done' && plan && (
        <>
          <div
            className="ring-edge border border-accent bg-surface px-3 py-3"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <p className="text-sm font-medium text-accent-300">Your history is in.</p>
            <p className="tnum mt-1 text-[13px] text-muted">
              {formatCount(plan.workouts.length)} workouts ·{' '}
              {formatCount(plan.setCount)} sets
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="btn-base btn-hero press h-[60px] w-full text-[17px]"
          >
            Start lifting
          </button>
        </>
      )}
    </section>
  )
}

/**
 * What will happen, before it happens.
 *
 * Counts, the date range, which lifts matched and which will be created — and
 * every problem the file has, stated rather than swallowed.
 */
function Preview({
  plan,
  fileName,
  alreadyDone,
  resuming,
  onConfirm,
  onCancel,
}: {
  plan: ImportPlan
  fileName: string | null
  alreadyDone: number
  resuming: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useLocale()
  const remaining = plan.workouts.length - alreadyDone

  if (plan.fatal) {
    return (
      <>
        <div
          className="ring-edge border border-accent bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="text-sm text-accent-300">{plan.fatal}</p>
          {fileName && <p className="mt-1 text-[11px] text-muted">{fileName}</p>}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="btn-base btn-secondary h-12 w-full text-sm"
        >
          Choose a different file
        </button>
      </>
    )
  }

  return (
    <>
      <div
        className="ring-edge bg-surface px-3 py-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <p className="kicker">
          {resuming ? t('import.found.resuming') : t('import.found')}
        </p>
        <div className="mt-2 flex items-stretch">
          <Figure value={formatCount(remaining)} label={t('import.workouts')} />
          <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
          <Figure value={formatCount(plan.setCount)} label={t('import.sets')} />
          <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
          <Figure
            value={formatCount(plan.matched.length + plan.unmatched.length)}
            label={t('import.exercises')}
          />
        </div>
        {plan.range && (
          <p className="mt-2.5 text-[13px] text-muted">
            {formatWorkoutDate(plan.range.from)} → {formatWorkoutDate(plan.range.to)}
          </p>
        )}
      </div>

      {plan.unmatched.length > 0 && (
        <div
          className="ring-edge bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="kicker">Will be added as your own exercises</p>
          <p className="mt-1.5 text-[13px] text-muted">
            {plan.unmatched.slice(0, 8).join(' · ')}
            {plan.unmatched.length > 8 &&
              ` · and ${formatCount(plan.unmatched.length - 8)} more`}
          </p>
          <p className="mt-2 text-[11px] text-muted">
            Nothing is dropped. Wazn has not seen these lifts before, so it makes them
            yours — you can rename them later.
          </p>
        </div>
      )}

      {plan.problems.length > 0 && (
        <div
          className="ring-edge bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="kicker">Worth knowing</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {plan.problems.map((problem) => (
              <li key={problem} className="text-[13px] text-muted">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        className="btn-base btn-hero press h-[60px] w-full text-[17px]"
      >
        {resuming
          ? t('import.resume', { count: formatCount(remaining) })
          : t('import.start', { count: formatCount(remaining) })}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn-base btn-secondary h-12 w-full text-sm"
      >
        Choose a different file
      </button>
    </>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
      <span className="tnum truncate text-figure">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  )
}

/**
 * One workout and its sets. Returns null on success, or a message.
 *
 * The workout is deleted if its sets fail, so the import boundary is always
 * between whole workouts — which is what makes resuming safe: a half-written
 * session can never be counted as done and then skipped.
 */
async function writeWorkout(
  planned: PlannedWorkout,
  userId: string,
  exerciseIds: Map<string, string>,
  t: (key: string, params?: Record<string, string>) => string,
): Promise<string | null> {
  const { data, error: workoutError } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      name: planned.name,
      started_at: planned.startedAt,
      ended_at: planned.endedAt,
    })
    .select('id')
    .single()

  if (workoutError || !data) {
    return describeError(t('import.error.create_workout'), workoutError)
  }
  const workoutId = (data as { id: string }).id

  const rows = planned.sets.flatMap((set) => {
    const exerciseId = exerciseIds.get(set.exerciseName.trim().toLowerCase())
    if (!exerciseId) return []
    return [
      {
        workout_id: workoutId,
        exercise_id: exerciseId,
        set_number: set.setNumber,
        weight_kg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        duration_seconds: set.durationSeconds,
        distance_meters: set.distanceMeters,
        set_type: set.setType,
        superset_group: set.supersetGroup,
      },
    ]
  })

  if (rows.length === 0) {
    // Nothing to put in it. A workout with no sets is not a workout — the same
    // rule the Log screen enforces when one is abandoned.
    await supabase.from('workouts').delete().eq('id', workoutId)
    return null
  }

  const { error: setsError } = await supabase.from('workout_sets').insert(rows)
  if (setsError) {
    // Roll the workout back so the boundary stays between whole sessions.
    await supabase.from('workouts').delete().eq('id', workoutId)
    return describeError(t('import.error.save_sets'), setsError)
  }

  return null
}
