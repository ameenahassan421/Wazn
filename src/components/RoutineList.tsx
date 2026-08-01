import type { Routine } from '../lib/types'

/**
 * Routines on the idle Log screen, above "Start empty workout".
 *
 * Not a fourth tab. CLAUDE.md fixes the app at three screens, and a routine is
 * a way to *start* a workout rather than a place you go — putting it here means
 * the thing you tap to begin is the thing you were already looking at. See
 * DECISIONS.md.
 */
export function RoutineList({
  routines,
  busyId,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
  onNew,
}: {
  routines: Routine[]
  busyId: string | null
  onStart: (routine: Routine) => void
  onEdit: (routine: Routine) => void
  onDuplicate: (routine: Routine) => void
  onDelete: (routine: Routine) => void
  onNew: () => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-muted">Routines</h2>
        <button
          type="button"
          onClick={onNew}
          className="h-12 rounded-md border border-line px-3 text-sm font-semibold"
        >
          New
        </button>
      </div>

      {routines.length === 0 ? (
        <p className="text-sm text-muted">
          No routines yet. Build one and your usual session is two taps away.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((routine) => (
            <li
              key={routine.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface ps-3"
            >
              <button
                type="button"
                onClick={() => onStart(routine)}
                disabled={busyId !== null}
                className="h-14 flex-1 truncate text-start text-base font-semibold disabled:opacity-60"
              >
                {busyId === routine.id ? 'Starting…' : routine.name}
              </button>
              <button
                type="button"
                onClick={() => onEdit(routine)}
                aria-label={`Edit ${routine.name}`}
                className="h-14 w-12 text-sm text-muted"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(routine)}
                aria-label={`Duplicate ${routine.name}`}
                className="h-14 w-12 text-sm text-muted"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => onDelete(routine)}
                aria-label={`Delete ${routine.name}`}
                className="h-14 w-10 pe-3 text-sm text-muted"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
