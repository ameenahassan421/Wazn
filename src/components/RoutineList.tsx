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
        <h2 className="kicker flex-1">Routines</h2>
        <button
          type="button"
          onClick={onNew}
          className="btn-base btn-secondary h-12 px-4 text-sm"
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
          {routines.map((routine) => {
            const busy = busyId === routine.id
            return (
              <li
                key={routine.id}
                className="ring-edge flex items-center bg-surface ps-[13px]"
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                <button
                  type="button"
                  onClick={() => onStart(routine)}
                  disabled={busyId !== null}
                  className={`h-[52px] flex-1 truncate text-start text-[15px] font-medium ${
                    busy ? 'text-accent' : ''
                  }`}
                >
                  {busy ? 'Starting…' : routine.name}
                </button>
                {/* The row's own action is starting the workout; editing it is
                    housekeeping, so those three stay quiet and step back
                    entirely while a start is in flight. */}
                <span
                  className="flex items-center"
                  style={busyId !== null ? { opacity: 0.45 } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => onEdit(routine)}
                    disabled={busyId !== null}
                    aria-label={`Edit ${routine.name}`}
                    className="btn-base btn-quiet h-[52px] px-2 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate(routine)}
                    disabled={busyId !== null}
                    aria-label={`Duplicate ${routine.name}`}
                    className="btn-base btn-quiet h-[52px] px-2 text-sm"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(routine)}
                    disabled={busyId !== null}
                    aria-label={`Delete ${routine.name}`}
                    className="btn-base btn-quiet h-[52px] w-10 pe-[13px] text-sm"
                  >
                    ×
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
