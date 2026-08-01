import { useMemo, useRef, useState } from 'react'
import type { Exercise, ExerciseUsageRow } from '../lib/types'

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
}: {
  exercises: Exercise[]
  usage: Map<string, ExerciseUsageRow>
  onPick: (exercise: Exercise) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
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

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 flex items-center gap-2 border-b border-line bg-ink py-3">
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
        <button
          type="button"
          onClick={onCancel}
          className="h-12 rounded-lg px-3 text-sm text-muted"
        >
          Cancel
        </button>
      </div>

      {results.length === 0 ? (
        <p className="py-8 text-sm text-muted">
          No exercise matches “{query.trim()}”. Check the spelling — the catalogue
          uses names like “Bench Press (Barbell)”.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="flex h-14 w-full items-center gap-3 text-start"
              >
                <span className="flex-1 truncate text-base">{exercise.name}</span>
                <span className="text-xs text-muted">{exercise.muscle_group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
