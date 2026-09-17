import { useRef, useState } from 'react'
import { describeError, supabase } from '../lib/supabase'
import { afterCutoff, analyse, setRowsFor } from '../lib/hevy-import'
import type { ImportPlan, PlannedWorkout } from '../lib/hevy-import'
import { formatCount, formatWorkoutDate } from '../lib/format'
import type { Exercise } from '../lib/types'
import { deriveEquipment, deriveMuscleGroup } from '../lib/exercise-guess'
import { useLocale } from '../lib/locale-context'

type Phase = 'idle' | 'reading' | 'preview' | 'writing' | 'done'

interface Progress {
  done: number
  total: number
}

type Translate = (key: string, params?: Record<string, string>) => string

const normalise = (name: string): string => name.trim().toLowerCase()

export function HevyImport({
  userId,
  exercises,
  onImported,
  onCancel,
}: {
  userId: string
  exercises: Exercise[]
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
  const stopped = useRef(false)
  const [cutoff, setCutoff] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setPhase('reading')
    setError(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const { data: logged, error: loggedError } = await supabase
        .from('workouts')
        .select('started_at')
        .order('started_at', { ascending: false })

      // A failed history read must never be treated as an empty history. Doing
      // so disables the overlap/re-import guard and can make a repeat import
      // look like the user's first one.
      if (loggedError) throw loggedError

      const existing = ((logged ?? []) as { started_at: string }[]).map(
        (workout) => workout.started_at,
      )
      const next = analyse(
        text,
        exercises.map((exercise) => exercise.name),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        existing,
      )

      setPlan(next)
      setCutoff(next.overlapping > 0 ? next.latestLogged : null)
      setProgress({ done: 0, total: 0 })
      setPhase('preview')
    } catch {
      setError(t('import.error.read'))
      setPhase('idle')
    }
  }

  async function run(startPlan: ImportPlan, from: number) {
    setPhase('writing')
    setError(null)
    stopped.current = false

    const byName = new Map(exercises.map((exercise) => [normalise(exercise.name), exercise.id]))

    // Read the user's visible catalogue before every run/resume. This makes a
    // resume independent of how far the previous run got and prevents a retry
    // from creating the same custom exercise twice.
    const { data: storedExercises, error: exerciseReadError } = await supabase
      .from('exercises')
      .select('id, name')

    if (exerciseReadError) {
      setError(describeError(t('import.error.create_exercises'), exerciseReadError))
      setPhase('preview')
      return
    }

    for (const row of (storedExercises ?? []) as { id: string; name: string }[]) {
      byName.set(normalise(row.name), row.id)
    }

    const missing = startPlan.unmatched.filter((name) => !byName.has(normalise(name)))
    if (missing.length > 0) {
      const { data, error: createError } = await supabase
        .from('exercises')
        .insert(
          missing.map((name) => {
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
        byName.set(normalise(row.name), row.id)
      }
    }

    setProgress({ done: from, total: startPlan.workouts.length })

    for (let index = from; index < startPlan.workouts.length; index += 1) {
      if (stopped.current) {
        setProgress({ done: index, total: startPlan.workouts.length })
        setPhase('preview')
        if (index > from) onImported()
        return
      }

      const failure = await writeWorkout(startPlan.workouts[index], userId, byName, t)
      if (failure) {
        setError(failure)
        setProgress({ done: index, total: startPlan.workouts.length })
        setPhase('preview')
        if (index > from) onImported()
        return
      }

      setProgress({ done: index + 1, total: startPlan.workouts.length })
    }

    setPhase('done')
    onImported()
  }

  const imported = progress.done
  const canResume = phase === 'preview' && imported > 0
  const shown = plan ? afterCutoff(plan, cutoff) : null

  return (
    <section className="flex flex-col gap-4 py-2">
      <div>
        <p className="kicker">Coming from Hevy</p>
        <h2 className="mt-1 text-fig font-medium tracking-tight">Bring your history with you.</h2>
        <p className="mt-2 text-body text-muted">
          Every workout, every set, every personal record. Your first session in Wazn
          then opens with your own numbers on every row instead of a blank board.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-body text-accent-300"
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
            <ol className="mt-2 flex list-inside list-decimal flex-col gap-1 text-body text-muted">
              <li>{t('import.step1')}</li>
              <li>{t('import.step2')}</li>
              <li>{t('import.step3')}</li>
            </ol>
            <p className="mt-2.5 text-body text-muted">{t('import.privacy')}</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={phase === 'reading'}
            className="btn-base btn-hero press h-[60px] w-full btn-text disabled:opacity-45"
          >
            {phase === 'reading' ? t('import.reading') : t('import.choose')}
          </button>
          <button type="button" onClick={onCancel} className="btn-base btn-secondary h-12 w-full text-body">
            Not now
          </button>
        </>
      )}

      {phase === 'preview' && plan && shown && (
        <Preview
          plan={shown}
          fileName={fileName}
          alreadyDone={imported}
          cutoff={cutoff}
          latestLogged={plan.latestLogged}
          skipped={plan.workouts.length - shown.workouts.length}
          onCutoff={setCutoff}
          onConfirm={() => void run(shown, imported)}
          onCancel={() => {
            setPlan(null)
            setCutoff(null)
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
          <p className="tnum mt-1 text-num">
            {formatCount(progress.done)} / {formatCount(progress.total)}
          </p>
          <p className="mt-1 text-body text-muted">
            Nothing is lost if you stop — what has landed stays, and you can pick up
            where you left off.
          </p>
          <button
            type="button"
            onClick={() => {
              stopped.current = true
            }}
            className="btn-base btn-secondary mt-3 h-12 w-full text-body"
          >
            Stop
          </button>
        </div>
      )}

      {phase === 'done' && plan && (
        <>
          <div
            className="ring-edge border border-accent bg-surface px-3 py-3"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <p className="text-label font-medium text-accent-300">Your history is in.</p>
            <p className="tnum mt-1 text-meta text-muted">
              {formatCount(plan.workouts.length)} workouts · {formatCount(plan.setCount)} sets
            </p>
          </div>
          <button type="button" onClick={onCancel} className="btn-base btn-hero press h-[60px] w-full btn-text">
            Start lifting
          </button>
        </>
      )}
    </section>
  )
}

function Preview({
  plan,
  fileName,
  alreadyDone,
  resuming,
  cutoff,
  latestLogged,
  skipped,
  onCutoff,
  onConfirm,
  onCancel,
}: {
  plan: ImportPlan
  fileName: string | null
  alreadyDone: number
  resuming: boolean
  cutoff: string | null
  latestLogged: string | null
  skipped: number
  onCutoff: (next: string | null) => void
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
          <p className="text-body text-accent-300">{plan.fatal}</p>
          {fileName && <p className="mt-1 text-meta text-muted">{fileName}</p>}
        </div>
        <button type="button" onClick={onCancel} className="btn-base btn-secondary h-12 w-full text-body">
          Choose a different file
        </button>
      </>
    )
  }

  return (
    <>
      <div className="ring-edge bg-surface px-3 py-3" style={{ borderRadius: 'var(--radius-md)' }}>
        <p className="kicker">{resuming ? t('import.found.resuming') : t('import.found')}</p>
        <div className="mt-2 flex items-stretch">
          <Figure value={formatCount(remaining)} label={t('import.workouts')} />
          <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
          <Figure value={formatCount(plan.setCount)} label={t('import.sets')} />
          <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
          <Figure value={formatCount(plan.matched.length + plan.unmatched.length)} label={t('import.exercises')} />
        </div>
        {plan.range && (
          <p className="mt-2.5 text-meta text-muted">
            {formatWorkoutDate(plan.range.from)} → {formatWorkoutDate(plan.range.to)}
          </p>
        )}
      </div>

      {latestLogged && (
        <div className="ring-edge bg-surface px-3 py-3" style={{ borderRadius: 'var(--radius-md)' }}>
          <p className="kicker">Already in your log</p>
          <p className="mt-2 text-body text-muted">
            Your last logged workout was {formatWorkoutDate(latestLogged)}.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={cutoff !== null}
            aria-disabled={resuming}
            disabled={resuming}
            onClick={() => onCutoff(cutoff === null ? latestLogged : null)}
            className="btn-base btn-secondary press mt-2.5 flex h-12 w-full items-center gap-3 px-3 text-start text-body disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span
              aria-hidden="true"
              className={`grid h-5 w-5 shrink-0 place-items-center border ${
                cutoff !== null ? 'border-accent bg-accent text-accent-ink' : 'border-line'
              }`}
              style={{ borderRadius: 'var(--radius-check)' }}
            >
              {cutoff !== null ? '✓' : ''}
            </span>
            <span className="flex-1">Only bring across what is newer</span>
          </button>
          {resuming && (
            <p className="mt-2 text-body text-muted">
              This choice is locked while you resume so the remaining workout list cannot shift.
            </p>
          )}
          {cutoff !== null && skipped > 0 && (
            <p className="mt-2 text-body text-muted">
              {formatCount(skipped)} older session{skipped === 1 ? '' : 's'} in this file will be left out.
            </p>
          )}
          {cutoff === null && (
            <p className="mt-2 text-body text-accent-300">
              The whole file will be imported. Sessions you already have may be skipped by the duplicate guard.
            </p>
          )}
        </div>
      )}

      {plan.unmatched.length > 0 && (
        <div className="ring-edge bg-surface px-3 py-3" style={{ borderRadius: 'var(--radius-md)' }}>
          <p className="kicker">Will be added as your own exercises</p>
          <p className="mt-1.5 text-body text-muted">
            {plan.unmatched.slice(0, 8).join(' · ')}
            {plan.unmatched.length > 8 && ` · and ${formatCount(plan.unmatched.length - 8)} more`}
          </p>
          <p className="mt-2 text-body text-muted">
            Nothing is dropped. Wazn has not seen these lifts before, so it makes them yours — you can rename them later.
          </p>
        </div>
      )}

      {plan.problems.length > 0 && (
        <div className="ring-edge bg-surface px-3 py-3" style={{ borderRadius: 'var(--radius-md)' }}>
          <p className="kicker">Worth knowing</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {plan.problems.map((problem) => (
              <li key={problem} className="text-body text-muted">{problem}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={onConfirm} className="btn-base btn-hero press h-[60px] w-full btn-text">
        {resuming
          ? t('import.resume', { count: formatCount(remaining) })
          : t('import.start', { count: formatCount(remaining) })}
      </button>
      <button type="button" onClick={onCancel} className="btn-base btn-secondary h-12 w-full text-body">
        Choose a different file
      </button>
    </>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
      <span className="tnum truncate text-num">{value}</span>
      <span className="text-label text-muted">{label}</span>
    </div>
  )
}

async function writeWorkout(
  planned: PlannedWorkout,
  userId: string,
  exerciseIds: Map<string, string>,
  t: Translate,
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

  if (workoutError) {
    // workouts_user_started_at_key is the import idempotency key. A duplicate
    // means this session already landed, so continuing is safer than turning a
    // repeat import into a fatal error.
    if ((workoutError as { code?: string }).code === '23505') return null
    return describeError(t('import.error.create_workout'), workoutError)
  }

  if (!data) return t('import.error.create_workout')
  const workoutId = (data as { id: string }).id
  const rows = setRowsFor(planned, workoutId, exerciseIds)

  // Never let unresolved exercise ids turn into a green progress bar. If even
  // one planned set cannot be mapped, roll the whole workout back so the resume
  // boundary remains between complete workouts.
  if (rows.length !== planned.sets.length) {
    await supabase.from('workouts').delete().eq('id', workoutId)
    return t('import.error.save_sets')
  }

  if (rows.length === 0) {
    await supabase.from('workouts').delete().eq('id', workoutId)
    return null
  }

  const { error: setsError } = await supabase.from('workout_sets').insert(rows)
  if (setsError) {
    await supabase.from('workouts').delete().eq('id', workoutId)
    return describeError(t('import.error.save_sets'), setsError)
  }

  return null
}
