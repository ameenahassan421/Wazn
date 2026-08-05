import { useMemo, useRef, useState } from 'react'
import type { Exercise, ExerciseUsageRow } from '../lib/types'
import { ExerciseThumb } from './ExerciseThumb'
import { IconBack } from './icons'
import { NewExercise } from './NewExercise'

/**
 * Recently used first, then most used, then everything else alphabetically.
 * Search filters the full catalogue, with name-prefix matches on top.
 */
function orderExercises(
  exercises: Exercise[],
  usage: Map<string, ExerciseUsageRow>,
): Exercise[] {
  return [...exercises].sort((a, b) => {
    const ua = usage.get(a.id)
    const ub = usage.get(b.id)
    if (ua && ub) {
      const byRecency =
        new Date(ub.last_used ?? 0).getTime() - new Date(ua.last_used ?? 0).getTime()
      if (byRecency !== 0) return byRecency
      if (ub.set_count !== ua.set_count) return ub.set_count - ua.set_count
    } else if (ua) {
      return -1
    } else if (ub) {
      return 1
    }
    return a.name.localeCompare(b.name)
  })
}

export function ExercisePicker({
  exercises,
  usage,
  onPick,
  onCancel,
  onCreated,
}: {
  exercises: Exercise[]
  usage: Map<string, ExerciseUsageRow>
  onPick: (exercise: Exercise) => void
  onCancel: () => void
  /** Adds the new exercise to the caller's catalogue. Omit to hide the
   *  create affordance — Progress, for instance, is a reading surface. */
  onCreated?: (exercise: Exercise) => void
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ordered = useMemo(() => orderExercises(exercises, usage), [exercises, usage])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ordered
    const matches = ordered.filter((e) => e.name.toLowerCase().includes(q))
    return matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return ordered.indexOf(a) - ordered.indexOf(b)
    })
  }, [ordered, query])

  if (creating && onCreated) {
    return (
      <NewExercise
        initialName={query.trim()}
        onCancel={() => setCreating(false)}
        onCreated={(exercise) => {
          setCreating(false)
          // Straight into logging it. Somebody who just typed a name and two
          // categories wanted to log a set, not to admire a catalogue entry.
          onCreated(exercise)
          onPick(exercise)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 flex items-center gap-1 border-b border-line bg-ink py-3">
        {/* A real back control where every phone puts one, not a "Cancel"
            hidden past the keyboard's reach at the end of the row. */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="btn-base btn-quiet -ms-2 h-12 w-12 shrink-0"
        >
          <IconBack />
        </button>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 flex-1 rounded-lg border border-line bg-surface px-3 text-start text-base outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {results.length === 0 ? (
        <div className="py-8">
          <p className="text-sm text-muted">
            No exercise matches “{query.trim()}”. Check the spelling — the catalogue
            uses names like “Bench Press (Barbell)”.
          </p>
          {/* The moment the gap is felt is the moment to offer the fix: a
              search that found nothing already IS the name of the thing. */}
          {onCreated && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-base btn-hero mt-4 h-[60px] w-full text-[17px]"
            >
              Add “{query.trim()}”
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="flex min-h-[76px] w-full items-center gap-3 py-1.5 text-start"
              >
                <ExerciseThumb exercise={exercise} size={64} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">
                    {exercise.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {exercise.muscle_group} · {exercise.equipment}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {onCreated && (
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-14 w-full items-center py-3 text-start text-sm text-accent"
              >
                + New exercise
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
