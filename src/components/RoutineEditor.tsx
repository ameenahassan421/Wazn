import { useState } from 'react'
import type { Exercise } from '../lib/types'
import type { RoutineDetail, RoutineDraft } from '../lib/routines'
import { ExercisePicker } from './ExercisePicker'
import { ExerciseThumb } from './ExerciseThumb'
import { IconBack } from './icons'

/**
 * Build or edit a routine: name, ordered exercises, planned sets per exercise.
 *
 * Weight is deliberately not prescribed here. Stage 1 says sets are
 * "pre-filled from last performance" — a routine that hard-codes 60 kg is
 * wrong the week after you progress, and then it is lying to you mid-workout.
 * Reps are prescribed because a 5x5 and a 3x12 are different routines.
 */
interface DraftExercise {
  exerciseId: string
  sets: { reps: number | null }[]
}

function toDraftExercises(routine: RoutineDetail | null): DraftExercise[] {
  if (!routine) return []
  return routine.exercises.map((e) => ({
    exerciseId: e.exercise_id,
    sets: e.sets.map((s) => ({ reps: s.reps })),
  }))
}

export function RoutineEditor({
  routine,
  exercises,
  saving,
  onSave,
  onCancel,
}: {
  routine: RoutineDetail | null
  exercises: Exercise[]
  saving: boolean
  onSave: (draft: RoutineDraft) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(routine?.name ?? '')
  const [items, setItems] = useState<DraftExercise[]>(() => toDraftExercises(routine))
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = new Map(exercises.map((e) => [e.id, e]))

  function addExercise(exercise: Exercise) {
    // Three sets is the common case and saves two taps on every exercise.
    setItems((prev) => [
      ...prev,
      {
        exerciseId: exercise.id,
        sets: [{ reps: null }, { reps: null }, { reps: null }],
      },
    ])
    setPicking(false)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    setItems((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function setSetCount(index: number, count: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        const sets = [...it.sets]
        while (sets.length < count) sets.push({ reps: sets.at(-1)?.reps ?? null })
        return { ...it, sets: sets.slice(0, Math.max(1, count)) }
      }),
    )
  }

  function setReps(index: number, reps: string) {
    const parsed = Number.parseInt(reps, 10)
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, sets: it.sets.map(() => ({ reps: value })) } : it,
      ),
    )
  }

  function submit() {
    if (name.trim() === '') {
      setError('Give the routine a name — you will be picking it from a list.')
      return
    }
    if (items.length === 0) {
      setError('Add at least one exercise.')
      return
    }
    setError(null)
    onSave({
      name: name.trim(),
      exercises: items.map((it) => ({
        exerciseId: it.exerciseId,
        sets: it.sets.map((s) => ({ reps: s.reps, setType: 'normal' as const })),
      })),
    })
  }

  if (picking) {
    return (
      <ExercisePicker
        exercises={exercises}
        usage={new Map()}
        onPick={addExercise}
        onCancel={() => setPicking(false)}
      />
    )
  }

  return (
    <section className="flex flex-col gap-3 pb-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack />
        </button>
        <h2 className="flex-1 text-base font-semibold">
          {routine ? 'Edit routine' : 'New routine'}
        </h2>
      </div>

      <div>
        <label htmlFor="routine-name" className="text-xs text-muted">
          Name
        </label>
        <input
          id="routine-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Upper A"
          className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-start text-base outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => {
            const exercise = byId.get(item.exerciseId)
            return (
              <li
                key={`${item.exerciseId}-${index}`}
                className="rounded-lg border border-line bg-surface px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  {exercise && <ExerciseThumb exercise={exercise} />}
                  <span className="flex-1 truncate text-base">
                    {exercise?.name ?? 'Exercise'}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                    className="h-12 w-10 rounded-md border border-line text-sm"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                    className="h-12 w-10 rounded-md border border-line text-sm"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems((p) => p.filter((_, i) => i !== index))}
                    aria-label={`Remove ${exercise?.name ?? 'exercise'}`}
                    className="h-12 w-10 rounded-md px-1 text-sm text-muted"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-muted" htmlFor={`sets-${index}`}>
                    Sets
                  </label>
                  <input
                    id={`sets-${index}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={item.sets.length}
                    onChange={(e) =>
                      setSetCount(index, Number.parseInt(e.target.value, 10))
                    }
                    className="tnum h-12 w-16 rounded-md border border-line bg-ink px-2 text-start text-base outline-none focus:border-accent"
                  />
                  <label className="text-xs text-muted" htmlFor={`reps-${index}`}>
                    Reps
                  </label>
                  <input
                    id={`reps-${index}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={item.sets[0]?.reps ?? ''}
                    onChange={(e) => setReps(index, e.target.value)}
                    placeholder="—"
                    className="tnum h-12 w-16 rounded-md border border-line bg-ink px-2 text-start text-base outline-none placeholder:text-muted focus:border-accent"
                  />
                  <span className="ms-auto text-xs text-muted">
                    weight from last time
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="h-12 w-full rounded-lg border border-line text-base font-semibold"
      >
        Add exercise
      </button>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="h-12 w-full rounded-lg bg-accent text-base font-bold text-accent-ink disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save routine'}
      </button>
    </section>
  )
}
